// -----------------------------------------------------------------------------
// openWB 2.x seen through its MQTT broker: every retained topic the
// integration reads, folded into one in-memory state.
//
// Topic layout, from the dataclasses of openWB/core (packages/control/...):
//
//   openWB/chargepoint/<id>/config                       { name, ... }
//   openWB/chargepoint/<id>/get/plug_state               true | false
//   openWB/chargepoint/<id>/get/charge_state             true | false
//   openWB/chargepoint/<id>/get/power                    W
//   openWB/chargepoint/<id>/get/currents                 [A, A, A]
//   openWB/chargepoint/<id>/get/imported                 Wh (meter index)
//   openWB/chargepoint/<id>/get/soc                      % (chargers that read it)
//   openWB/chargepoint/<id>/get/fault_state              0 ok, 1 warning, 2 error
//   openWB/chargepoint/<id>/get/connected_vehicle/info   { id, name }
//   openWB/chargepoint/<id>/get/connected_vehicle/soc    { soc, range, timestamp, ... }
//   openWB/chargepoint/<id>/get/connected_vehicle/config { chargemode, ... }
//   openWB/chargepoint/<id>/set/charge_template          the active charging profile
//   openWB/chargepoint/<id>/set/log                      { imported_since_plugged, ... } Wh
//   openWB/chargepoint/<id>/set/current                  A allowed by openWB (0: held)
//   openWB/chargepoint/<id>/set/manual_lock              true | false
//   openWB/counter/get/hierarchy                         [{ id, type, children }], grid first
//   openWB/counter/<id>/get/power|imported|exported      W, Wh (grid: + import, - export)
//   openWB/counter/set/home_consumption                  W
//   openWB/pv/get/power|exported                         W (negative: production), Wh
//   openWB/pv/<id>/get/power                             one inverter (tells PV exists)
//   openWB/bat/get/power|soc                             W (+ charging), %
//   openWB/bat/<id>/get/power                            one battery (tells it exists)
//
// Every payload is JSON (openWB publishes json.dumps of the value). An empty
// payload clears a retained topic: openWB does it when a component is removed.
// -----------------------------------------------------------------------------

export const SUBSCRIPTIONS = [
  'openWB/chargepoint/+/config',
  'openWB/chargepoint/+/get/+',
  'openWB/chargepoint/+/get/connected_vehicle/+',
  'openWB/chargepoint/+/set/charge_template',
  'openWB/chargepoint/+/set/log',
  'openWB/chargepoint/+/set/current',
  'openWB/chargepoint/+/set/manual_lock',
  'openWB/counter/get/hierarchy',
  'openWB/counter/+/get/power',
  'openWB/counter/+/get/imported',
  'openWB/counter/+/get/exported',
  'openWB/counter/set/home_consumption',
  'openWB/pv/get/power',
  'openWB/pv/get/exported',
  'openWB/pv/+/get/power',
  'openWB/bat/get/power',
  'openWB/bat/get/soc',
  'openWB/bat/+/get/power',
];

// Charging modes of openWB 2.x (control/chargemode.py) a user can select.
// "Min + PV" is no mode of its own in 2.x: it is PV charging with a minimum
// current, set in the charging profile. bidi_charging needs a bidirectional
// charger: shown when openWB reports it, not offered.
export const MODES = [
  'instant_charging',
  'pv_charging',
  'eco_charging',
  'scheduled_charging',
  'stop',
];
export const STOP = 'stop';

// Instant charging current, as openWB's own interface bounds it (A).
export const CURRENT = { min: 6, max: 32 };

// The Gladys charging-state enumeration (CHARGING_STATION_CHARGING_STATE of
// the core, translated by its front).
export const CHARGING_STATE = {
  CHARGING: 0,
  EV_CONNECTED: 1,
  PAUSED_BY_VEHICLE: 2,
  PAUSED_BY_CHARGER: 3,
  IDLE: 4,
};

const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const object = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : null;
const bool = (value) => (typeof value === 'boolean' ? value : null);

