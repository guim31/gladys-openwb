// -----------------------------------------------------------------------------
// The hub: one MQTT connection to the broker of openWB, the state it feeds,
// and everything Gladys sees of it — devices, states, connection status,
// scene events, commands.
//
// openWB publishes every value as a retained topic: on (re)connection the
// broker replays the whole state at once, then only the changes (a control
// cycle every 10 s). Messages are folded into the state and processed after a
// short quiet time (processDelay, processMaxWait at most), so a burst of
// topics gives one structure check, one batch of states and one look for
// scene events.
//
// Commands follow openWB's own recipe (simpleAPI/simpleAPI_mqtt.py of
// openWB/core): the active charging profile of the chargepoint, read from
// `openWB/chargepoint/<id>/set/charge_template`, is modified and published to
// `openWB/set/chargepoint/<id>/set/charge_template`. openWB validates it and
// publishes it back: that echo is the confirmation. Not retained, so a command
// sent while openWB is down is not applied hours later.
// -----------------------------------------------------------------------------

import { randomBytes } from 'node:crypto';
import { createLogger } from '@gladysassistant/integration-sdk';
import mqtt from 'mqtt';
import { connectionKey } from './config.js';
import {
  buildDevices,
  buildStates,
  chargepointIds,
  parseExternalId,
  structureOf,
} from './devices.js';
import { ActionFailure } from './errors.js';
import { SessionTracker, TRIGGERS } from './events.js';
import {
  CURRENT,
  MODES,
  OpenWbState,
  STOP,
  SUBSCRIPTIONS,
  chargepointName,
  instantCurrentOf,
  modeOf,
  sessionEnergyOf,
  socOf,
} from './openwb/model.js';
import { ProblemLog } from './problems.js';
import { MODE_LABELS, STATUS, failure, modeSetMessage, testMessage } from './texts.js';

const logger = createLogger({ name: 'openwb' });

export const WIDGET_KEY = 'openwb';

export const DEFAULT_TIMINGS = {
  processDelay: 300,
  processMaxWait: 2_000,
  // Connected, but no openWB topic after this: not the broker of an openWB 2.
  dataTimeout: 15_000,
  // Publish and openWB's echo; two queued commands stay within the 25 s action timeout.
  confirmTimeout: 10_000,
  tickInterval: 30_000,
  heartbeat: 6 * 3600_000,
  reconnectPeriod: 10_000,
  connectTimeout: 10_000,
  sessionQuiet: undefined,
};

