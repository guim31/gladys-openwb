// -----------------------------------------------------------------------------
// The integration end to end: the SDK's fake Gladys, the hub, and an in-memory
// broker replaying the retained topics of an openWB 2.x (test/fixtures).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeBroker, fixture, until } from './helpers/fakeMqtt.js';
import { captureLogs } from './helpers/logs.js';
import { cpId, createWorld, processed, siteId } from './helpers/world.js';

const featureOf = (device, key) =>
  device.features.find((f) => f.external_id === `${device.external_id}:${key}`);
const deviceOf = (fake, id) => fake.discoveredDevices.find((d) => d.external_id === id);

test('publishes the chargepoints and the site, with their states', async (t) => {
  const world = await createWorld({ config: { host: '192.0.2.30' } });
  t.after(() => world.app.stop());
  const { fake } = world;
  await processed(world);
  assert.deepEqual(
    fake.discoveredDevices.map((d) => [d.external_id, d.name]),
    [
      [cpId(3), 'Carport'],
      [cpId(4), 'Garage'],
      [siteId(), 'openWB'],
    ],
  );
  assert.deepEqual(fake.connectionStatus, { connected: true });
  assert.equal(fake.lastState(cpId(3, 'mode')), 'pv_charging');
  assert.equal(fake.lastState(cpId(3, 'plugged')), 1);
  assert.equal(fake.lastState(cpId(3, 'charging_state')), 0);
  assert.equal(fake.lastState(cpId(3, 'charge_power')), 11.04);
  assert.equal(fake.lastState(cpId(3, 'charge_current')), 16);
  assert.equal(fake.lastState(cpId(3, 'target_current')), 16);
  assert.equal(fake.lastState(cpId(3, 'session_energy')), 5.23);
  assert.equal(fake.lastState(cpId(3, 'meter')), 1848.44);
  assert.equal(fake.lastState(cpId(3, 'vehicle_soc')), 54);
  assert.equal(fake.lastState(cpId(4, 'plugged')), 0);
  assert.equal(fake.lastState(cpId(4, 'charging_state')), 4);
  // Garage: no SoC module (timestamp null): no battery feature.
  assert.equal(featureOf(deviceOf(fake, cpId(4)), 'vehicle_soc'), undefined);
  assert.equal(fake.lastState(siteId('grid_power')), -2350);
  assert.equal(fake.lastState(siteId('grid_import')), 4523.1);
  assert.equal(fake.lastState(siteId('grid_export')), 3120.45);
  assert.equal(fake.lastState(siteId('home_power')), 810);
  assert.equal(fake.lastState(siteId('pv_power')), 14630);
  assert.equal(fake.lastState(siteId('pv_energy')), 9876.54);
  assert.equal(fake.lastState(siteId('battery_level')), 72);
  assert.equal(fake.lastState(siteId('battery_charge_power')), 440);
  assert.equal(fake.lastState(siteId('battery_discharge_power')), 0);
  // French names by default.
  assert.equal(featureOf(deviceOf(fake, cpId(3)), 'mode').name, 'Mode de charge');
  // The broker options: no TLS, no credentials by default.
  const options = world.broker.connections[0];
  assert.equal(options.host, '192.0.2.30');
  assert.equal(options.port, 1883);
  assert.equal(options.protocol, 'mqtt');
  assert.equal(options.username, undefined);
});

test('a wallbox alone: no site device', async (t) => {
  const topics = Object.fromEntries(
    Object.entries(fixture()).filter(([topic]) => topic.startsWith('openWB/chargepoint/4/')),
  );
  const world = await createWorld({ broker: new FakeBroker({ topics }) });
  t.after(() => world.app.stop());
  await processed(world);
  assert.deepEqual(
    world.fake.discoveredDevices.map((d) => d.external_id),
    [cpId(4)],
  );
});

