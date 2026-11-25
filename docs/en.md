# openWB

The integration brings an **openWB 2.x** wallbox into Gladys, locally, through the MQTT broker that runs on the
openWB. It follows every chargepoint live (plugged in, charging, power, energy), the grid, solar and battery
meters openWB knows, fires scene triggers when a vehicle is plugged in or a charge ends, and can change the
charging mode and the instant charging current.

> Developed without the hardware, from the source code of openWB 2 (openWB/core) and tested against a real
> Mosquitto broker replaying its topics: feedback welcome.

## Requirements

- An openWB running the **2.x** software (series 2, Pro, or any openWB updated to 2.x). The 1.9 software uses
  other topics and is not supported.
- Gladys 5.1 or later, on the same network as the openWB.
- Access to the broker of the openWB:
  - **port 1883 (unencrypted)**: in openWB, under _System → Sicherheit_, turn on _Unverschlüsselten Zugang
    erlauben_;
  - or **port 8883 with TLS**, open by default: tick _TLS_ in the integration. openWB uses a self-signed
    certificate, which the integration accepts.
- If the user management of openWB (_Benutzerverwaltung_) is on: port 8883 with TLS (openWB then closes port
  1883), an openWB user and its password. To change modes, this user needs write access to its chargepoints.

## Configuration

| Field                         | What to enter                                               |
| ----------------------------- | ----------------------------------------------------------- |
| openWB address                | IP address or host name of the openWB, e.g. `192.168.1.30`  |
| MQTT port                     | `1883` (unencrypted) or `8883` (TLS)                        |
| TLS                           | Ticked for port 8883                                        |
| MQTT user and password        | Only with the user management of openWB                     |
| Allow control                 | Off by default: lets Gladys change the mode and the current |
| Language of the feature names | Used once, when the devices are created; French by default  |

Then use **Test the connection**: it lists the chargepoints openWB reports. The devices appear in the
**Discovery** tab of the integration: add those you want.

**Stop is always allowed**, even with control off: stopping a charge is never dangerous. The other modes and
the current need _Allow control_.

## The devices

### Chargepoint

One device per chargepoint of openWB, named as in openWB:

- **Charging mode** (controllable): Instant, Solar, Eco, Target, Stop. openWB's _Min + PV_ is the Solar mode
  with a minimum current set in its charging profile;
- **Vehicle plugged in**, **Charging state** (charging, plugged in, paused by the car, waiting for openWB, free);
- **Charging power** (kW), **Charging current** (A, highest phase);
- **Instant charging current** (controllable, 6 to 32 A): the current of the Instant mode;
- **Session energy** (kWh): the energy of the current session, kept after unplugging;
- **Charger meter** (kWh): the meter of the chargepoint, which the Gladys energy module can use;
- **Vehicle battery** (%), only when openWB knows it (a SoC module for the vehicle, or a charger that reads it).

### openWB site

Created when openWB measures any of it:

- **Grid** (W, import positive, export negative), **Grid import** and **Grid export** (kWh meters);
- **Home consumption** (W);
- **Solar production** (W) and **Solar yield** (kWh meter);
- **Home battery** (%), **Battery charging** and **Battery discharging** (W).

## Dashboard widget

The **openWB** widget shows solar, home and grid as tiles, one line per chargepoint (state, power, battery
level, mode) and the home battery, and mode buttons for one chargepoint (chosen in the widget settings, the
first one otherwise): Instant, Solar, Eco and Stop with control allowed, Stop alone otherwise. The current mode
carries a check mark. Two settings hide the tiles and the buttons.

## Scene triggers

| Trigger            | When                                                          | Variables                             |
| ------------------ | ------------------------------------------------------------- | ------------------------------------- |
| Vehicle plugged in | A vehicle is plugged into a chargepoint                       | chargepoint, vehicle                  |
| Vehicle unplugged  | A vehicle is unplugged                                        | chargepoint, vehicle, energy (kWh)    |
| Charging started   | A charge starts (a short pause is not a new charge)           | chargepoint, vehicle                  |
| Charging finished  | A charge stopped for 10 minutes, or the vehicle was unplugged | chargepoint, vehicle, energy, battery |

Each trigger can be limited to one chargepoint; _Charging started_ also to one mode. The vehicle is the one
openWB assigned to the chargepoint. The battery level is -1 when openWB does not know it.

## Scene actions

- **Set the charging mode** of a chargepoint. Stop is always allowed, the other modes need control.
- **Set the instant charging current** (6 to 32 A), with control allowed.

The integration waits until openWB has applied the change (15 seconds at most); otherwise the action fails
with a message.

## Scene examples

- At 22:00, set the mode to Instant (off-peak hours), and back to Solar at 6:00.
- When a charge is finished, send a message with the energy charged.
- When the grid price is high (another integration), set the chargepoint to Stop.

## Troubleshooting

- **"The MQTT broker of openWB does not answer"**: check the address, and that the unencrypted access is allowed in
  openWB for port 1883 (or use 8883 with TLS).
- **"refused the user name or the password"**: the user management of openWB is on; use port 8883 with TLS and an
  openWB user.
- **"no openWB 2.x data"**: the broker answers but publishes no `openWB/...` topic. Is it an openWB 2? A 1.9
  software is not supported.
- **"openWB did not apply the change"**: openWB is not running its control loop, or the MQTT user may not write
  to this chargepoint.

## Limitations

- openWB 2.x only, through its MQTT broker; no cloud.
- Changing the mode or the current edits the **charging profile** active on the chargepoint, as openWB's own
  simple API does. If several chargepoints or vehicles share this profile, openWB applies the change to them
  too (unless its "temporary charging profiles" are on).
- Target charging plans, time charging and battery settings are not edited from Gladys.
- Developed without the hardware: feedback welcome on the forum.
