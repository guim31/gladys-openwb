// -----------------------------------------------------------------------------
// The openWB state folded from MQTT topics, and the configuration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../src/config.js';
import {
  CHARGING_STATE,
  OpenWbState,
  chargingStateOf,
  parsePayload,
  socOf,
} from '../src/openwb/model.js';
import { fixture } from './helpers/fakeMqtt.js';

const loaded = () => {
  const state = new OpenWbState();
  for (const [topic, value] of Object.entries(fixture())) {
    state.apply(topic, Buffer.from(JSON.stringify(value)));
  }
  return state;
};

test('payloads: JSON, bare strings, empty = cleared', () => {
  assert.equal(parsePayload(Buffer.from('12.5')), 12.5);
  assert.equal(parsePayload(Buffer.from('true')), true);
  assert.equal(parsePayload(Buffer.from('Kein Fehler.')), 'Kein Fehler.');
  assert.equal(parsePayload(Buffer.from('')), undefined);
});

test('the fixture: two chargepoints, the grid meter at the top of the hierarchy', () => {
  const state = loaded();
  assert.deepEqual(state.chargepointIds(), ['3', '4']);
  assert.equal(state.gridId, '0');
  assert.equal(state.grid.power, -2350);
  assert.ok(state.hasPv && state.hasBattery);
  assert.equal(socOf(state.chargepoints.get('3')), 54);
  // No SoC module (timestamp null): unknown, not 0 %.
  assert.equal(socOf(state.chargepoints.get('4')), null);
});

test('no counter at the top of the hierarchy: no grid', () => {
  const state = loaded();
  state.apply('openWB/counter/get/hierarchy', Buffer.from('[{"id":3,"type":"cp","children":[]}]'));
  assert.equal(state.grid, null);
});

test('charging state, as the Gladys front shows it', () => {
  const cp = loaded().chargepoints.get('3');
  assert.equal(chargingStateOf(cp), CHARGING_STATE.CHARGING);
  cp.charging = false;
  assert.equal(chargingStateOf(cp), CHARGING_STATE.PAUSED_BY_VEHICLE);
  cp.allowedCurrent = 0;
  assert.equal(chargingStateOf(cp), CHARGING_STATE.PAUSED_BY_CHARGER);
  cp.template.chargemode.selected = 'stop';
  assert.equal(chargingStateOf(cp), CHARGING_STATE.EV_CONNECTED);
  cp.plugged = false;
  assert.equal(chargingStateOf(cp), CHARGING_STATE.IDLE);
});

test('configuration: defaults, types, a host typed as a URL', () => {
  assert.deepEqual(normalizeConfig({}), {
    host: '',
    port: 1883,
    tls: false,
    username: '',
    password: '',
    allow_control: false,
    language: 'fr',
  });
  const config = normalizeConfig({
    host: ' mqtt://192.0.2.30:1883/ ',
    port: '8883',
    tls: true,
    allow_control: 'true',
    language: 'xx',
  });
  assert.equal(config.host, '192.0.2.30');
  assert.equal(config.port, 8883);
  assert.equal(config.tls, true);
  assert.equal(config.allow_control, true);
  assert.equal(config.language, 'fr');
  assert.equal(normalizeConfig({ port: 0 }).port, 1883);
});