test('only changes are published, and a new chargepoint appears', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const { fake, broker } = world;
  await processed(world);
  const before = fake.states.length;
  broker.set('openWB/chargepoint/3/get/power', 11040.0); // same value
  await processed(world);
  assert.equal(fake.states.length, before);
  broker.set('openWB/chargepoint/3/get/power', 7360.0);
  await processed(world);
  assert.equal(fake.states.length, before + 1);
  assert.equal(fake.lastState(cpId(3, 'charge_power')), 7.36);

  broker.set('openWB/chargepoint/5/config', { name: 'Street', id: 5 });
  broker.set('openWB/chargepoint/5/get/plug_state', false);
  broker.set('openWB/chargepoint/5/get/charge_state', false);
  await processed(world);
  assert.ok(deviceOf(fake, cpId(5)));
  // Deleted in openWB: gone from the discovered devices.
  broker.set('openWB/chargepoint/5/config', undefined);
  await processed(world);
  assert.equal(deviceOf(fake, cpId(5)), undefined);
});

test('scene events: plug, charge, pause, end, unplug', async (t) => {
  const world = await createWorld({
    timings: { ...(await import('./helpers/world.js')).FAST_TIMINGS, sessionQuiet: 60_000 },
  });
  t.after(() => world.app.stop());
  const { fake, broker } = world;
  await processed(world);
  assert.deepEqual(fake.sceneEvents, [], 'nothing replayed from the retained state');

  // Garage: plugged, then charging.
  broker.set('openWB/chargepoint/4/get/connected_vehicle/info', { id: 2, name: 'Zoé' });
  broker.set('openWB/chargepoint/4/get/plug_state', true);
  await processed(world);
  broker.set('openWB/chargepoint/4/get/charge_state', true);
  await processed(world);
  // Carport: a pause (clouds) is no end of charge.
  broker.set('openWB/chargepoint/3/get/charge_state', false);
  await processed(world);
  broker.set('openWB/chargepoint/3/get/charge_state', true);
  await processed(world);
  // Carport unplugged: the charge ends with the session of before.
  broker.set('openWB/chargepoint/3/get/charge_state', false);
  broker.set('openWB/chargepoint/3/get/plug_state', false);
  broker.set('openWB/chargepoint/3/set/log', { imported_since_plugged: 0 });
  broker.set('openWB/chargepoint/3/get/connected_vehicle/info', { id: 0, name: 'Ladepunkt' });
  await processed(world);

  const events = fake.sceneEvents.map((e) => [e.key ?? e.trigger, e.data ?? e]);
  assert.deepEqual(
    events.map(([key]) => key),
    ['vehicle_connected', 'charging_started', 'charging_finished', 'vehicle_disconnected'],
  );
  assert.deepEqual(events[0][1], { device: cpId(4), chargepoint: 'Garage', vehicle: 'Zoé' });
  assert.equal(events[1][1].mode, 'instant_charging');
  assert.deepEqual(events[2][1], {
    device: cpId(3),
    chargepoint: 'Carport',
    vehicle: 'Mein Auto',
    energy_kwh: 5.23,
    soc: 54,
  });
  assert.equal(events[3][1].energy_kwh, 5.23);
  // The energy of the last session stays on the device after the unplug.
  assert.equal(fake.lastState(cpId(3, 'session_energy')), 5.23);
});

test('a charge stopped long enough is finished, by the timer', async (t) => {
  let now = 1_000_000;
  const { FAST_TIMINGS } = await import('./helpers/world.js');
  const world = await createWorld({
    timings: { ...FAST_TIMINGS, sessionQuiet: 600_000 },
    now: () => now,
  });
  t.after(() => world.app.stop());
  world.broker.set('openWB/chargepoint/3/get/charge_state', false);
  await processed(world);
  now += 600_000;
  await until(() => world.fake.sceneEvents.length === 1, { what: 'charging_finished' });
  assert.equal(
    world.fake.sceneEvents[0].key ?? world.fake.sceneEvents[0].trigger,
    'charging_finished',
  );
});

