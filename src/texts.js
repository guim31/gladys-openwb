// -----------------------------------------------------------------------------
// Every text the container produces, in the four languages of the Gladys
// interface (German says "du", Spanish "usted"). Feature names follow the
// `language` setting: Gladys does not tell a device integration the user's
// language, and the names are frozen once the device is added.
// -----------------------------------------------------------------------------

import { CHARGING_STATE } from './openwb/model.js';

export const NAMES = {
  en: {
    mode: 'Charging mode',
    plugged: 'Vehicle plugged in',
    charging_state: 'Charging state',
    charge_power: 'Charging power',
    charge_current: 'Charging current',
    target_current: 'Instant charging current',
    session_energy: 'Session energy',
    vehicle_soc: 'Vehicle battery',
    meter: 'Charger meter',
    grid_power: 'Grid',
    grid_import: 'Grid import',
    grid_export: 'Grid export',
    home_power: 'Home consumption',
    pv_power: 'Solar production',
    pv_energy: 'Solar yield',
    battery_level: 'Home battery',
    battery_charge_power: 'Battery charging',
    battery_discharge_power: 'Battery discharging',
  },
  fr: {
    mode: 'Mode de charge',
    plugged: 'Véhicule branché',
    charging_state: 'État de la charge',
    charge_power: 'Puissance de charge',
    charge_current: 'Intensité de charge',
    target_current: 'Intensité en charge immédiate',
    session_energy: 'Énergie de la session',
    vehicle_soc: 'Batterie du véhicule',
    meter: 'Compteur de la borne',
    grid_power: 'Réseau',
    grid_import: 'Import réseau',
    grid_export: 'Export réseau',
    home_power: 'Consommation maison',
    pv_power: 'Production solaire',
    pv_energy: 'Production solaire cumulée',
    battery_level: 'Batterie maison',
    battery_charge_power: 'Charge batterie',
    battery_discharge_power: 'Décharge batterie',
  },
  de: {
    mode: 'Lademodus',
    plugged: 'Fahrzeug angesteckt',
    charging_state: 'Ladezustand',
    charge_power: 'Ladeleistung',
    charge_current: 'Ladestrom',
    target_current: 'Strom für Sofortladen',
    session_energy: 'Energie des Ladevorgangs',
    vehicle_soc: 'Fahrzeugbatterie',
    meter: 'Zähler der Wallbox',
    grid_power: 'Netz',
    grid_import: 'Netzbezug',
    grid_export: 'Netzeinspeisung',
    home_power: 'Hausverbrauch',
    pv_power: 'Solarproduktion',
    pv_energy: 'Solarertrag',
    battery_level: 'Hausbatterie',
    battery_charge_power: 'Batterie lädt',
    battery_discharge_power: 'Batterie entlädt',
  },
  es: {
    mode: 'Modo de carga',
    plugged: 'Vehículo conectado',
    charging_state: 'Estado de la carga',
    charge_power: 'Potencia de carga',
    charge_current: 'Intensidad de carga',
    target_current: 'Intensidad de carga inmediata',
    session_energy: 'Energía de la sesión',
    vehicle_soc: 'Batería del vehículo',
    meter: 'Contador del cargador',
    grid_power: 'Red',
    grid_import: 'Importación de red',
    grid_export: 'Exportación a red',
    home_power: 'Consumo de la casa',
    pv_power: 'Producción solar',
    pv_energy: 'Producción solar acumulada',
    battery_level: 'Batería de la casa',
    battery_charge_power: 'Batería cargando',
    battery_discharge_power: 'Batería descargando',
  },
};

// Mode labels; German uses openWB's own names.
export const MODE_LABELS = {
  en: {
    instant_charging: 'Instant',
    pv_charging: 'Solar',
    eco_charging: 'Eco',
    scheduled_charging: 'Target',
    stop: 'Stop',
    bidi_charging: 'Bidirectional',
  },
  fr: {
    instant_charging: 'Immédiate',
    pv_charging: 'Solaire',
    eco_charging: 'Éco',
    scheduled_charging: 'Objectif',
    stop: 'Arrêt',
    bidi_charging: 'Bidirectionnelle',
  },
  de: {
    instant_charging: 'Sofortladen',
    pv_charging: 'PV-Laden',
    eco_charging: 'Eco-Laden',
    scheduled_charging: 'Zielladen',
    stop: 'Stop',
    bidi_charging: 'Bidirektional',
  },
  es: {
    instant_charging: 'Inmediata',
    pv_charging: 'Solar',
    eco_charging: 'Eco',
    scheduled_charging: 'Objetivo',
    stop: 'Parada',
    bidi_charging: 'Bidireccional',
  },
};

