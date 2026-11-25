// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `openwb`.
//
// The energy flow at a glance (solar, home, grid as tiles), one status row per
// chargepoint (state, power, mode) and the home battery, and the mode buttons
// of one chargepoint (the widget setting, or the first one): Instant, Solar,
// Eco and Stop when control is allowed, Stop alone otherwise. The current mode
// is marked by its icon (check-circle): the `primary` style is invisible in
// dark mode (Gladys#3153). Tiles, status rows and buttons each have a setting to
// hide them.
//
// Budget of the core: 8 components (3 tiles + 1 status + 4 buttons; the
// caption "not connected" only comes without buttons), 2 texts. The values
// are literal (from the MQTT state): no device needs to be added in Gladys.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { chargepointIds, parseExternalId } from './devices.js';
import { WIDGET_KEY } from './hub.js';
import {
  CHARGING_STATE,
  STOP,
  chargepointName,
  chargingStateOf,
  modeOf,
  socOf,
} from './openwb/model.js';
import { MODE_LABELS, STATE_LABELS, STATUS, failure } from './texts.js';
import { ActionFailure } from './errors.js';

export { WIDGET_KEY };

export const TEXT = {
  waiting: {
    en: 'Waiting for openWB.',
    fr: "En attente de l'openWB.",
    de: 'Warte auf openWB.',
    es: 'Esperando a openWB.',
  },
  offline: {
    en: 'openWB is not connected: last known values.',
    fr: "L'openWB n'est pas connectée : dernières valeurs connues.",
    de: 'openWB ist nicht verbunden: letzte bekannte Werte.',
    es: 'openWB no está conectada: últimos valores conocidos.',
  },
  solar: { en: 'Solar', fr: 'Solaire', de: 'Solar', es: 'Solar' },
  home: { en: 'Home', fr: 'Maison', de: 'Haus', es: 'Casa' },
  grid: { en: 'Grid', fr: 'Réseau', de: 'Netz', es: 'Red' },
  battery: { en: 'Home battery', fr: 'Batterie maison', de: 'Hausbatterie', es: 'Batería casa' },
};

// Buttons: the modes that need no plan (Target charging needs one in openWB).
export const BUTTON_MODES = ['instant_charging', 'pv_charging', 'eco_charging', STOP];
export const WIDGET_ACTIONS = BUTTON_MODES.map((mode) => `mode_${mode}`);
const MODE_ICONS = {
  instant_charging: 'zap',
  pv_charging: 'sun',
  eco_charging: 'trending-down',
  stop: 'pause-circle',
};

const STATE_COLORS = {
  [CHARGING_STATE.CHARGING]: WIDGET_COLORS.SUCCESS,
  [CHARGING_STATE.EV_CONNECTED]: WIDGET_COLORS.NEUTRAL,
  [CHARGING_STATE.PAUSED_BY_VEHICLE]: WIDGET_COLORS.INFO,
  [CHARGING_STATE.PAUSED_BY_CHARGER]: WIDGET_COLORS.WARNING,
  [CHARGING_STATE.IDLE]: WIDGET_COLORS.NEUTRAL,
};

const pick = (table, language) => table[language] ?? table.en;
const textOnly = (text, ttl = 60) => ({
  ttl_seconds: ttl,
  components: [{ type: 'text', variant: 'body', text }],
});
const kw = (watts) => Math.round(watts / 100) / 10;

function decimal(value, digits, language) {
  const fixed = value.toFixed(digits);
  return language === 'en' ? fixed : fixed.replace('.', ',');
}

/** The chargepoint the buttons drive: the widget setting, else the first one. */
function targetChargepoint(hub, settings) {
  const parsed = parseExternalId(hub.gladys, settings.device);
  if (parsed?.kind === 'chargepoint' && hub.state.chargepoints.has(parsed.id)) {
    return hub.state.chargepoints.get(parsed.id);
  }
  const first = hub.state.chargepointIds()[0];
  return first === undefined ? null : hub.state.chargepoints.get(first);
}

const shown = (setting) => setting !== false && setting !== 'false';

/**
 * The widget content.
 * @param {object} hub
 * @param {{ settings?: object, language?: string }} request
 */
