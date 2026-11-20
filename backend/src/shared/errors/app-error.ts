/**
 * Expected, client-facing errors. Anything thrown that is NOT an AppError is
 * treated as an unexpected bug: logged in full and returned as a generic 500.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  validation: (details: unknown) => new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', details),
  unauthorized: (message = 'Authentication required', code = 'UNAUTHORIZED') => new AppError(401, code, message),
  forbidden: (message = 'You do not have access to this resource') => new AppError(403, 'FORBIDDEN', message),
  notFound: (message = 'Resource not found') => new AppError(404, 'NOT_FOUND', message),
  conflict: (message: string, code = 'CONFLICT') => new AppError(409, code, message),
};
