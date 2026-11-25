// -----------------------------------------------------------------------------
// Integration configuration: defaults (mirroring the `config_schema` of the
// manifest) and normalization, so the rest of the code never sees a string
// where a number is expected, nor `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

export const DEFAULT_CONFIG = {
  host: '',
  port: 1883,
  tls: false,
  username: '',
  password: '',
  allow_control: false,
  language: 'fr',
};

/** `mqtt://openwb.local:1883`, `192.0.2.10`, `[::1]` -> the bare host name. */
function cleanHost(value) {
  let host = String(value ?? '').trim();
  host = host.replace(/^[a-z]+:\/\//i, '');
  host = host.replace(/\/.*$/, '');
  // A port typed with the host (not an IPv6 address): dropped, the port field rules.
  if (/^[^:[\]]+:\d+$/.test(host)) {
    host = host.replace(/:\d+$/, '');
  }
  return host;
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const port = Number.parseInt(String(raw.port ?? ''), 10);
  const language = LANGUAGES.includes(raw.language) ? raw.language : DEFAULT_CONFIG.language;
  return {
    host: cleanHost(raw.host),
    port: Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_CONFIG.port,
    tls: raw.tls === true || raw.tls === 'true',
    username: typeof raw.username === 'string' ? raw.username.trim() : '',
    password: typeof raw.password === 'string' ? raw.password : '',
    allow_control: raw.allow_control === true || raw.allow_control === 'true',
    language,
  };
}

/** What changes the MQTT connection (the rest is applied live). */
export function connectionKey(config) {
  return JSON.stringify([config.host, config.port, config.tls, config.username, config.password]);
}
