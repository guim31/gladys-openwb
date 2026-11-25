// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from realistic
// fixtures: an openWB 2.x with two chargepoints, grid meter, PV and battery
// (test/fixtures/openwb-2-topics.json, built from the dataclasses of
// openWB/core), and a wallbox alone — in every name language.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FakeBroker, fixture } from './helpers/fakeMqtt.js';
import { createWorld, processed } from './helpers/world.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

const wallboxAlone = () =>
  Object.fromEntries(
    Object.entries(fixture()).filter(([topic]) => topic.startsWith('openWB/chargepoint/3/')),
  );

const installations = [
  { label: 'openWB with PV, battery and grid meter', topics: () => fixture(), devices: 3 },
  { label: 'a wallbox alone', topics: wallboxAlone, devices: 1 },
];

const languages = [undefined, 'en', 'de', 'es'];

for (const installation of installations) {
  for (const language of languages) {
    test(`every discovered device follows the Gladys rules (${installation.label}, ${language ?? 'default language'})`, async () => {
      const world = await createWorld({
        broker: new FakeBroker({ topics: installation.topics() }),
        config: { host: '192.0.2.30', ...(language ? { language } : {}) },
      });
      try {
        await processed(world);
        const devices = world.fake.discoveredDevices;
        assert.equal(devices.length, installation.devices);
        for (const device of devices) {
          const where = device.name;

          if (device.poll_frequency === undefined) {
            assert.notEqual(
              device.should_poll,
              true,
              `${where}: should_poll without poll_frequency`,
            );
          } else {
            assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
            assert.ok(
              table.poll_frequencies_ms.includes(device.poll_frequency),
              `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
            );
          }

          assert.ok(device.features.length > 0, `${where}: no feature`);
          const externalIds = new Set();
          const names = new Set();
          for (const feature of device.features) {
            const at = `${where} / ${feature.name}`;
            const pair = table.pairs[`${feature.category}/${feature.type}`];
            assert.ok(
              pair,
              `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`,
            );
            assert.ok(
              pair.label_en && pair.label_fr && pair.icon,
              `${at}: couple without label or icon`,
            );
            assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
            assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
            assert.ok(
              Number.isFinite(feature.min) && Number.isFinite(feature.max),
              `${at}: finite min/max`,
            );
            assert.ok(feature.min <= feature.max, `${at}: min > max`);
            assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
            assert.equal(
              typeof feature.has_feedback,
              'boolean',
              `${at}: has_feedback must be a boolean`,
            );
            if (feature.unit !== undefined) {
              assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
              const allowed = table.units_by_category?.[feature.category];
              if (allowed) {
                assert.ok(
                  allowed.includes(feature.unit),
                  `${at}: unit ${feature.unit} not for ${feature.category}`,
                );
              }
            }
            assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
            externalIds.add(feature.external_id);
            assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
            names.add(feature.name);
          }
          // A signed value on a gauge needs symmetric bounds.
          for (const feature of device.features.filter((f) => f.min < 0)) {
            assert.equal(feature.min, -feature.max, `${where} / ${feature.name}: asymmetric`);
          }
        }
      } finally {
        await world.app.stop();
      }
    });
  }
}
