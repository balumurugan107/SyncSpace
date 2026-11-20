import { pino } from 'pino';
import { config } from '../../config/env.js';

/**
 * Structured JSON logger. Every line is machine-parseable (for Grafana/Loki or
 * any log pipeline later). In development the output is pretty-printed.
 * Sensitive fields are redacted so secrets never reach the logs.
 */
export const logger = pino({
  level: config.NODE_ENV === 'test' ? 'silent' : config.LOG_LEVEL,
  base: { service: 'syncspace-api', version: config.APP_VERSION },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.refreshToken',
      '*.accessToken',
    ],
    censor: '[REDACTED]',
  },
  ...(config.NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } } }
    : {}),
});

export type Logger = typeof logger;