/** JSON payload -> value; `undefined` for an empty (cleared) topic. */
export function parsePayload(payload) {
  const text = Buffer.isBuffer(payload) ? payload.toString('utf8') : String(payload ?? '');
  if (text.trim() === '') {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    // A bare string some modules publish without quotes.
    return text;
  }
}

function emptyChargepoint(id) {
  return {
    id,
    name: null,
    plugged: null,
    charging: null,
    power: null,
    currents: null,
    imported: null,
    cpSoc: null,
    faultState: null,
    vehicleName: null,
    vehicleSoc: null,
    vehicleSocTime: null,
    vehicleMode: null,
    template: null,
    log: null,
    allowedCurrent: null,
    locked: null,
  };
}

export class OpenWbState {
  constructor() {
    this.reset();
  }

  /** Forget everything (new broker): the retained topics come back on subscribe. */
  reset() {
    /** @type {Map<string, ReturnType<typeof emptyChargepoint>>} */
    this.chargepoints = new Map();
    this.counters = new Map();
    this.gridId = null;
    this.homePower = null;
    this.pv = { power: null, exported: null };
    this.pvModules = new Set();
    this.bat = { power: null, soc: null };
    this.batModules = new Set();
    this.messages = 0;
    // Last profile openWB published, per profile id: chargepoints may share one.
    this.profiles = new Map();
  }

  /**
   * One MQTT message. Returns true when it changed something the
   * integration reads.
   */
  apply(topic, payload) {
    const value = parsePayload(payload);
    const parts = topic.split('/');
    if (parts[0] !== 'openWB') {
      return false;
    }
    this.messages += 1;
    switch (parts[1]) {
      case 'chargepoint':
        return this.#chargepoint(parts, value);
      case 'counter':
        return this.#counter(parts, value);
      case 'pv':
        return this.#component(parts, value, this.pv, this.pvModules, ['power', 'exported']);
      case 'bat':
        return this.#component(parts, value, this.bat, this.batModules, ['power', 'soc']);
      default:
        return false;
    }
  }

