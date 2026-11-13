/**
 * GEOVENTRA — typed HTTP client for the Geoventra API.
 *
 * Responsibilities:
 *   - resolve the API base URL from the environment;
 *   - attach the bearer token of the current session;
 *   - serialise query parameters and JSON bodies;
 *   - surface a typed {@link ApiError} for every non-2xx response;
 *   - transparently refresh an expired access token once and retry the call;
 *   - sign the user out when the session cannot be recovered.
 *
 * The auth store registers itself through {@link setAuthBridge} so this module
 * never has to import the store (which would create an import cycle).
 */

import type { AuthSession } from '@geoventra/contracts';

/** Runtime environment injected by the server (window.__ENV__) for port-flexible testing. */
declare global {
  interface Window {
    __ENV__?: { NEXT_PUBLIC_API_URL?: string; NEXT_PUBLIC_WS_URL?: string };
  }
}

function runtimeEnv(key: 'NEXT_PUBLIC_API_URL' | 'NEXT_PUBLIC_WS_URL', fallback: string): string {
  if (typeof window !== 'undefined' && window.__ENV__?.[key]) {
    return window.__ENV__[key] as string;
  }
  return process.env[key] ?? fallback;
}

/** Base URL of the REST API, without a trailing slash. */
export const API_BASE_URL: string = (
  runtimeEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000/api/v1')
).replace(/\/+$/, '');

/** Base URL of the realtime (socket.io) server, without a trailing slash. */
export const WS_BASE_URL: string = (
  runtimeEnv('NEXT_PUBLIC_WS_URL', 'http://localhost:4000')
).replace(/\/+$/, '');

/** Values accepted by the query-string builder. */
export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue>;

/** Error raised for every unsuccessful HTTP response. */
export class ApiError extends Error {
  /** HTTP status code of the response. */
  readonly status: number;
  /** Parsed error body (JSON when available, otherwise the raw text). */
  readonly body: unknown;
  /** Absolute URL that produced the error. */
  readonly url: string;

  constructor(status: number, message: string, url: string, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.url = url;
    this.body = body;
  }

  /** True when the failure was caused by an expired or missing session. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

/**
 * Hook the auth store uses to hand tokens to the transport layer.
 * Implemented in `auth-store.ts`.
 */
export interface AuthBridge {
  /** Current bearer token, or `null` when signed out. */
  getAccessToken(): string | null;
  /** Current refresh token, or `null` when signed out. */
  getRefreshToken(): string | null;
  /** Exchange the refresh token for a new access token; `null` on failure. */
  refreshAccessToken(): Promise<string | null>;
  /** Drop the session (used when a refresh fails). */
  clearSession(): void;
}

let authBridge: AuthBridge | null = null;

/** Register (or clear) the bridge used to resolve bearer tokens. */
export function setAuthBridge(bridge: AuthBridge | null): void {
  authBridge = bridge;
}

/** Build a query string, skipping empty values. */
export function buildQueryString(params: QueryParams | undefined): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

/** Options accepted by {@link apiRequest} and {@link publicRequest}. */
export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  /** Query parameters appended to the URL. */
  query?: QueryParams;
  /** JSON-serialisable request body. */
  body?: unknown;
  /** Send the bearer token; defaults to `true`. */
  auth?: boolean;
  /** Attempt one token refresh + retry on 401; defaults to `true`. */
  retryOnUnauthorized?: boolean;
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('application/json')) {
      return (await response.json()) as unknown;
    }
    const text = await response.text();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

function extractMessage(body: unknown, fallback: string): string {
  if (typeof body === 'string' && body.length > 0) return body;
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    const message = record['message'];
    if (typeof message === 'string' && message.length > 0) return message;
    const error = record['error'];
    if (typeof error === 'string' && error.length > 0) return error;
  }
  return fallback;
}

async function execute<T>(path: string, options: ApiRequestOptions): Promise<T> {
  const {
    query,
    body,
    auth = true,
    retryOnUnauthorized = true,
    headers: providedHeaders,
    ...init
  } = options;

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${API_BASE_URL}${normalizedPath}${buildQueryString(query)}`;

  const headers = new Headers(providedHeaders ?? undefined);
  headers.set('Accept', 'application/json');
  if (body !== undefined) headers.set('Content-Type', 'application/json');

  if (auth) {
    const token = authBridge?.getAccessToken() ?? null;
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...init,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 401 && auth && retryOnUnauthorized && authBridge) {
    const refreshed = await authBridge.refreshAccessToken();
    if (refreshed) {
      return execute<T>(path, { ...options, retryOnUnauthorized: false });
    }
    authBridge.clearSession();
  }

  const parsed = await readBody(response);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      extractMessage(parsed, `Request failed with status ${response.status}`),
      url,
      parsed,
    );
  }

  return parsed as T;
}

/**
 * Perform an authenticated request.
 * A 401 triggers a single refresh + retry before the session is discarded.
 */
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  return execute<T>(path, { ...options, auth: options.auth ?? true });
}

/**
 * Perform an unauthenticated request (login, refresh).
 * Never sends a bearer token and never triggers the refresh flow.
 */
export async function publicRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  return execute<T>(path, { ...options, auth: false, retryOnUnauthorized: false });
}

/** Exchange a refresh token for a fresh session (used by the auth store). */
export async function requestRefreshedSession(refreshToken: string): Promise<AuthSession> {
  return publicRequest<AuthSession>('/auth/refresh', {
    method: 'POST',
    body: { refreshToken },
  });
}

/** Exchange credentials for a session (used by the auth store). */
export async function requestSession(email: string, password: string): Promise<AuthSession> {
  return publicRequest<AuthSession>('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

/** Best-effort server-side sign out. */
export async function requestLogout(): Promise<void> {
  await publicRequest<null>('/auth/logout', { method: 'POST' });
}
