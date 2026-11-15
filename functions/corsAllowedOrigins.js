/**
 * Allowed browser origins for public HTTP functions (matches game server defaults).
 */

const PRODUCTION_ORIGINS = [
  'https://stealorreveal.com',
  'https://www.stealorreveal.com',
  'https://better-white-elephant.web.app',
];

/**
 * @param {{ clientUrl?: string, allowedOriginsCsv?: string, nodeEnv?: string }} [opts]
 */
export function buildAllowedOrigins(opts = {}) {
  const origins = new Set();
  origins.add('http://localhost:5173');
  origins.add('http://127.0.0.1:5173');

  const clientUrl = opts.clientUrl ?? process.env.CLIENT_URL;
  if (clientUrl && typeof clientUrl === 'string') {
    const trimmed = clientUrl.trim();
    if (trimmed) {
      origins.add(trimmed.replace(/\/$/, ''));
    }
  }

  const csv = opts.allowedOriginsCsv ?? process.env.ALLOWED_ORIGINS;
  if (csv && typeof csv === 'string') {
    for (const part of csv.split(',')) {
      const trimmed = part.trim();
      if (trimmed) {
        origins.add(trimmed.replace(/\/$/, ''));
      }
    }
  }

  const nodeEnv = opts.nodeEnv ?? process.env.NODE_ENV;
  const hasExplicitList = Boolean(csv && csv.trim());
  if (nodeEnv === 'production' && !hasExplicitList) {
    for (const origin of PRODUCTION_ORIGINS) {
      origins.add(origin);
    }
  }

  return Array.from(origins);
}

/**
 * @param {string | undefined} origin
 * @param {string[]} allowedOrigins
 */
export function isOriginAllowed(origin, allowedOrigins) {
  if (!origin || typeof origin !== 'string') {
    return false;
  }
  const normalized = origin.trim().replace(/\/$/, '');
  return allowedOrigins.includes(normalized);
}