  #chargepoint(parts, value) {
    const id = parts[2];
    if (!/^\d+$/.test(id ?? '')) {
      return false;
    }
    const path = parts.slice(3).join('/');
    if (path === 'config' && value === undefined) {
      // The chargepoint was deleted in openWB.
      return this.chargepoints.delete(id);
    }
    let cp = this.chargepoints.get(id);
    if (!cp) {
      if (value === undefined) {
        return false;
      }
      cp = emptyChargepoint(id);
      this.chargepoints.set(id, cp);
    }
    switch (path) {
      case 'config':
        cp.name = typeof object(value)?.name === 'string' ? value.name.trim() || null : cp.name;
        break;
      case 'get/plug_state':
        cp.plugged = bool(value);
        break;
      case 'get/charge_state':
        cp.charging = bool(value);
        break;
      case 'get/power':
        cp.power = number(value);
        break;
      case 'get/currents':
        cp.currents = Array.isArray(value) ? value.map(number).filter((v) => v !== null) : null;
        break;
      case 'get/imported':
        cp.imported = number(value);
        break;
      case 'get/soc':
        cp.cpSoc = number(value);
        break;
      case 'get/fault_state':
        cp.faultState = number(value);
        break;
      case 'get/connected_vehicle/info':
        cp.vehicleName = typeof object(value)?.name === 'string' ? value.name : null;
        break;
      case 'get/connected_vehicle/soc': {
        const soc = object(value);
        // No timestamp: no SoC module answered for this vehicle (soc stays 0).
        cp.vehicleSocTime = soc?.timestamp ?? null;
        cp.vehicleSoc = soc && soc.timestamp != null ? number(soc.soc) : null;
        break;
      }
      case 'get/connected_vehicle/config':
        cp.vehicleMode = typeof object(value)?.chargemode === 'string' ? value.chargemode : null;
        break;
      case 'set/charge_template':
        cp.template = object(value);
        if (cp.template?.id !== undefined && cp.template?.id !== null) {
          this.profiles.set(String(cp.template.id), cp.template);
        }
        break;
      case 'set/log':
        cp.log = object(value);
        break;
      case 'set/current':
        cp.allowedCurrent = number(value);
        break;
      case 'set/manual_lock':
        cp.locked = bool(value);
        break;
      default:
        return false;
    }
    return true;
  }

  #counter(parts, value) {
    const path = parts.slice(2).join('/');
    if (path === 'get/hierarchy') {
      const top = Array.isArray(value) ? value[0] : null;
      // The top of the hierarchy is the grid meter (EVU) when it is a counter.
      this.gridId = top?.type === 'counter' && top.id != null ? String(top.id) : null;
      return true;
    }
    if (path === 'set/home_consumption') {
      this.homePower = number(value);
      return true;
    }
    const id = parts[2];
    const key = parts[4];
    if (!/^\d+$/.test(id ?? '') || parts[3] !== 'get' || parts.length !== 5) {
      return false;
    }
    if (!['power', 'imported', 'exported'].includes(key)) {
      return false;
    }
    let counter = this.counters.get(id);
    if (!counter) {
      if (value === undefined) {
        return false;
      }
      counter = { power: null, imported: null, exported: null };
      this.counters.set(id, counter);
    }
    counter[key] = number(value);
    return true;
  }

  #component(parts, value, totals, modules, keys) {
    if (parts[2] === 'get' && parts.length === 4 && keys.includes(parts[3])) {
      totals[parts[3]] = number(value);
      return true;
    }
    if (/^\d+$/.test(parts[2] ?? '') && parts[3] === 'get' && parts[4] === 'power') {
      if (value === undefined) {
        modules.delete(parts[2]);
      } else {
        modules.add(parts[2]);
      }
      return true;
    }
    return false;
  }

  /** The grid meter, or null. */
  get grid() {
    return this.gridId === null ? null : (this.counters.get(this.gridId) ?? null);
  }

  get hasPv() {
    return this.pvModules.size > 0;
  }

  get hasBattery() {
    return this.batModules.size > 0;
  }

  /** Ids in numeric order. */
  chargepointIds() {
    return [...this.chargepoints.keys()].sort((a, b) => Number(a) - Number(b));
  }
}

/** The mode of a chargepoint: its active profile, else the vehicle's. */
export function modeOf(cp) {
  const selected = cp.template?.chargemode?.selected;
  return typeof selected === 'string' ? selected : cp.vehicleMode;
}

/** Instant charging current of the active profile (A), or null. */
export function instantCurrentOf(cp) {
  return number(cp.template?.chargemode?.instant_charging?.current);
}

/** Vehicle state of charge: the SoC module's, else the charger's own reading. */
export function socOf(cp) {
  return cp.vehicleSoc ?? cp.cpSoc;
}

/** Energy charged since the plug (Wh), or null. */
export function sessionEnergyOf(cp) {
  return number(cp.log?.imported_since_plugged);
}

/** Highest phase current (A), or null. */
export function currentOf(cp) {
  if (!cp.currents || cp.currents.length === 0) {
    return null;
  }
  return Math.max(...cp.currents.map((value) => Math.abs(value)));
}

export function chargingStateOf(cp) {
  if (!cp.plugged) {
    return CHARGING_STATE.IDLE;
  }
  if (cp.charging) {
    return CHARGING_STATE.CHARGING;
  }
  if (modeOf(cp) === STOP || cp.locked) {
    return CHARGING_STATE.EV_CONNECTED;
  }
  // openWB allows a current but the car draws nothing: full, or paused by itself.
  if (cp.allowedCurrent !== null && cp.allowedCurrent > 0) {
    return CHARGING_STATE.PAUSED_BY_VEHICLE;
  }
  // openWB holds the charge (no solar surplus, price too high, plan not due).
  return CHARGING_STATE.PAUSED_BY_CHARGER;
}

export const chargepointName = (cp) => cp.name ?? `openWB ${cp.id}`;
