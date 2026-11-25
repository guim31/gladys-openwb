// -----------------------------------------------------------------------------
// openWB state -> Gladys devices and feature states. Two kinds of device:
//
// - one device per chargepoint (`chargepoint:<id>`, the numeric id openWB
//   gives it, stable for the life of the chargepoint): plugged, charging
//   state, power, current, session energy, the charger meter, the charging
//   mode and the instant charging current (both controllable), and the
//   vehicle battery when openWB knows it (a SoC module, or a charger that
//   reads it);
// - the site (`site:main`), when openWB measures any of it: grid exchange
//   and its two indexes, home consumption, solar production and yield, home
//   battery.
//
// Couples, all known by the Gladys 5.1 front (test/gladys-rules.test.js):
// - signed grid exchange: grid-sensor/power with symmetric bounds (gauge);
// - the home battery has no signed power couple: charge-power and
//   discharge-power, both >= 0 (openWB: positive = charging);
// - charging state: charging-station/charging-state (the enumeration the
//   front translates);
// - meters: energy-sensor/index (the charger, a sub-meter of the house),
//   grid-sensor/input-index and output-index, energy-production-sensor/index:
//   the couples the Gladys energy module derives into consumption.
//
// Feature keys are forever: never renamed.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CAT,
  DEVICE_FEATURE_TYPES as TYPE,
  DEVICE_FEATURE_UNITS as UNIT,
} from '@gladysassistant/integration-sdk';
import {
  CURRENT,
  MODES,
  chargepointName,
  chargingStateOf,
  currentOf,
  instantCurrentOf,
  modeOf,
  socOf,
} from './openwb/model.js';
import { MODE_LABELS, NAMES } from './texts.js';

export const SITE_ID = 'main';
const MAX_POWER_W = 100_000;
const MAX_INDEX_KWH = 100_000_000;

export const siteIds = (gladys) => gladys.externalIds('site', SITE_ID);
export const chargepointIds = (gladys, id) => gladys.externalIds('chargepoint', String(id));

/**
 * The shape of the devices: which chargepoints and which optional features.
 * Merged with the previous structure, so a feature seen once stays (no
 * flickering structure when a value is missing for a while).
 */
export function structureOf(state, previous = null) {
  const before = new Map((previous?.chargepoints ?? []).map((cp) => [cp.id, cp]));
  const site = previous?.site ?? {};
  const grid = state.grid;
  return {
    chargepoints: state.chargepointIds().map((id) => {
      const cp = state.chargepoints.get(id);
      return {
        id,
        name: chargepointName(cp),
        hasSoc: Boolean(socOf(cp) !== null || before.get(id)?.hasSoc),
      };
    }),
    site: {
      hasGrid: Boolean(grid || site.hasGrid),
      hasHome: Boolean(state.homePower !== null || site.hasHome),
      hasPv: Boolean(state.hasPv || site.hasPv),
      hasBattery: Boolean(state.hasBattery || site.hasBattery),
    },
  };
}

const hasSite = (site) => site.hasGrid || site.hasHome || site.hasPv || site.hasBattery;

function featureFactory(ids) {
  return (key, name, fields) => ({
    name,
    external_id: ids.feature(key),
    read_only: true,
    has_feedback: false,
    ...fields,
  });
}

const watts = (category, type, min = 0) => ({
  category,
  type,
  unit: UNIT.WATT,
  min,
  max: MAX_POWER_W,
});

const kwhIndex = (category, type) => ({
  category,
  type,
  unit: UNIT.KILOWATT_HOUR,
  min: 0,
  max: MAX_INDEX_KWH,
});

export function modeOptions(language) {
  const labels = MODE_LABELS[language] ?? MODE_LABELS.en;
  return MODES.map((value, index) => ({ value, label: labels[value], sort_order: index }));
}