export function buildContent(hub, { settings = {}, language = 'en' }) {
  const lang = MODE_LABELS[language] ? language : 'en';
  if (!hub.config?.host) {
    return textOnly(pick(STATUS.no_host, lang), 300);
  }
  const { state } = hub;
  if (state.chargepoints.size === 0 && state.messages === 0) {
    return textOnly(pick(hub.connected ? TEXT.waiting : STATUS.unreachable, lang), 30);
  }
  const online = hub.connected;
  const structure = hub.structure?.site ?? {};
  const components = [];
  if (!online) {
    components.push({ type: 'text', variant: 'caption', text: pick(TEXT.offline, lang) });
  }

  if (shown(settings.show_energy)) {
    if (structure.hasPv && state.pv.power !== null) {
      const production = Math.abs(state.pv.power);
      components.push({
        type: 'value',
        label: pick(TEXT.solar, lang),
        value: kw(production),
        unit: 'kW',
        icon: 'sun',
        color: production > 50 ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
      });
    }
    if (structure.hasHome && state.homePower !== null) {
      components.push({
        type: 'value',
        label: pick(TEXT.home, lang),
        value: kw(state.homePower),
        unit: 'kW',
        icon: 'home',
      });
    }
    const grid = state.grid;
    if (structure.hasGrid && grid?.power !== null && grid?.power !== undefined) {
      components.push({
        type: 'value',
        label: pick(TEXT.grid, lang),
        value: kw(grid.power),
        unit: 'kW',
        icon: 'zap',
        // Exporting (negative) is the surplus PV charging uses.
        color: grid.power < -50 ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
      });
    }
  }

  const items = [];
  const states = STATE_LABELS[lang];
  const modes = MODE_LABELS[lang];
  for (const id of state.chargepointIds().slice(0, 9)) {
    const cp = state.chargepoints.get(id);
    const chargingState = chargingStateOf(cp);
    const parts = [states[chargingState]];
    if (cp.charging && cp.power !== null) {
      parts.push(`${decimal(cp.power / 1000, 1, lang)} kW`);
    }
    const soc = socOf(cp);
    if (cp.plugged && soc !== null) {
      parts.push(`${Math.round(soc)} %`);
    }
    const mode = modeOf(cp);
    if (mode) {
      parts.push(modes[mode] ?? mode);
    }
    const device = chargepointIds(hub.gladys, id).device;
    items.push({
      label: hub.deviceName(device, chargepointName(cp)).slice(0, 40),
      value: parts.join(' · ').slice(0, 40),
      color: STATE_COLORS[chargingState],
      icon: 'battery-charging',
    });
  }
  if (structure.hasBattery && state.bat.soc !== null) {
    const power = state.bat.power ?? 0;
    items.push({
      label: pick(TEXT.battery, lang),
      value:
        Math.abs(power) >= 50
          ? `${Math.round(state.bat.soc)} % · ${power > 0 ? '+' : '−'}${decimal(Math.abs(power) / 1000, 1, lang)} kW`
          : `${Math.round(state.bat.soc)} %`,
      icon: power > 50 ? 'battery-charging' : 'battery',
    });
  }
  if (items.length > 0 && shown(settings.show_status)) {
    components.push({ type: 'status', items });
  }

  const target = online && shown(settings.show_buttons) ? targetChargepoint(hub, settings) : null;
  if (target) {
    const current = modeOf(target);
    const buttons = hub.config.allow_control ? BUTTON_MODES : [STOP];
    for (const mode of buttons) {
      components.push({
        type: 'button',
        label: modes[mode],
        icon: current === mode ? 'check-circle' : MODE_ICONS[mode],
        action: { key: `mode_${mode}`, params: { chargepoint: target.id } },
      });
    }
  }

  return { ttl_seconds: 30, components };
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    get(hub, request) {
      return buildContent(hub, request ?? {});
    },

    /** Resolves the toast (all four languages); a failure throws (shown in red). */
    async action(hub, { actionKey, params = {} }) {
      if (!WIDGET_ACTIONS.includes(actionKey)) {
        throw new ActionFailure(failure('unknown_mode'));
      }
      const mode = actionKey.replace(/^mode_/, '');
      const device = chargepointIds(hub.gladys, String(params.chargepoint ?? '')).device;
      return hub.setMode(device, mode);
    },
  },
};
