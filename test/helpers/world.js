// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys (a real GladysIntegration on an
// in-memory transport), the integration wired on it by registerHandlers, and a
// fake broker with openWB 2.x behind it. Short timings.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { FakeBroker, settle, until } from './fakeMqtt.js';

export const FAST_TIMINGS = {
  processDelay: 2,
  processMaxWait: 20,
  dataTimeout: 100,
  confirmTimeout: 150,
  tickInterval: 20,
  reconnectPeriod: 20,
  connectTimeout: 100,
};

export async function createWorld({
  broker = new FakeBroker(),
  config = { host: '192.0.2.30', allow_control: true },
  devices = [],
  timings = FAST_TIMINGS,
  now,
  waitOnline = true,
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, { connect: broker.connect, timings, now });
  await gladys.connect();
  await app.ready;
  await settle();
  if (waitOnline) {
    await until(() => app.hub.status === 'online' && gladys.fake.states.length > 0, {
      what: 'the first states',
    });
  }
  return { gladys, fake: gladys.fake, app, hub: app.hub, broker };
}

export const cpId = (id = 3, key) =>
  `ext:test-integration:chargepoint:${id}${key ? `:${key}` : ''}`;
export const siteId = (key) => `ext:test-integration:site:main${key ? `:${key}` : ''}`;

/** Wait until openWB's messages are processed. */
export async function processed() {
  await settle();
  await new Promise((resolve) => setTimeout(resolve, 30));
  await settle();
}