export function buildChargepointDevice(gladys, shape, language) {
  const names = NAMES[language] ?? NAMES.en;
  const feature = featureFactory(chargepointIds(gladys, shape.id));
  const features = [
    feature('mode', names.mode, {
      category: CAT.TEXT,
      type: TYPE.TEXT.SELECT,
      min: 0,
      max: 0,
      read_only: false,
      has_feedback: true,
      supported_options: modeOptions(language),
    }),
    feature('plugged', names.plugged, {
      category: CAT.ELECTRICAL_VEHICLE_CHARGE,
      type: TYPE.ELECTRICAL_VEHICLE_CHARGE.PLUGGED,
      min: 0,
      max: 1,
    }),
    feature('charging_state', names.charging_state, {
      category: CAT.CHARGING_STATION,
      type: TYPE.CHARGING_STATION.CHARGING_STATE,
      min: 0,
      max: 5,
    }),
    feature('charge_power', names.charge_power, {
      category: CAT.ELECTRICAL_VEHICLE_CHARGE,
      type: TYPE.ELECTRICAL_VEHICLE_CHARGE.CHARGE_POWER,
      unit: UNIT.KILOWATT,
      min: 0,
      max: 50,
    }),
    feature('charge_current', names.charge_current, {
      category: CAT.ELECTRICAL_VEHICLE_CHARGE,
      type: TYPE.ELECTRICAL_VEHICLE_CHARGE.CHARGE_CURRENT,
      unit: UNIT.AMPERE,
      min: 0,
      max: 64,
    }),
    feature('target_current', names.target_current, {
      category: CAT.ELECTRICAL_VEHICLE_CHARGE,
      type: TYPE.ELECTRICAL_VEHICLE_CHARGE.TARGET_CURRENT,
      unit: UNIT.AMPERE,
      min: CURRENT.min,
      max: CURRENT.max,
      read_only: false,
      has_feedback: true,
    }),
    feature('session_energy', names.session_energy, {
      category: CAT.ELECTRICAL_VEHICLE_CHARGE,
      type: TYPE.ELECTRICAL_VEHICLE_CHARGE.LAST_CHARGE_ENERGY_ADDED,
      unit: UNIT.KILOWATT_HOUR,
      min: 0,
      max: 1000,
    }),
    feature('meter', names.meter, kwhIndex(CAT.ENERGY_SENSOR, TYPE.ENERGY_SENSOR.INDEX)),
  ];
  if (shape.hasSoc) {
    features.push(
      feature('vehicle_soc', names.vehicle_soc, {
        category: CAT.ELECTRICAL_VEHICLE_BATTERY,
        type: TYPE.ELECTRICAL_VEHICLE_BATTERY.BATTERY_LEVEL,
        unit: UNIT.PERCENT,
        min: 0,
        max: 100,
      }),
    );
  }
  return {
    name: shape.name.slice(0, 60),
    external_id: chargepointIds(gladys, shape.id).device,
    model: 'openWB',
    should_poll: false,
    features,
    params: [{ name: 'OPENWB_CHARGEPOINT', value: String(shape.id) }],
  };
}

export function buildSiteDevice(gladys, site, language) {
  const names = NAMES[language] ?? NAMES.en;
  const feature = featureFactory(siteIds(gladys));
  const features = [];
  if (site.hasGrid) {
    features.push(
      feature(
        'grid_power',
        names.grid_power,
        watts(CAT.GRID_SENSOR, TYPE.GRID_SENSOR.POWER, -MAX_POWER_W),
      ),
      feature(
        'grid_import',
        names.grid_import,
        kwhIndex(CAT.GRID_SENSOR, TYPE.GRID_SENSOR.INPUT_INDEX),
      ),
      feature(
        'grid_export',
        names.grid_export,
        kwhIndex(CAT.GRID_SENSOR, TYPE.GRID_SENSOR.OUTPUT_INDEX),
      ),
    );
  }
  if (site.hasHome) {
    features.push(
      feature('home_power', names.home_power, watts(CAT.ENERGY_SENSOR, TYPE.ENERGY_SENSOR.POWER)),
    );
  }
  if (site.hasPv) {
    features.push(
      feature(
        'pv_power',
        names.pv_power,
        watts(CAT.ENERGY_PRODUCTION_SENSOR, TYPE.ENERGY_PRODUCTION_SENSOR.POWER),
      ),
      feature(
        'pv_energy',
        names.pv_energy,
        kwhIndex(CAT.ENERGY_PRODUCTION_SENSOR, TYPE.ENERGY_PRODUCTION_SENSOR.INDEX),
      ),
    );
  }
  if (site.hasBattery) {
    features.push(
      feature('battery_level', names.battery_level, {
        category: CAT.BATTERY_STORAGE,
        type: TYPE.BATTERY_STORAGE.BATTERY_LEVEL,
        unit: UNIT.PERCENT,
        min: 0,
        max: 100,
      }),
      feature(
        'battery_charge_power',
        names.battery_charge_power,
        watts(CAT.BATTERY_STORAGE, TYPE.BATTERY_STORAGE.CHARGE_POWER),
      ),
      feature(
        'battery_discharge_power',
        names.battery_discharge_power,
        watts(CAT.BATTERY_STORAGE, TYPE.BATTERY_STORAGE.DISCHARGE_POWER),
      ),
    );
  }
  return {
    name: 'openWB',
    external_id: siteIds(gladys).device,
    model: 'openWB',
    should_poll: false,
    features,
  };
}

