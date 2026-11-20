import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../errors/app-error.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` } });
};

/**
 * The single place where errors become HTTP responses. Every error body has the
 * same shape: { error: { code, message, details?, requestId } }.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = String(req.id ?? '');

  if (err instanceof AppError) {
    if (err.statusCode >= 500) req.log.error({ err }, err.message);
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details, requestId },
    });
    return;
  }

  // Malformed JSON from express.json()
  if (err instanceof SyntaxError && 'status' in err && err.status === 400) {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON', requestId } });
    return;
  }

  // Payload too large etc. raised by body parsers.
  if (typeof err === 'object' && err !== null && 'status' in err && typeof err.status === 'number' && err.status < 500) {
    res.status(err.status).json({ error: { code: 'BAD_REQUEST', message: String((err as Error).message), requestId } });
    return;
  }

  req.log.error({ err }, 'Unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', requestId } });
};