test('mode and current: written as openWB does, confirmed by its echo', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const { fake, broker } = world;
  const device = deviceOf(fake, cpId(3));
  const ack = await fake.setValue(device, featureOf(device, 'mode'), 'instant_charging');
  assert.equal(ack.success, true, JSON.stringify(ack.error));
  const sent = broker.published.at(-1);
  assert.equal(sent.topic, 'openWB/set/chargepoint/3/set/charge_template');
  assert.equal(sent.options.retain, false);
  const profile = JSON.parse(sent.payload);
  assert.equal(profile.chargemode.selected, 'instant_charging');
  // The rest of the profile is untouched.
  assert.deepEqual(
    { ...profile, chargemode: { ...profile.chargemode, selected: 'pv_charging' } },
    fixture()['openWB/chargepoint/3/set/charge_template'],
  );
  await processed(world);
  assert.equal(fake.lastState(cpId(3, 'mode')), 'instant_charging');

  assert.equal(
    (await fake.setValue(device, featureOf(device, 'target_current'), 10)).success,
    true,
  );
  assert.equal(JSON.parse(broker.published.at(-1).payload).chargemode.instant_charging.current, 10);
  // Two commands in a row: the second edits the profile the first one set.
  const both = await Promise.all([
    fake.sceneAction('set_mode', { device: cpId(3), mode: 'eco_charging' }),
    fake.sceneAction('set_current', { device: cpId(3), current: 20 }),
  ]);
  assert.deepEqual(
    both.map((a) => a.success),
    [true, true],
  );
  const last = JSON.parse(broker.published.at(-1).payload);
  assert.equal(last.chargemode.selected, 'eco_charging');
  assert.equal(last.chargemode.instant_charging.current, 20);
});

test('commands that fail are errors in four languages', async (t) => {
  const world = await createWorld({ config: { host: '192.0.2.30' } });
  t.after(() => world.app.stop());
  const { fake, broker } = world;
  const device = deviceOf(fake, cpId(3));

  // Control is off: only Stop goes through.
  let ack = await fake.sceneAction('set_mode', { device: cpId(3), mode: 'instant_charging' });
  assert.equal(ack.success, false);
  assert.match(ack.error.fr, /Pilotage désactivé/);
  assert.equal(broker.published.length, 0);
  ack = await fake.setValue(device, featureOf(device, 'target_current'), 10);
  assert.equal(ack.success, false);
  ack = await fake.sceneAction('set_mode', { device: cpId(3), mode: 'stop' });
  assert.equal(ack.success, true, JSON.stringify(ack.error));
  assert.equal(JSON.parse(world.broker.published.at(-1).payload).chargemode.selected, 'stop');

  ack = await fake.sceneAction('set_mode', { device: cpId(9), mode: 'stop' });
  assert.equal(ack.success, false);
  assert.match(ack.error.fr, /Point de charge inconnu/);
  ack = await fake.sceneAction('set_mode', { device: cpId(3), mode: 'turbo' });
  assert.equal(ack.success, false);
  assert.ok(ack.error.de);
});

test('out of range, no echo from openWB, broker down', async (t) => {
  const broker = new FakeBroker({ openwb: false });
  const world = await createWorld({ broker });
  t.after(() => world.app.stop());
  const { fake } = world;
  let ack = await fake.sceneAction('set_current', { device: cpId(3), current: 40 });
  assert.equal(ack.success, false);
  assert.match(ack.error.fr, /entre 6 et 32 A/);
  ack = await fake.sceneAction('set_mode', { device: cpId(3), mode: 'stop' });
  assert.equal(ack.success, false);
  assert.match(ack.error.en, /did not apply/);

  broker.stop();
  await until(() => fake.connectionStatus?.connected === false, { what: 'offline' });
  assert.match(fake.connectionStatus.message.fr, /ne répond pas/);
  ack = await fake.sceneAction('set_mode', { device: cpId(3), mode: 'stop' });
  assert.equal(ack.success, false);
  assert.match(ack.error.fr, /pas connectée/);
  ack = await fake.action('test_connection', {});
  assert.equal(ack.success, false);

  broker.start();
  await until(() => fake.connectionStatus?.connected === true, { what: 'back online' });
  ack = await fake.action('test_connection', {});
  assert.equal(ack.success, true);
  assert.match(ack.data.message.fr, /2 point\(s\) de charge \(Carport, Garage\)/);
});

