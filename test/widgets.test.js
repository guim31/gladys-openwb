// -----------------------------------------------------------------------------
// The `openwb` widget: valid content within the core budget (8 components,
// 2 texts), the mode buttons of the chosen chargepoint, the settings that hide
// blocks, and the actions (a failure throws, shown in red).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY } from '../src/widgets.js';
import { until } from './helpers/fakeMqtt.js';
import { cpId, createWorld, processed } from './helpers/world.js';

async function content(world, settings = {}, language = 'fr') {
  const ack = await world.fake.widgetGet(WIDGET_KEY, { settings, language });
  assert.equal(ack.success, true, JSON.stringify(ack.error));
  return ack.data.content;
}

function check(data) {
  validateWidgetContent(data);
  assert.ok(data.components.length <= 8, `${data.components.length} components`);
  assert.ok(data.components.filter((c) => c.type === 'text').length <= 2);
  return data.components;
}

test('tiles, one row per chargepoint and the battery, four mode buttons', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await processed(world);
  const components = check(await content(world));
  assert.deepEqual(
    components.map((c) => c.type),
    ['value', 'value', 'value', 'status', 'button', 'button', 'button', 'button'],
  );
  const status = components.find((c) => c.type === 'status');
  assert.deepEqual(
    status.items.map((i) => [i.label, i.value]),
    [
      ['Carport', 'En charge · 11,0 kW · 54 % · Solaire'],
      ['Garage', 'Libre · Immédiate'],
      ['Batterie maison', '72 % · +0,4 kW'],
    ],
  );
  const buttons = components.filter((c) => c.type === 'button');
  assert.deepEqual(
    buttons.map((b) => [b.action.key, b.icon]),
    [
      ['mode_instant_charging', 'zap'],
      ['mode_pv_charging', 'check-circle'],
      ['mode_eco_charging', 'trending-down'],
      ['mode_stop', 'pause-circle'],
    ],
  );
  assert.deepEqual(buttons[0].action.params, { chargepoint: '3' });
  // The buttons of the chargepoint chosen in the settings.
  const garage = check(await content(world, { device: cpId(4) }, 'en'));
  assert.equal(garage.find((c) => c.type === 'button').action.params.chargepoint, '4');
  assert.equal(garage.find((c) => c.type === 'button').icon, 'check-circle');
});

test('settings hide the tiles and the buttons; control off leaves Stop alone', async (t) => {
  const world = await createWorld({ config: { host: '192.0.2.30' } });
  t.after(() => world.app.stop());
  await processed(world);
  let components = check(await content(world));
  assert.deepEqual(
    components.filter((c) => c.type === 'button').map((b) => b.action.key),
    ['mode_stop'],
  );
  components = check(await content(world, { show_energy: false, show_buttons: false }));
  assert.deepEqual(
    components.map((c) => c.type),
    ['status'],
  );
});

test('widget actions: a success toast, failures thrown', async (t) => {
  const world = await createWorld({ config: { host: '192.0.2.30' } });
  t.after(() => world.app.stop());
  let ack = await world.fake.widgetAction(WIDGET_KEY, 'mode_stop', { chargepoint: '3' }, {});
  assert.equal(ack.success, true);
  assert.match(ack.data.message.fr, /Carport : mode de charge Arrêt/);
  ack = await world.fake.widgetAction(WIDGET_KEY, 'mode_pv_charging', { chargepoint: '3' }, {});
  assert.equal(ack.success, false);
  assert.match(ack.error.fr, /Pilotage désactivé/);
  ack = await world.fake.widgetAction(WIDGET_KEY, 'mode_turbo', { chargepoint: '3' }, {});
  assert.equal(ack.success, false);
});

test('not configured, unreachable, then offline with the last values', async (t) => {
  const none = await createWorld({ config: {}, waitOnline: false });
  t.after(() => none.app.stop());
  assert.match(check(await content(none))[0].text, /Saisissez l'adresse/);

  const world = await createWorld();
  t.after(() => world.app.stop());
  await processed(world);
  world.broker.stop();
  await until(() => !world.hub.connected, { what: 'offline' });
  const components = check(await content(world));
  assert.equal(components[0].type, 'text');
  assert.match(components[0].text, /dernières valeurs connues/);
  assert.equal(components.filter((c) => c.type === 'button').length, 0);
});
