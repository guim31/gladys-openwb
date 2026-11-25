# Gladys openWB

A [Gladys Assistant](https://gladysassistant.com) integration for the **openWB 2.x** wallbox, local, through the
MQTT broker that runs on the openWB.

> Developed without the hardware, from the source code of openWB 2 and tested against a real Mosquitto broker
> replaying its topics: feedback welcome.

## What it does

- **One device per chargepoint**: charging mode (Instant, Solar, Eco, Target, Stop), plugged in, charging state,
  power, current, instant charging current, session energy, charger meter, and the vehicle battery when openWB
  knows it.
- **The openWB site**: grid exchange and meters, home consumption, solar production and yield, home battery — what
  openWB measures.
- **Scene triggers**: vehicle plugged in, vehicle unplugged, charging started, charging finished.
- **Scene actions**: set the charging mode, set the instant charging current.
- **A dashboard widget**: energy tiles, one line per chargepoint, mode buttons.
- Live: openWB pushes every change; nothing is polled.
- **Control is off by default**: Stop is always allowed, the other modes and the current need _Allow control_.
  Every command is confirmed by openWB, or the action fails with a message.

Documentation for users: [English](docs/en.md), [Français](docs/fr.md), [Deutsch](docs/de.md),
[Español](docs/es.md).

## Requirements

- An openWB running the 2.x software (1.9 is not supported).
- Gladys 5.1 or later, on the same network.
- The broker of the openWB reachable: port 1883 once the unencrypted access is allowed (_System → Sicherheit_), or
  port 8883 with TLS (required with openWB's user management).

## Installation

In Gladys: **Integrations → Install from GitHub**, then the address of this repository:
`https://github.com/guim31/gladys-openwb`. Enter the address of the openWB, test the connection, and add the
devices from the **Discovery** tab.

## How it works

openWB 2.x keeps its whole state as retained MQTT topics (`openWB/chargepoint/<id>/get/...`,
`openWB/counter/...`, `openWB/pv/...`, `openWB/bat/...`). The integration subscribes to the topics it needs and
receives the full state on connection, then every change. A mode or current change edits the charging profile
active on the chargepoint and publishes it to `openWB/set/chargepoint/<id>/set/charge_template`, exactly as
openWB's own simple API does; openWB publishes the profile back, which confirms the change.

## Limitations

- openWB 2.x only, through MQTT; no cloud.
- The mode and current are part of the charging profile: openWB applies a change to every chargepoint and vehicle
  sharing that profile, unless its temporary charging profiles are on.
- Target charging plans, time charging and battery settings are not edited from Gladys.
- The chargepoint ids are those of the openWB: one openWB per Gladys.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against the SDK's fake Gladys and an in-memory broker replaying
[openWB 2.x topics](test/fixtures/openwb-2-topics.json) built from the dataclasses of openWB/core. See
[CLAUDE.md](CLAUDE.md) for the project rules.

## Credits

- [openWB/core](https://github.com/openWB/core) (GPL-3.0): the topic layout and the write recipe of its simple API
  were read from its source code; no code is copied.
- [MQTT.js](https://github.com/mqttjs/MQTT.js) (MIT).
- Cover: the official openWB logo, from [openwb.de](https://openwb.de).

This integration is not affiliated with or endorsed by openWB GmbH & Co. KG.

## License

[Apache-2.0](LICENSE)