export class Hub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake)
   * @param {Function} [options.connect] mqtt.connect (a fake in the tests)
   * @param {object} [options.timings]
   * @param {() => number} [options.now]
   */
  constructor({ gladys, connect, timings, now }) {
    this.gladys = gladys;
    this.connect = connect ?? mqtt.connect;
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.state = new OpenWbState();
    this.tracker = new SessionTracker({ quietMs: this.timings.sessionQuiet });
    this.problems = new ProblemLog(logger);
    this.config = null;
    this.client = null;
    this.connected = false;
    this.structure = null;
    this.publishedStructure = '';
    // Energy of the last session per chargepoint (Wh): openWB resets its log on unplug.
    this.sessions = new Map();
    this.status = 'starting';
    this.lastStatus = '';
    this.processTimer = null;
    this.processFirstAt = null;
    this.dataTimer = null;
    this.tickTimer = null;
    this.waiters = new Set();
    this.queues = new Map();
    this.stopped = false;
  }

  get language() {
    return this.config?.language ?? 'fr';
  }

  async start(config) {
    this.config = config;
    this.tickTimer = setInterval(() => this.#tick(), this.timings.tickInterval);
    this.tickTimer.unref?.();
    await this.#open();
  }

  async reconfigure(config) {
    const previous = this.config;
    this.config = config;
    if (connectionKey(config) !== connectionKey(previous)) {
      logger.info('Configuration changed: reconnecting to openWB');
      await this.#close();
      this.state.reset();
      this.structure = null;
      this.status = 'starting';
      await this.#open();
      return;
    }
    if (config.allow_control !== previous.allow_control) {
      this.refreshWidget();
    }
    if (config.language !== previous.language && this.structure) {
      await this.publishDevices();
      this.gladys.forgetPublishedStates?.();
      await this.flush();
    }
  }

  /** Gladys reconnected (it may have restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates?.();
    this.lastStatus = '';
    this.publishedStructure = '';
    await this.reconfigure(config);
    await this.publishDevices();
    await this.flush();
    // Every status, not only "online": a restarted Gladys knows none.
    await this.#setStatus(this.status === 'starting' ? 'unreachable' : this.status);
    await this.#updateStatus();
  }

  async stop() {
    this.stopped = true;
    clearInterval(this.tickTimer);
    clearTimeout(this.processTimer);
    await this.#close();
  }

  // --- MQTT -----------------------------------------------------------------

  async #open() {
    if (!this.config.host) {
      await this.#setStatus('no_host');
      return;
    }
    const { host, port, tls, username, password } = this.config;
    const client = this.connect({
      host,
      port,
      protocol: tls ? 'mqtts' : 'mqtt',
      // openWB serves a self-signed certificate on 8883.
      rejectUnauthorized: false,
      ...(username ? { username } : {}),
      ...(password ? { password } : {}),
      clientId: `gladys-openwb-${randomBytes(4).toString('hex')}`,
      clean: true,
      reconnectPeriod: this.timings.reconnectPeriod,
      // A command published offline must fail now, not be sent on reconnection.
      queueQoSZero: false,
      connectTimeout: this.timings.connectTimeout,
    });
    this.client = client;
    const where = `${host}:${port}`;

    client.on('connect', () => {
      if (this.client !== client) {
        return;
      }
      this.connected = true;
      if (!this.problems.recover('broker', `Connected again to the openWB broker at ${where}`)) {
        logger.info(`Connected to the openWB broker at ${where}`);
      }
      // The retained topics are replayed in full: start from a clean state.
      this.state.reset();
      this.tracker.reset();
      client.subscribe(SUBSCRIPTIONS, { qos: 0 }, (err) => {
        if (err) {
          this.problems.fail('subscribe', `Cannot subscribe to openWB: ${err.message}`);
        } else {
          this.problems.recover('subscribe', 'Subscribed to openWB again');
        }
      });
      clearTimeout(this.dataTimer);
      this.dataTimer = setTimeout(() => {
        if (this.state.messages === 0) {
          this.problems.fail('data', `No openWB 2.x topic on the broker at ${where}`);
          this.#setStatus('no_data');
        }
      }, this.timings.dataTimeout);
      this.dataTimer.unref?.();
    });

    client.on('message', (topic, payload) => {
      if (this.client !== client) {
        return;
      }
      if (this.state.apply(topic, payload)) {
        this.#settleWaiters();
        this.#schedule();
      }
    });

    client.on('error', (err) => {
      if (this.client !== client) {
        return;
      }
      // mqtt.js: 4 bad user name or password, 5 not authorized.
      const refused = err?.code === 4 || err?.code === 5 || err?.code === 134 || err?.code === 135;
      this.problems.fail(
        'broker',
        refused
          ? `The openWB broker at ${where} refused the credentials`
          : `openWB broker at ${where}: ${err?.message ?? err}`,
      );
      if (refused) {
        this.#setStatus('refused');
      }
    });

    client.on('close', () => {
      if (this.client !== client || this.stopped) {
        return;
      }
      const wasConnected = this.connected;
      this.connected = false;
      this.tracker.reset();
      clearTimeout(this.dataTimer);
      if (wasConnected) {
        this.problems.fail('broker', `Lost the connection to the openWB broker at ${where}`);
      }
      if (this.status !== 'refused' || wasConnected) {
        this.#setStatus('unreachable');
      }
    });
  }

  async #close() {
    clearTimeout(this.dataTimer);
    const client = this.client;
    this.client = null;
    this.connected = false;
    for (const waiter of this.waiters) {
      waiter.reject(new ActionFailure(failure('not_connected')));
    }
    this.waiters.clear();
    if (client) {
      await new Promise((resolve) => client.end(true, {}, () => resolve()));
    }
  }

  // --- Processing -------------------------------------------------------------

  #schedule() {
    const now = this.now();
    this.processFirstAt ??= now;
    clearTimeout(this.processTimer);
    const wait = Math.max(
      0,
      Math.min(this.timings.processDelay, this.processFirstAt + this.timings.processMaxWait - now),
    );
    this.processTimer = setTimeout(() => {
      this.processFirstAt = null;
      this.process().catch((err) => logger.error('Processing failed', err));
    }, wait);
    this.processTimer.unref?.();
  }

  /** Fold what arrived: waiters, structure, sessions, scene events, states, status. */
  async process() {
    if (this.processing) {
      this.processAgain = true;
      return;
    }
    this.processing = true;
    try {
      do {
        this.processAgain = false;
        await this.#processOnce();
      } while (this.processAgain && !this.stopped);
    } finally {
      this.processing = false;
    }
  }

  async #processOnce() {
    // Confirmations first: they must not wait for the calls to Gladys.
    this.#settleWaiters();
    const structure = structureOf(this.state, this.structure);
    this.structure = structure;
    if (JSON.stringify(structure) !== this.publishedStructure) {
      await this.publishDevices();
    }
    for (const [id, cp] of this.state.chargepoints) {
      const energy = sessionEnergyOf(cp);
      if (cp.plugged && energy !== null) {
        this.sessions.set(id, energy);
      }
    }
    this.#fire(this.tracker.update(this.#views(), this.now()));
    await this.flush();
    await this.#updateStatus();
  }

  #settleWaiters() {
    for (const waiter of [...this.waiters]) {
      if (waiter.done()) {
        this.waiters.delete(waiter);
        waiter.resolve();
      }
    }
  }

  #tick() {
    if (!this.connected) {
      return;
    }
    this.#fire(this.tracker.tick(this.#views(), this.now()));
    // Heartbeat: publishChangedStates re-sends values older than `heartbeat`.
    this.flush().catch(() => {});
  }

  #views() {
    return this.state.chargepointIds().map((id) => {
      const cp = this.state.chargepoints.get(id);
      return {
        id,
        name: chargepointName(cp),
        plugged: cp.plugged,
        charging: cp.charging,
        vehicle: cp.vehicleName ?? '',
        energy: sessionEnergyOf(cp) ?? 0,
        soc: socOf(cp),
        mode: modeOf(cp),
      };
    });
  }

  async publishDevices() {
    if (!this.structure) {
      return;
    }
    const devices = buildDevices(this.gladys, this.structure, this.language);
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.publishedStructure = JSON.stringify(this.structure);
      this.problems.recover('devices');
    } catch (err) {
      this.problems.fail('devices', `Cannot publish the devices: ${err.message}`, 'error');
    }
  }

  async flush() {
    if (!this.structure) {
      return;
    }
    const states = buildStates(this.gladys, this.state, this.structure, this.sessions);
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeat });
      this.problems.recover('states', 'States published again');
    } catch (err) {
      this.problems.fail('states', `Cannot publish the states: ${err.message}`);
    }
  }

  /** onPoll: the devices are pushed; this only re-sends the current values. */
  async poll() {
    await this.flush();
  }

  async onDeviceCreated(device) {
    if (typeof device?.external_id === 'string') {
      this.gladys.forgetPublishedStates?.(device.external_id);
    }
    await this.flush();
    this.refreshWidget();
  }

  refreshWidget() {
    Promise.resolve()
      .then(() => this.gladys.requestWidgetRefresh?.(WIDGET_KEY))
      .catch(() => {});
  }

  async #updateStatus() {
    if (this.connected && this.state.messages > 0) {
      this.problems.recover('data');
      await this.#setStatus('online');
    }
  }

  async #setStatus(status) {
    this.status = status;
    if (status === this.lastStatus) {
      return;
    }
    this.lastStatus = status;
    this.refreshWidget();
    try {
      if (status === 'online') {
        await this.gladys.setConnectionStatus(true);
      } else {
        await this.gladys.setConnectionStatus(false, STATUS[status]);
      }
    } catch (err) {
      logger.debug(`Cannot set the connection status: ${err.message}`);
    }
  }

  // --- Scene events ------------------------------------------------------------

  /** Name of a device as the user sees it in Gladys (renamed or not). */
  deviceName(externalId, fallback) {
    const created = (this.gladys.devices ?? []).find((d) => d.external_id === externalId);
    return created?.name ?? fallback;
  }

  #fire(events) {
    if (events.length > 0) {
      this.refreshWidget();
    }
    for (const event of events) {
      const { view } = event;
      const device = chargepointIds(this.gladys, view.id).device;
      const data = {
        device,
        chargepoint: this.deviceName(device, view.name),
        vehicle: view.vehicle ?? '',
      };
      const energy = Math.round((view.energy ?? 0) / 10) / 100;
      switch (event.type) {
        case 'started':
          data.mode = view.mode ?? '';
          break;
        case 'finished':
          data.energy_kwh = energy;
          data.soc = view.soc === null || view.soc === undefined ? -1 : Math.round(view.soc);
          break;
        case 'disconnected':
          data.energy_kwh = energy;
          break;
        default:
          break;
      }
      const key = TRIGGERS[event.type];
      logger.debug(`${view.name}: ${key}${data.vehicle ? ` (${data.vehicle})` : ''}`);
      this.gladys
        .publishSceneEvent(key, data)
        .catch((err) => logger.warn(`Cannot fire ${key}: ${err.message}`));
    }
  }

  // --- Commands --------------------------------------------------------------

  /** The chargepoint behind a Gladys device or feature id, or a failure. */
  #chargepoint(externalId) {
    if (!this.client || !this.connected) {
      throw new ActionFailure(failure('not_connected'));
    }
    const parsed = parseExternalId(this.gladys, externalId);
    const cp = parsed?.kind === 'chargepoint' ? this.state.chargepoints.get(parsed.id) : null;
    if (!cp) {
      throw new ActionFailure(failure('unknown_chargepoint'));
    }
    return cp;
  }

  /** One command at a time per chargepoint: each edits the profile the previous one confirmed. */
  #serialize(id, task) {
    const previous = this.queues.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(task);
    this.queues.set(id, next);
    return next;
  }

  /** One timer for the publish and openWB's echo; `fail` ends it early. */
  #waitFor(done) {
    let waiter;
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(waiter);
        reject(new ActionFailure(failure('not_confirmed')));
      }, this.timings.confirmTimeout);
      waiter = {
        done,
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (err) => {
          clearTimeout(timer);
          this.waiters.delete(waiter);
          reject(err);
        },
      };
      this.waiters.add(waiter);
    });
    return { promise, fail: (err) => waiter.reject(err) };
  }

  async #publishProfile(cp, edit, done) {
    const client = this.client;
    if (!client || !this.connected) {
      throw new ActionFailure(failure('not_connected'));
    }
    if (!cp.template?.chargemode) {
      throw new ActionFailure(failure('no_profile'));
    }
    const profile = structuredClone(cp.template);
    edit(profile);
    const topic = `openWB/set/chargepoint/${cp.id}/set/charge_template`;
    const confirmation = this.#waitFor(() => done(this.state.chargepoints.get(cp.id) ?? cp));
    client.publish(topic, JSON.stringify(profile), { qos: 0, retain: false }, (err) => {
      if (err) {
        confirmation.fail(new ActionFailure(failure('not_connected')));
      }
    });
    await confirmation.promise;
  }

  /** Commands that edit the same charging profile wait for each other. */
  #queueKey(cp) {
    const id = cp.template?.id;
    return id === undefined || id === null ? `chargepoint:${cp.id}` : `profile:${id}`;
  }

  /**
   * Charging mode of a chargepoint. Stop is always allowed (it only stops a
   * charge); the other modes need "Allow control".
   * @returns {Promise<object>} the success message
   */
  async setMode(externalId, mode) {
    if (!MODES.includes(mode)) {
      throw new ActionFailure(failure('unknown_mode'));
    }
    if (mode !== STOP && !this.config.allow_control) {
      throw new ActionFailure(failure('control_disabled'));
    }
    const cp = this.#chargepoint(externalId);
    return this.#serialize(this.#queueKey(cp), async () => {
      const current = this.state.chargepoints.get(cp.id) ?? cp;
      if (modeOf(current) !== mode) {
        await this.#publishProfile(
          current,
          (profile) => {
            profile.chargemode.selected = mode;
          },
          (now) => modeOf(now) === mode,
        );
      }
      const name = this.deviceName(chargepointIds(this.gladys, cp.id).device, chargepointName(cp));
      logger.info(`${name}: charging mode ${mode}`);
      this.refreshWidget();
      return modeSetMessage(name, mode);
    });
  }

  /** Instant charging current (A) of a chargepoint, "Allow control" needed. */
  async setCurrent(externalId, value) {
    if (!this.config.allow_control) {
      throw new ActionFailure(failure('control_disabled'));
    }
    const amps = Number(value);
    if (!Number.isInteger(amps) || amps < CURRENT.min || amps > CURRENT.max) {
      throw new ActionFailure(failure('out_of_range', CURRENT.min, CURRENT.max));
    }
    const cp = this.#chargepoint(externalId);
    return this.#serialize(this.#queueKey(cp), async () => {
      const current = this.state.chargepoints.get(cp.id) ?? cp;
      if (instantCurrentOf(current) !== amps) {
        await this.#publishProfile(
          current,
          (profile) => {
            profile.chargemode.instant_charging ??= {};
            profile.chargemode.instant_charging.current = amps;
          },
          (now) => instantCurrentOf(now) === amps,
        );
      }
      const name = this.deviceName(chargepointIds(this.gladys, cp.id).device, chargepointName(cp));
      logger.info(`${name}: instant charging current ${amps} A`);
    });
  }

  /** onSetValue of the controllable features. */
  async setValue(device, feature, value) {
    const parsed = parseExternalId(this.gladys, feature?.external_id);
    if (parsed?.kind !== 'chargepoint') {
      throw new ActionFailure(failure('unknown_chargepoint'));
    }
    const deviceId = chargepointIds(this.gladys, parsed.id).device;
    if (parsed.feature === 'mode') {
      await this.setMode(deviceId, String(value));
      return;
    }
    if (parsed.feature === 'target_current') {
      await this.setCurrent(deviceId, value);
      return;
    }
    throw new ActionFailure(failure('unknown_chargepoint'));
  }

  /** The `test_connection` action. */
  async testReport() {
    if (!this.config?.host) {
      throw new ActionFailure(STATUS.no_host);
    }
    if (!this.connected) {
      throw new ActionFailure(this.status === 'refused' ? STATUS.refused : STATUS.unreachable);
    }
    if (this.state.messages === 0) {
      throw new ActionFailure(STATUS.no_data);
    }
    const ids = this.state.chargepointIds();
    if (ids.length === 0) {
      throw new ActionFailure(failure('no_chargepoint'));
    }
    const names = ids.map((id) => chargepointName(this.state.chargepoints.get(id)));
    return testMessage(ids.length, names);
  }

  modeLabel(mode) {
    return (MODE_LABELS[this.language] ?? MODE_LABELS.en)[mode] ?? mode;
  }
}
