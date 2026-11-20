import type { Request } from 'express';
import { Errors } from '../errors/app-error.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reads a UUID route parameter. A malformed id cannot exist, so it is a 404
 * (and never reaches PostgreSQL, where it would raise a type error -> 500).
 */
export function uuidParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw Errors.notFound();
  return value;
}
