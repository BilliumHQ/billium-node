import { BilliumApiError, BilliumError } from './errors';
import { SDK_VERSION } from './version';

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 30_000;

// HTTP statuses where a retry is worth trying. 5xx are usually transient
// (database blip, deploy in progress, upstream timeout), and 429 means the
// server is asking us to back off — Retry-After tells us how long.
const RETRYABLE_STATUSES = new Set<number>([429, 500, 502, 503, 504]);

// HTTP methods we will retry without an explicit opt-in. POST is intentionally
// excluded because it can create resources — retrying a POST that already
// succeeded server-side (but the response was lost in transit) would create a
// duplicate. POSTs only get retried when the caller passes an Idempotency-Key
// header, which lets the server deduplicate the second attempt.
const ALWAYS_RETRYABLE_METHODS = new Set(['GET', 'PUT', 'DELETE', 'PATCH']);

// User-Agent reported by every request. Sent so backend operators can
// segment traffic by SDK version (e.g. for deprecation metrics or per-SDK
// rate limit policies). The Node version helps debug issues that only
// reproduce on certain runtimes.
const USER_AGENT = `billium-node/${SDK_VERSION} (node/${process.version})`;

// Prefix Billium uses to mark public (browser-safe, scope-limited) API keys.
// PUBLIC keys can only call invoice.create / invoice.view / product.view —
// they specifically cannot call any of the webhook management endpoints,
// invoices.cancel, or anything that mutates state beyond invoice creation.
//
// The SDK detects this prefix at construct time and surfaces a clear error
// when a user calls a method that requires a SECRET key, instead of letting
// the request hit the backend and come back with a generic 403.
const PUBLIC_KEY_PREFIX = 'pk_';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HttpClientOptions {
  /**
   * Maximum number of retry attempts after the initial request fails.
   * Total HTTP calls = maxRetries + 1. Set to 0 to disable retries entirely.
   * @default 2
   */
  maxRetries?: number;

  /**
   * Initial backoff delay in milliseconds. Subsequent retries use
   * exponential backoff with full jitter, capped at `maxDelayMs`.
   * @default 500
   */
  baseDelayMs?: number;

  /**
   * Upper bound for the backoff delay between retries.
   * @default 30000
   */
  maxDelayMs?: number;
}

/**
 * Acceptable shape for query string params: any object whose values are
 * primitives the URL spec can serialize. `undefined` and `null` values are
 * dropped at serialization time (so callers can spread optional fields
 * without filtering them first), and non-primitive values are skipped.
 *
 * Typed as `Readonly<Record<string, unknown>>` rather than a stricter union
 * so user-defined interfaces with optional properties (e.g.
 * `{ page?: number; limit?: number }`) can be passed directly without an
 * `as Record<…>` cast — TypeScript's "weak type detection" otherwise
 * refuses to widen interfaces with all-optional properties into a stricter
 * value union.
 */
export type QueryParams = Readonly<Record<string, unknown>>;

export interface RequestOptions {
  body?: unknown;
  params?: QueryParams;
  headers?: Record<string, string>;
}

// ─── Client ──────────────────────────────────────────────────────────────────