export const STATE_LABELS = {
  en: {
    [CHARGING_STATE.CHARGING]: 'Charging',
    [CHARGING_STATE.EV_CONNECTED]: 'Plugged in',
    [CHARGING_STATE.PAUSED_BY_VEHICLE]: 'Paused by the car',
    [CHARGING_STATE.PAUSED_BY_CHARGER]: 'Waiting',
    [CHARGING_STATE.IDLE]: 'Free',
  },
  fr: {
    [CHARGING_STATE.CHARGING]: 'En charge',
    [CHARGING_STATE.EV_CONNECTED]: 'Branché',
    [CHARGING_STATE.PAUSED_BY_VEHICLE]: 'Pause du véhicule',
    [CHARGING_STATE.PAUSED_BY_CHARGER]: 'En attente',
    [CHARGING_STATE.IDLE]: 'Libre',
  },
  de: {
    [CHARGING_STATE.CHARGING]: 'Lädt',
    [CHARGING_STATE.EV_CONNECTED]: 'Angesteckt',
    [CHARGING_STATE.PAUSED_BY_VEHICLE]: 'Pause vom Auto',
    [CHARGING_STATE.PAUSED_BY_CHARGER]: 'Wartet',
    [CHARGING_STATE.IDLE]: 'Frei',
  },
  es: {
    [CHARGING_STATE.CHARGING]: 'Cargando',
    [CHARGING_STATE.EV_CONNECTED]: 'Conectado',
    [CHARGING_STATE.PAUSED_BY_VEHICLE]: 'Pausa del vehículo',
    [CHARGING_STATE.PAUSED_BY_CHARGER]: 'En espera',
    [CHARGING_STATE.IDLE]: 'Libre',
  },
};

/** Connection status shown by Gladys (setConnectionStatus takes the object). */
export const STATUS = {
  no_host: {
    en: 'Enter the address of your openWB in the configuration.',
    fr: "Saisissez l'adresse de votre openWB dans la configuration.",
    de: 'Gib die Adresse deiner openWB in der Konfiguration ein.',
    es: 'Introduzca la dirección de su openWB en la configuración.',
  },
  unreachable: {
    en: 'The MQTT broker of openWB does not answer: check the address, the port and the TLS option.',
    fr: "Le broker MQTT de l'openWB ne répond pas : vérifiez l'adresse, le port et l'option TLS.",
    de: 'Der MQTT-Broker der openWB antwortet nicht: prüfe Adresse, Port und TLS-Option.',
    es: 'El broker MQTT de openWB no responde: compruebe la dirección, el puerto y la opción TLS.',
  },
  refused: {
    en: 'The MQTT broker of openWB refused the user name or the password.',
    fr: "Le broker MQTT de l'openWB a refusé le nom d'utilisateur ou le mot de passe.",
    de: 'Der MQTT-Broker der openWB hat Benutzername oder Passwort abgelehnt.',
    es: 'El broker MQTT de openWB rechazó el nombre de usuario o la contraseña.',
  },
  no_data: {
    en: 'Connected to the broker, but no openWB 2.x data: is this the broker of an openWB 2?',
    fr: "Connecté au broker, mais aucune donnée openWB 2.x : est-ce bien le broker d'une openWB 2 ?",
    de: 'Mit dem Broker verbunden, aber keine Daten von openWB 2.x: ist das der Broker einer openWB 2?',
    es: 'Conectado al broker, pero sin datos de openWB 2.x: ¿es el broker de una openWB 2?',
  },
  init_failed: {
    en: 'The openWB integration could not start: see its logs.',
    fr: "L'intégration openWB n'a pas pu démarrer : consultez ses journaux.",
    de: 'Die openWB-Integration konnte nicht starten: sieh in ihre Logs.',
    es: 'La integración openWB no pudo iniciarse: consulte sus registros.',
  },
};