/** Every device of a structure. */
export function buildDevices(gladys, structure, language) {
  const devices = structure.chargepoints.map((cp) => buildChargepointDevice(gladys, cp, language));
  if (hasSite(structure.site)) {
    devices.push(buildSiteDevice(gladys, structure.site, language));
  }
  return devices;
}

// Powers to 10 W, energies to 10 Wh: openWB publishes every 10 s cycle, and
// every state Gladys receives is stored.
const roundPower = (watts) => (watts === null ? null : Math.round(watts / 10) * 10);
const round = (value, digits) =>
  value === null || value === undefined ? null : Math.round(value * 10 ** digits) / 10 ** digits;
const kwh = (wh) => (wh === null ? null : round(wh / 1000, 2));

/**
 * Feature states of the openWB state, in the publishStates format. Unknown
 * values are left out (Gladys keeps the last one).
 * @param {Map<string, number>} [sessions] last session energy per chargepoint (Wh)
 */
export function buildStates(gladys, state, structure, sessions = new Map()) {
  const states = [];
  const adder = (ids) => ({
    value: (key, value) => {
      if (value !== null && value !== undefined && Number.isFinite(value)) {
        states.push({ device_feature_external_id: ids.feature(key), state: value });
      }
    },
    text: (key, value) => {
      if (typeof value === 'string' && value !== '') {
        states.push({ device_feature_external_id: ids.feature(key), text: value.slice(0, 200) });
      }
    },
  });

  for (const shape of structure.chargepoints) {
    const cp = state.chargepoints.get(shape.id);
    if (!cp) {
      continue;
    }
    const c = adder(chargepointIds(gladys, shape.id));
    c.text('mode', modeOf(cp) ?? undefined);
    if (cp.plugged !== null) {
      c.value('plugged', cp.plugged ? 1 : 0);
      c.value('charging_state', chargingStateOf(cp));
    }
    c.value('charge_power', cp.power === null ? null : round(Math.max(0, cp.power) / 1000, 2));
    c.value('charge_current', round(currentOf(cp), 1));
    c.value('target_current', instantCurrentOf(cp));
    // openWB resets its log on unplug: the energy of the last session stays.
    c.value('session_energy', kwh(sessions.get(shape.id) ?? null));
    c.value('meter', kwh(cp.imported));
    if (shape.hasSoc) {
      const soc = socOf(cp);
      c.value('vehicle_soc', soc === null ? null : Math.round(soc));
    }
  }

  const { site } = structure;
  if (hasSite(site)) {
    const s = adder(siteIds(gladys));
    const grid = state.grid;
    if (site.hasGrid && grid) {
      s.value('grid_power', roundPower(grid.power));
      s.value('grid_import', kwh(grid.imported));
      s.value('grid_export', kwh(grid.exported));
    }
    if (site.hasHome) {
      s.value('home_power', roundPower(state.homePower));
    }
    if (site.hasPv) {
      // openWB counts production negative.
      s.value('pv_power', state.pv.power === null ? null : roundPower(Math.abs(state.pv.power)));
      s.value('pv_energy', kwh(state.pv.exported));
    }
    if (site.hasBattery) {
      s.value('battery_level', state.bat.soc === null ? null : Math.round(state.bat.soc));
      if (state.bat.power !== null) {
        s.value('battery_charge_power', roundPower(Math.max(0, state.bat.power)));
        s.value('battery_discharge_power', roundPower(Math.max(0, -state.bat.power)));
      }
    }
  }
  return states;
}

/** `ext:...:chargepoint:2` -> { kind: 'chargepoint', id: '2', feature }, or null. */
export function parseExternalId(gladys, externalId) {
  if (typeof externalId !== 'string') {
    return null;
  }
  for (const kind of ['site', 'chargepoint']) {
    const prefix = gladys.externalId(`${kind}:`);
    if (externalId.startsWith(prefix)) {
      const [id, feature] = externalId.slice(prefix.length).split(':');
      return id ? { kind, id, feature: feature ?? null } : null;
    }
  }
  return null;
}