export class HttpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly isPublicKey: boolean;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;

  constructor(baseUrl: string, apiKey: string, options: HttpClientOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    // Detect public-key prefix once, at construct time. We don't validate
    // any other format here — letting the backend reject unknown prefixes
    // with 401 keeps the SDK forward-compatible with future key formats.
    this.isPublicKey = apiKey.startsWith(PUBLIC_KEY_PREFIX);
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    this.maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  }

  /**
   * Throws a `BilliumError` if the configured key is a public key (`pk_*`).
   *
   * Used by methods that the backend won't accept a public key for —
   * webhook management, invoice cancellation, anything that mutates state
   * beyond invoice creation. Surfacing the error in the SDK rather than
   * letting it round-trip to the backend gives developers a clear,
   * actionable message instead of a generic `403 Insufficient permissions`.
   *
   * @param method - Dotted method name for the error message ("webhooks.create", etc.)
   */
  assertSecretKey(method: string): void {
    if (this.isPublicKey) {
      throw new BilliumError(
        `${method}() requires a secret key (sk_*). You passed a public key (pk_*), ` +
          `which only has scope for invoice.create, invoice.view, and product.view. ` +
          `Generate a secret key in the Billium dashboard under Settings → Developer → API keys.`,
      );
    }
  }

  // ─── Verb wrappers ─────────────────────────────────────────────────────────

  get<T>(path: string, params?: object): Promise<T> {
    // Accepts `object` at the boundary (not `QueryParams`) so user-defined
    // interfaces with all-optional properties — `{ page?: number }` and
    // friends — can be passed without an `as Record<…>` cast on the
    // caller side. The internal `request()` path coerces values to strings
    // when building the URL, so any plain object whose values are
    // string-coercible will work.
    return this.request<T>('GET', path, { params: params as QueryParams });
  }

  post<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('POST', path, { ...options, body });
  }

  put<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('PUT', path, { ...options, body });
  }

  patch<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('PATCH', path, { ...options, body });
  }

  delete<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('DELETE', path, options);
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const url = this.buildUrl(path, options.params);

    // Per-request headers override the defaults so callers can drop in things
    // like `Idempotency-Key` without losing auth or content-type.
    const headers: Record<string, string> = {
      ...this.headers(),
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    };

    const init: RequestInit = {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    };

    const canRetryMethod =
      ALWAYS_RETRYABLE_METHODS.has(method) || hasIdempotencyKey(headers);

    const maxAttempts = canRetryMethod ? this.maxRetries + 1 : 1;

    let lastNetworkError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, init);
      } catch (err) {
        // Network failure (DNS, ECONNREFUSED, TLS handshake, AbortError…).
        // fetch throws TypeError or DOMException — never a BilliumError.
        lastNetworkError = err;
        if (attempt < maxAttempts - 1) {
          await this.sleep(this.computeDelay(attempt, null));
          continue;
        }
        throw err;
      }

      // Successful HTTP exchange but the server is asking us to back off.
      // Don't read the body yet — we'll just retry. Reading would consume it
      // and force us to clone for the next attempt.
      if (
        !res.ok &&
        RETRYABLE_STATUSES.has(res.status) &&
        attempt < maxAttempts - 1
      ) {
        await this.sleep(this.computeDelay(attempt, res));
        continue;
      }

      // Either the response was OK, or it failed with a non-retryable code
      // (4xx mostly), or we've exhausted retries on a retryable status.
      // Either way, parse it now and let parse() throw on non-2xx.
      return this.parse<T>(res);
    }

    // Unreachable in practice — the loop either returns or throws on the
    // last iteration. Kept to satisfy strict TypeScript control-flow analysis.
    throw lastNetworkError ?? new Error('HttpClient: retry loop exited unexpectedly');
  }

  private headers(): Record<string, string> {
    return {
      'x-api-key': this.apiKey,
      'User-Agent': USER_AGENT,
    };
  }

  private buildUrl(path: string, params?: QueryParams): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        // Drop undefined/null so callers can spread optional fields
        // straight into the params bag without filtering them first.
        if (value === undefined || value === null) continue;
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private async parse<T>(res: Response): Promise<T> {
    let body: unknown;
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      body = await res.json();
    } else {
      body = await res.text();
    }

    if (!res.ok) {
      const message =
        body &&
        typeof body === 'object' &&
        'message' in body &&
        typeof (body as Record<string, unknown>).message === 'string'
          ? ((body as Record<string, unknown>).message as string)
          : `Request failed with status ${res.status}`;

      const code =
        body &&
        typeof body === 'object' &&
        'error' in body &&
        typeof (body as Record<string, unknown>).error === 'string'
          ? ((body as Record<string, unknown>).error as string)
          : undefined;

      throw new BilliumApiError(message, res.status, code);
    }

    return body as T;
  }

  /**
   * Returns the number of milliseconds to wait before the next retry.
   *
   * Honors a `Retry-After` header on the response when present (parsed as
   * either a delta-seconds integer or an HTTP date). Otherwise falls back
   * to exponential backoff with full jitter — randomizing across the entire
   * `[0, exponentialCeiling]` range to avoid retry storms when many
   * clients fail simultaneously.
   */
  private computeDelay(attempt: number, res: Response | null): number {
    if (res) {
      const retryAfter = res.headers.get('retry-after');
      if (retryAfter) {
        // Try integer seconds first (most common form).
        const seconds = parseInt(retryAfter, 10);
        if (!isNaN(seconds) && seconds >= 0) {
          return Math.min(seconds * 1000, this.maxDelayMs);
        }
        // Then HTTP date form ("Wed, 21 Oct 2026 07:28:00 GMT").
        const date = Date.parse(retryAfter);
        if (!isNaN(date)) {
          const diff = date - Date.now();
          if (diff > 0) return Math.min(diff, this.maxDelayMs);
        }
      }
    }

    const exponentialCeiling = Math.min(
      this.baseDelayMs * Math.pow(2, attempt),
      this.maxDelayMs,
    );
    return Math.floor(Math.random() * exponentialCeiling);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns true if `headers` contains an `Idempotency-Key` entry (case
 * insensitive). When set, the server is expected to deduplicate retries on
 * POST endpoints, so the client is free to retry safely.
 */
function hasIdempotencyKey(headers: Record<string, string>): boolean {
  return Object.keys(headers).some((k) => k.toLowerCase() === 'idempotency-key');
}
