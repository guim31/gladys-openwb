# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- The openWB 2.x wallbox in Gladys, locally through its MQTT broker (port 1883, or 8883 with TLS, with or
  without an openWB user).
- One device per chargepoint: charging mode and instant charging current (controllable), plugged in, charging
  state, power, current, session energy, charger meter, vehicle battery when openWB knows it.
- The openWB site: grid exchange and meters, home consumption, solar production and yield, home battery.
- Scene triggers: vehicle plugged in, vehicle unplugged, charging started, charging finished.
- Scene actions: set the charging mode, set the instant charging current. Control is off by default; Stop is
  always allowed. Every command waits for openWB's confirmation.
- A dashboard widget: energy tiles, one line per chargepoint, mode buttons.
- Documentation in English, French, German and Spanish.