/** Failure messages of the actions (thrown, shown in red). */
export const FAILURES = {
  not_connected: () => ({
    en: 'openWB is not connected: check the configuration of the integration.',
    fr: "L'openWB n'est pas connectée : vérifiez la configuration de l'intégration.",
    de: 'openWB ist nicht verbunden: prüfe die Konfiguration der Integration.',
    es: 'openWB no está conectada: compruebe la configuración de la integración.',
  }),
  unknown_chargepoint: () => ({
    en: 'Unknown chargepoint: choose a chargepoint of openWB.',
    fr: 'Point de charge inconnu : choisissez un point de charge openWB.',
    de: 'Unbekannter Ladepunkt: wähle einen Ladepunkt der openWB.',
    es: 'Punto de carga desconocido: elija un punto de carga de openWB.',
  }),
  unknown_mode: () => ({
    en: 'Unknown charging mode.',
    fr: 'Mode de charge inconnu.',
    de: 'Unbekannter Lademodus.',
    es: 'Modo de carga desconocido.',
  }),
  control_disabled: () => ({
    en: 'Control is off: enable "Allow control" in the configuration (Stop is always allowed).',
    fr: 'Pilotage désactivé : activez « Autoriser le pilotage » dans la configuration (Arrêt reste permis).',
    de: 'Steuerung aus: aktiviere „Steuerung erlauben“ in der Konfiguration (Stop geht immer).',
    es: 'Control desactivado: active «Permitir el control» en la configuración (Parada siempre se permite).',
  }),
  no_profile: () => ({
    en: 'openWB has not sent the charging profile of this chargepoint yet.',
    fr: "L'openWB n'a pas encore envoyé le profil de charge de ce point de charge.",
    de: 'openWB hat das Lade-Profil dieses Ladepunkts noch nicht gesendet.',
    es: 'openWB aún no ha enviado el perfil de carga de este punto de carga.',
  }),
  out_of_range: (min, max) => ({
    en: `The current must be a whole number between ${min} and ${max} A.`,
    fr: `L'intensité doit être un nombre entier entre ${min} et ${max} A.`,
    de: `Der Strom muss eine ganze Zahl zwischen ${min} und ${max} A sein.`,
    es: `La intensidad debe ser un número entero entre ${min} y ${max} A.`,
  }),
  not_confirmed: () => ({
    en: 'openWB did not apply the change: is it running, and may this MQTT user write?',
    fr: "L'openWB n'a pas appliqué le changement : tourne-t-elle, et cet utilisateur MQTT peut-il écrire ?",
    de: 'openWB hat die Änderung nicht übernommen: läuft sie, und darf dieser MQTT-Benutzer schreiben?',
    es: 'openWB no aplicó el cambio: ¿está en marcha y puede escribir este usuario MQTT?',
  }),
  no_chargepoint: () => ({
    en: 'Connected to the broker, but openWB reported no chargepoint.',
    fr: "Connecté au broker, mais l'openWB n'a signalé aucun point de charge.",
    de: 'Mit dem Broker verbunden, aber openWB meldet keinen Ladepunkt.',
    es: 'Conectado al broker, pero openWB no informó de ningún punto de carga.',
  }),
};

export function failure(code, ...args) {
  return FAILURES[code](...args);
}

/** Success of a mode change. */
export function modeSetMessage(chargepoint, mode) {
  const label = (lang) => MODE_LABELS[lang][mode] ?? mode;
  return {
    en: `${chargepoint}: charging mode ${label('en')}.`,
    fr: `${chargepoint} : mode de charge ${label('fr')}.`,
    de: `${chargepoint}: Lademodus ${label('de')}.`,
    es: `${chargepoint}: modo de carga ${label('es')}.`,
  };
}

/** Success of the connection test. */
export function testMessage(count, names) {
  const list = names.join(', ').slice(0, 120);
  return {
    en: `Connected to openWB: ${count} chargepoint(s) (${list}).`,
    fr: `Connecté à l'openWB : ${count} point(s) de charge (${list}).`,
    de: `Mit openWB verbunden: ${count} Ladepunkt(e) (${list}).`,
    es: `Conectado a openWB: ${count} punto(s) de carga (${list}).`,
  };
}
