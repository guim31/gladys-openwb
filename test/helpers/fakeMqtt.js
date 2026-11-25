// -----------------------------------------------------------------------------
// An in-memory MQTT broker with openWB 2.x behind it, and an mqtt.js-like
// client: what `mqtt.connect` returns (connect, message, error and close
// events, subscribe with + and # wildcards, publish, end). The broker keeps
// retained topics and replays them on subscribe, as Mosquitto does.
//
// `openwb: true` (the default) plays openWB's setdata: a JSON profile
// published on openWB/set/chargepoint/<id>/set/charge_template is published
// back, retained, on openWB/chargepoint/<id>/set/charge_template.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';

export function fixture(name = 'openwb-2-topics.json') {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
}

export function matches(filter, topic) {
  const f = filter.split('/');
  const t = topic.split('/');
  for (let i = 0; i < f.length; i += 1) {
    if (f[i] === '#') {
      return true;
    }
    if (i >= t.length || (f[i] !== '+' && f[i] !== t[i])) {
      return false;
    }
  }
  return f.length === t.length;
}

export class FakeBroker {
  constructor({ topics = fixture(), openwb = true, credentials = null } = {}) {
    this.retained = new Map();
    for (const [topic, value] of Object.entries(topics)) {
      this.retained.set(topic, JSON.stringify(value));
    }
    this.openwb = openwb;
    this.credentials = credentials;
    this.down = false;
    this.clients = new Set();
    this.published = [];
    this.connections = [];
  }

  /** The `connect` option of the hub (mqtt.connect). */
  connect = (options) => {
    this.connections.push(options);
    const client = new FakeClient(this, options);
    setImmediate(() => client.open());
    return client;
  };

  /** A value openWB publishes (retained), JSON-encoded like openWB does. */
  set(topic, value) {
    const payload = value === undefined ? '' : JSON.stringify(value);
    this.deliver(topic, payload, true);
  }

  deliver(topic, payload, retain) {
    if (retain) {
      if (payload === '') {
        this.retained.delete(topic);
      } else {
        this.retained.set(topic, payload);
      }
    }
    for (const client of this.clients) {
      client.receive(topic, payload);
    }
  }

  fromClient(topic, payload, options) {
    this.published.push({ topic, payload: String(payload), options });
    if (!options?.retain) {
      for (const client of this.clients) {
        client.receive(topic, String(payload));
      }
    }
    const match = topic.match(/^openWB\/set\/chargepoint\/(\d+)\/set\/charge_template$/);
    if (this.openwb && match) {
      setImmediate(() =>
        this.deliver(`openWB/chargepoint/${match[1]}/set/charge_template`, String(payload), true),
      );
    }
  }

  /** The broker goes away: every client is closed, reconnections fail. */
  stop() {
    this.down = true;
    for (const client of [...this.clients]) {
      client.drop();
    }
  }

  start() {
    this.down = false;
  }
}

class FakeClient extends EventEmitter {
  constructor(broker, options) {
    super();
    this.broker = broker;
    this.options = options;
    this.subscriptions = [];
    this.connected = false;
    this.ended = false;
    this.retryTimer = null;
  }

  open() {
    if (this.ended) {
      return;
    }
    const { credentials } = this.broker;
    if (this.broker.down) {
      this.emit(
        'error',
        Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
      );
      this.emit('close');
      this.#retry();
      return;
    }
    if (
      credentials &&
      (this.options.username !== credentials.username ||
        this.options.password !== credentials.password)
    ) {
      this.emit(
        'error',
        Object.assign(new Error('Connection refused: Not authorized'), { code: 5 }),
      );
      this.emit('close');
      this.#retry();
      return;
    }
    this.connected = true;
    this.subscriptions = [];
    this.broker.clients.add(this);
    this.emit('connect', { returnCode: 0 });
  }

  #retry() {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.open(), this.options.reconnectPeriod ?? 20);
  }

  drop() {
    this.connected = false;
    this.broker.clients.delete(this);
    this.emit('close');
    this.#retry();
  }

  subscribe(filters, options, callback) {
    const list = Array.isArray(filters) ? filters : [filters];
    this.subscriptions.push(...list);
    setImmediate(() => {
      callback?.(
        null,
        list.map((topic) => ({ topic, qos: 0 })),
      );
      for (const [topic, payload] of this.broker.retained) {
        if (list.some((filter) => matches(filter, topic))) {
          this.emit('message', topic, Buffer.from(payload), { retain: true });
        }
      }
    });
    return this;
  }

  receive(topic, payload) {
    if (this.connected && this.subscriptions.some((filter) => matches(filter, topic))) {
      setImmediate(() => this.emit('message', topic, Buffer.from(payload), { retain: false }));
    }
  }

  publish(topic, payload, options, callback) {
    if (!this.connected) {
      callback?.(new Error('client disconnecting'));
      return this;
    }
    this.broker.fromClient(topic, payload, options);
    setImmediate(() => callback?.());
    return this;
  }

  end(force, options, callback) {
    this.ended = true;
    clearTimeout(this.retryTimer);
    this.connected = false;
    this.broker.clients.delete(this);
    setImmediate(() => callback?.());
    return this;
  }
}

export const settle = () => new Promise((resolve) => setImmediate(resolve));

export async function until(check, { timeout = 2000, what = 'the condition' } = {}) {
  const start = Date.now();
  while (!(await check())) {
    if (Date.now() - start > timeout) {
      throw new Error(`Timed out waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