test('credentials refused, then a broker without openWB', async (t) => {
  const refused = await createWorld({
    broker: new FakeBroker({ credentials: { username: 'gladys', password: 'right' } }),
    config: { host: '192.0.2.30', username: 'gladys', password: 'wrong' },
    waitOnline: false,
  });
  t.after(() => refused.app.stop());
  await until(() => refused.fake.connectionStatus?.connected === false, { what: 'refused' });
  assert.match(refused.fake.connectionStatus.message.en, /refused the user name/);

  const empty = await createWorld({ broker: new FakeBroker({ topics: {} }), waitOnline: false });
  t.after(() => empty.app.stop());
  await until(() => empty.fake.connectionStatus?.connected === false, { what: 'no data' });
  assert.match(empty.fake.connectionStatus.message.fr, /aucune donnée openWB/);

  const none = await createWorld({ config: {}, waitOnline: false });
  t.after(() => none.app.stop());
  await until(() => none.fake.connectionStatus?.connected === false, { what: 'no host' });
  assert.match(none.fake.connectionStatus.message.fr, /Saisissez l'adresse/);
  const ack = await none.fake.action('test_connection', {});
  assert.equal(ack.success, false);
});

test('a configuration change reconnects; a language change renames', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const { fake, broker } = world;
  await fake.configUpdated({ host: '192.0.2.30', allow_control: true, language: 'de' });
  await processed(world);
  assert.equal(broker.connections.length, 1, 'same broker: no reconnection');
  assert.equal(featureOf(deviceOf(fake, cpId(3)), 'mode').name, 'Lademodus');
  await fake.configUpdated({ host: '192.0.2.31', port: 8883, tls: true, language: 'de' });
  await until(() => broker.connections.length === 2, { what: 'reconnection' });
  const options = broker.connections[1];
  assert.equal(options.host, '192.0.2.31');
  assert.equal(options.protocol, 'mqtts');
  assert.equal(options.port, 8883);
  assert.equal(options.rejectUnauthorized, false);
});

test('a device created in Gladys gets every state again, and the widget a refresh', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const { fake } = world;
  await processed(world);
  const device = deviceOf(fake, cpId(3));
  const before = fake.states.length;
  await fake.deviceCreated(device);
  await processed(world);
  assert.ok(fake.states.length >= before + device.features.length - 1);
  assert.ok(fake.widgetRefreshes.length > 0);
});

test('a normal cycle writes nothing at the info level', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await processed(world);
  const logs = captureLogs(t, 'info');
  world.broker.set('openWB/chargepoint/3/get/power', 10500.0);
  world.broker.set('openWB/counter/0/get/power', -1900.0);
  await processed(world);
  assert.deepEqual(logs.stop(), []);
});

test('a command queued while the broker drops fails, and the next ones still work', async (t) => {
  const broker = new FakeBroker({ openwb: false });
  const world = await createWorld({ broker });
  t.after(() => world.app.stop());
  const { fake } = world;
  const first = fake.sceneAction('set_mode', { device: cpId(3), mode: 'stop' });
  const second = fake.sceneAction('set_current', { device: cpId(3), current: 10 });
  await new Promise((resolve) => setTimeout(resolve, 20));
  broker.stop();
  const acks = await Promise.all([first, second]);
  assert.deepEqual(
    acks.map((a) => a.success),
    [false, false],
  );
  assert.match(acks[1].error.fr, /pas connectée/);
  const sent = broker.published.length;
  broker.openwb = true;
  broker.start();
  await until(() => world.hub.connected, { what: 'back online' });
  assert.equal(broker.published.length, sent, 'nothing sent on reconnection');
  const ack = await fake.sceneAction('set_current', { device: cpId(3), current: 10 });
  assert.equal(ack.success, true, JSON.stringify(ack.error));
});

test('a profile shared by two chargepoints: each edit starts from the latest copy', async (t) => {
  const topics = fixture();
  topics['openWB/chargepoint/4/set/charge_template'] = structuredClone(
    topics['openWB/chargepoint/3/set/charge_template'],
  );
  const broker = new FakeBroker({ topics });
  const world = await createWorld({ broker });
  t.after(() => world.app.stop());
  const { fake } = world;
  // openWB copies chargepoint 3's change to chargepoint 4 a moment later.
  const ack = await fake.sceneAction('set_mode', { device: cpId(3), mode: 'eco_charging' });
  assert.equal(ack.success, true);
  const second = await fake.sceneAction('set_current', { device: cpId(4), current: 12 });
  assert.equal(second.success, true, JSON.stringify(second.error));
  const last = JSON.parse(broker.published.at(-1).payload);
  assert.equal(last.chargemode.selected, 'eco_charging');
  assert.equal(last.chargemode.instant_charging.current, 12);
});
