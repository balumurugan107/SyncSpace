/**
 * Thin fetch wrapper used by every API call in the app.
 *
 * - The access token lives only in memory (this module), never in localStorage,
 *   so an XSS bug cannot exfiltrate a long-lived credential.
 * - The refresh token is an httpOnly cookie the browser attaches automatically to
 *   /api/auth/* requests; this code never sees it.
 * - When a request fails with TOKEN_EXPIRED, we refresh once and retry. Concurrent
 *   failures share a single in-flight refresh so the token is rotated only once.
 */

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown; requestId?: string };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field-level validation messages keyed by field name. */
  get fieldErrors(): Record<string, string> {
    if (this.code !== 'VALIDATION_ERROR' || !Array.isArray(this.details)) return {};
    return Object.fromEntries(
      (this.details as { field: string; message: string }[]).map((detail) => [detail.field, detail.message]),
    );
  }
}

export interface SessionPayload {
  user: User;
  accessToken: string;
  expiresIn: number;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  lastLoginAt: string | null;
}

let accessToken: string | null = null;
let refreshInFlight: Promise<SessionPayload | null> | null = null;
let onSessionChange: ((session: SessionPayload | null) => void) | null = null;

export function getAccessToken(): string | null { return accessToken; }

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** The auth provider subscribes so a background refresh or forced logout updates the UI. */
export function subscribeToSession(listener: (session: SessionPayload | null) => void): () => void {
  onSessionChange = listener;
  return () => {
    if (onSessionChange === listener) onSessionChange = null;
  };
}

async function parseError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
  return new ApiError(
    response.status,
    body?.error.code ?? 'HTTP_ERROR',
    body?.error.message ?? `Request failed with status ${response.status}`,
    body?.error.details,
  );
}

async function rawRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  return fetch(`/api${path}`, { ...init, headers, credentials: 'same-origin' });
}

async function performRefresh(): Promise<SessionPayload | null> {
  // One retry covers the benign multi-tab race (REFRESH_TOKEN_STALE): another tab
  // rotated the cookie a moment ago and the browser now holds the newer one.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' });
    if (response.ok) {
      const session = (await response.json()) as SessionPayload;
      accessToken = session.accessToken;
      onSessionChange?.(session);
      return session;
    }
    const error = await parseError(response);
    if (error.code !== 'REFRESH_TOKEN_STALE') break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  accessToken = null;
  onSessionChange?.(null);
  return null;
}

/** Exchanges the refresh cookie for a new access token. Deduplicates concurrent calls. */
export function refreshSession(): Promise<SessionPayload | null> {
  refreshInFlight ??= performRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await rawRequest(path, init);

  if (response.status === 401 && accessToken) {
    const error = await parseError(response.clone());
    if (error.code === 'TOKEN_EXPIRED' && (await refreshSession())) {
      response = await rawRequest(path, init);
    }
  }

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string) => apiRequest<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => apiRequest<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T = void>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
};
