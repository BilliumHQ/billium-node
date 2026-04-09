import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { HttpClient } from '../src/http';
import { BilliumApiError, BilliumError } from '../src/errors';

const BASE_URL = 'https://api.billium.to';
// Test fixture only — real keys are issued by the backend as `sk_<96 base62 chars>`.
// HttpClient doesn't validate the post-prefix portion; it only checks the
// `pk_` / `sk_` prefix to decide whether to allow secret-only methods.
const API_KEY = 'sk_test_fixture_not_a_real_key';

function mockFetch(status: number, body: unknown) {
  const json = async () => body;
  const text = async () => String(body);
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json,
    text,
  });
}

describe('HttpClient', () => {
  let client: HttpClient;

  beforeEach(() => {
    // Default the existing test suite to no-retry so the 5xx tests don't
    // burn ~1.5s sleeping on backoff. Retry behavior gets its own describe
    // block below with fake timers.
    client = new HttpClient(BASE_URL, API_KEY, { maxRetries: 0 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ─── GET ──────────────────────────────────────────────────────────────────

  describe('get()', () => {
    it('sends x-api-key header and returns parsed body', async () => {
      const fetch = mockFetch(200, { id: 'inv_1' });
      vi.stubGlobal('fetch', fetch);

      const result = await client.get<{ id: string }>('/api/v1/invoices');

      expect(fetch).toHaveBeenCalledOnce();
      const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/api/v1/invoices');
      expect((init.headers as Record<string, string>)['x-api-key']).toBe(API_KEY);
      expect(result).toEqual({ id: 'inv_1' });
    });

    it('sends a User-Agent identifying the SDK and Node version', async () => {
      const fetch = mockFetch(200, {});
      vi.stubGlobal('fetch', fetch);

      await client.get('/api/v1/invoices');

      const [, init] = fetch.mock.calls[0] as [string, RequestInit];
      const ua = (init.headers as Record<string, string>)['User-Agent'];
      // Format: `billium-node/<version> (node/<process.version>)`
      expect(ua).toMatch(/^billium-node\/\d+\.\d+\.\d+/);
      expect(ua).toContain(`node/${process.version}`);
    });

    it('appends query params to the URL', async () => {
      const fetch = mockFetch(200, { data: [] });
      vi.stubGlobal('fetch', fetch);

      await client.get('/api/v1/invoices', { page: 2, limit: 20 });

      const [url] = fetch.mock.calls[0] as [string];
      expect(url).toContain('page=2');
      expect(url).toContain('limit=20');
    });

    it('omits undefined query params', async () => {
      const fetch = mockFetch(200, {});
      vi.stubGlobal('fetch', fetch);

      await client.get('/api/v1/invoices', { page: 1, search: undefined });

      const [url] = fetch.mock.calls[0] as [string];
      expect(url).not.toContain('search');
      expect(url).toContain('page=1');
    });
  });

  // ─── POST ─────────────────────────────────────────────────────────────────

  describe('post()', () => {
    it('sends JSON body and Content-Type header', async () => {
      const fetch = mockFetch(201, { id: 'inv_2' });
      vi.stubGlobal('fetch', fetch);

      await client.post('/api/v1/invoices', { name: 'Test', rawAmount: 50 });

      const [, init] = fetch.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
      expect(init.body).toBe(JSON.stringify({ name: 'Test', rawAmount: 50 }));
    });

    it('sends no body when called without arguments', async () => {
      const fetch = mockFetch(200, {});
      vi.stubGlobal('fetch', fetch);

      await client.post('/api/v1/invoices/inv_1/cancel');

      const [, init] = fetch.mock.calls[0] as [string, RequestInit];
      expect(init.body).toBeUndefined();
    });
  });

  // ─── PUT ──────────────────────────────────────────────────────────────────

  describe('put()', () => {
    it('uses PUT method', async () => {
      const fetch = mockFetch(200, { id: 'inv_3' });
      vi.stubGlobal('fetch', fetch);

      await client.put('/api/v1/invoices/inv_3', { status: 'CANCELLED' });

      const [, init] = fetch.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe('PUT');
    });
  });

  // ─── Error handling ───────────────────────────────────────────────────────

  describe('error handling', () => {
    it('throws BilliumApiError with status and message on 4xx', async () => {
      const fetch = mockFetch(404, { message: 'Invoice not found', statusCode: 404 });
      vi.stubGlobal('fetch', fetch);

      await expect(client.get('/api/v1/invoices/inv_nope')).rejects.toThrow(BilliumApiError);

      try {
        await client.get('/api/v1/invoices/inv_nope');
      } catch (err) {
        expect(err).toBeInstanceOf(BilliumApiError);
        expect((err as BilliumApiError).status).toBe(404);
        expect((err as BilliumApiError).message).toBe('Invoice not found');
      }
    });

    it('throws BilliumApiError on 401', async () => {
      const fetch = mockFetch(401, { message: 'Invalid API Key' });
      vi.stubGlobal('fetch', fetch);

      await expect(client.get('/api/v1/invoices')).rejects.toThrow(BilliumApiError);
    });

    it('throws BilliumApiError on 500 with fallback message', async () => {
      const fetch = mockFetch(500, { something: 'unexpected' });
      vi.stubGlobal('fetch', fetch);

      try {
        await client.get('/api/v1/invoices');
      } catch (err) {
        expect(err).toBeInstanceOf(BilliumApiError);
        expect((err as BilliumApiError).status).toBe(500);
        expect((err as BilliumApiError).message).toContain('500');
      }
    });

    it('includes error code when API returns one', async () => {
      const fetch = mockFetch(403, { message: 'Insufficient permissions', error: 'FORBIDDEN' });
      vi.stubGlobal('fetch', fetch);

      try {
        await client.get('/api/v1/invoices');
      } catch (err) {
        expect(err).toBeInstanceOf(BilliumApiError);
        expect((err as BilliumApiError).code).toBe('FORBIDDEN');
      }
    });
  });

  // ─── Base URL ─────────────────────────────────────────────────────────────

  describe('base URL handling', () => {
    it('trims trailing slash from base URL', async () => {
      const fetch = mockFetch(200, {});
      vi.stubGlobal('fetch', fetch);

      const clientWithSlash = new HttpClient(
        'https://api.billium.to/',
        API_KEY,
        { maxRetries: 0 },
      );
      await clientWithSlash.get('/api/v1/invoices');

      const [url] = fetch.mock.calls[0] as [string];
      expect(url).toBe('https://api.billium.to/api/v1/invoices');
    });
  });

  // ─── Retry behavior ───────────────────────────────────────────────────────
  //
  // Retry tests use fake timers to advance through backoff sleeps instantly,
  // so the suite stays fast and deterministic. Each test builds its own
  // client with the retry configuration it needs.

  describe('retry behavior', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    /**
     * Returns a fetch mock that responds with `responses[i]` on the i-th call.
     * Each entry is `{ status, body }` for an HTTP response, or
     * `{ throw: error }` to simulate a network failure.
     */
    function mockFetchSequence(
      responses: Array<
        | { status: number; body: unknown; headers?: Record<string, string> }
        | { throw: Error }
      >,
    ) {
      const fn = vi.fn();
      for (const r of responses) {
        if ('throw' in r) {
          fn.mockRejectedValueOnce(r.throw);
        } else {
          fn.mockResolvedValueOnce({
            ok: r.status >= 200 && r.status < 300,
            status: r.status,
            headers: {
              get: (name: string) => {
                const lower = name.toLowerCase();
                if (lower === 'content-type') return 'application/json';
                return r.headers?.[lower] ?? null;
              },
            },
            json: async () => r.body,
            text: async () => String(r.body),
          });
        }
      }
      return fn;
    }

    it('retries 503 and returns the eventual success', async () => {
      const fetch = mockFetchSequence([
        { status: 503, body: { message: 'unavailable' } },
        { status: 503, body: { message: 'still down' } },
        { status: 200, body: { id: 'inv_recovered' } },
      ]);
      vi.stubGlobal('fetch', fetch);

      const retryClient = new HttpClient(BASE_URL, API_KEY, {
        maxRetries: 3,
        baseDelayMs: 100,
      });

      const promise = retryClient.get<{ id: string }>('/api/v1/invoices/inv_x');
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(fetch).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ id: 'inv_recovered' });
    });

    it('throws after exhausting all retries on persistent 503', async () => {
      const fetch = mockFetchSequence([
        { status: 503, body: { message: 'down' } },
        { status: 503, body: { message: 'down' } },
        { status: 503, body: { message: 'down' } },
      ]);
      vi.stubGlobal('fetch', fetch);

      const retryClient = new HttpClient(BASE_URL, API_KEY, {
        maxRetries: 2,
        baseDelayMs: 100,
      });

      const promise = retryClient.get('/api/v1/invoices/inv_x');
      const expectation = expect(promise).rejects.toThrow(BilliumApiError);
      await vi.runAllTimersAsync();
      await expectation;

      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('does NOT retry on 4xx', async () => {
      const fetch = mockFetchSequence([
        { status: 404, body: { message: 'not found' } },
      ]);
      vi.stubGlobal('fetch', fetch);

      const retryClient = new HttpClient(BASE_URL, API_KEY, {
        maxRetries: 5,
        baseDelayMs: 100,
      });

      await expect(retryClient.get('/api/v1/invoices/inv_x')).rejects.toThrow(
        BilliumApiError,
      );

      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('retries network errors', async () => {
      const fetch = mockFetchSequence([
        { throw: new TypeError('fetch failed') },
        { throw: new TypeError('fetch failed') },
        { status: 200, body: { id: 'inv_back' } },
      ]);
      vi.stubGlobal('fetch', fetch);

      const retryClient = new HttpClient(BASE_URL, API_KEY, {
        maxRetries: 3,
        baseDelayMs: 100,
      });

      const promise = retryClient.get<{ id: string }>('/api/v1/invoices/inv_x');
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(fetch).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ id: 'inv_back' });
    });

    it('honors Retry-After header (integer seconds)', async () => {
      const fetch = mockFetchSequence([
        {
          status: 429,
          body: { message: 'rate limited' },
          headers: { 'retry-after': '2' },
        },
        { status: 200, body: { ok: true } },
      ]);
      vi.stubGlobal('fetch', fetch);

      const retryClient = new HttpClient(BASE_URL, API_KEY, {
        maxRetries: 3,
        baseDelayMs: 100,
      });

      const promise = retryClient.get<{ ok: boolean }>('/api/v1/invoices');

      // Advance just under the Retry-After hint — fetch should not have
      // been called a second time yet.
      await vi.advanceTimersByTimeAsync(1900);
      expect(fetch).toHaveBeenCalledTimes(1);

      // Advance past the hint — second call fires.
      await vi.advanceTimersByTimeAsync(200);
      const result = await promise;

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ ok: true });
    });

    it('does NOT retry POST without an Idempotency-Key header', async () => {
      const fetch = mockFetchSequence([
        { status: 503, body: { message: 'down' } },
      ]);
      vi.stubGlobal('fetch', fetch);

      const retryClient = new HttpClient(BASE_URL, API_KEY, {
        maxRetries: 5,
        baseDelayMs: 100,
      });

      await expect(
        retryClient.post('/api/v1/invoices', { name: 'x', rawAmount: 1 }),
      ).rejects.toThrow(BilliumApiError);

      // Critical safety guarantee: no retries on POST without idempotency,
      // even with maxRetries=5, because the server may have already accepted
      // the create and we'd produce duplicates.
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('DOES retry POST when an Idempotency-Key header is set', async () => {
      const fetch = mockFetchSequence([
        { status: 503, body: { message: 'down' } },
        { status: 201, body: { id: 'inv_idem' } },
      ]);
      vi.stubGlobal('fetch', fetch);

      const retryClient = new HttpClient(BASE_URL, API_KEY, {
        maxRetries: 3,
        baseDelayMs: 100,
      });

      const promise = retryClient.post<{ id: string }>(
        '/api/v1/invoices',
        { name: 'x', rawAmount: 1 },
        { headers: { 'Idempotency-Key': 'order-1' } },
      );
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ id: 'inv_idem' });

      // Verify the idempotency header actually went out on every attempt.
      for (const call of fetch.mock.calls) {
        const init = call[1] as RequestInit;
        const headers = init.headers as Record<string, string>;
        expect(headers['Idempotency-Key']).toBe('order-1');
      }
    });

    it('treats Idempotency-Key as case-insensitive when deciding to retry', async () => {
      const fetch = mockFetchSequence([
        { status: 503, body: { message: 'down' } },
        { status: 201, body: { id: 'inv_lower' } },
      ]);
      vi.stubGlobal('fetch', fetch);

      const retryClient = new HttpClient(BASE_URL, API_KEY, {
        maxRetries: 3,
        baseDelayMs: 100,
      });

      const promise = retryClient.post<{ id: string }>(
        '/api/v1/invoices',
        {},
        { headers: { 'idempotency-key': 'lowercase-ok' } },
      );
      await vi.runAllTimersAsync();
      await promise;

      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('disables retries entirely when maxRetries is 0', async () => {
      const fetch = mockFetchSequence([
        { status: 503, body: { message: 'down' } },
      ]);
      vi.stubGlobal('fetch', fetch);

      const noRetryClient = new HttpClient(BASE_URL, API_KEY, {
        maxRetries: 0,
      });

      await expect(noRetryClient.get('/api/v1/invoices')).rejects.toThrow(
        BilliumApiError,
      );
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Public-key safety guard ──────────────────────────────────────────────
  //
  // The Billium backend issues two key types: `sk_*` (full access) and
  // `pk_*` (invoice.create / invoice.view / product.view only). Methods on
  // the SDK that the backend won't accept a public key for should throw
  // *immediately* with a clear, actionable error — not round-trip a generic
  // 403. These tests pin that contract.

  describe('assertSecretKey()', () => {
    it('does not throw when constructed with a secret key (sk_*)', () => {
      const client = new HttpClient(BASE_URL, 'sk_test_fixture_not_a_real_key');
      expect(() => client.assertSecretKey('webhooks.create')).not.toThrow();
    });

    it('throws BilliumError when constructed with a public key (pk_*)', () => {
      const client = new HttpClient(BASE_URL, 'pk_test_fixture_not_a_real_key');
      expect(() => client.assertSecretKey('webhooks.create')).toThrow(
        BilliumError,
      );
    });

    it('mentions the offending method name in the error message', () => {
      const client = new HttpClient(BASE_URL, 'pk_test_fixture_not_a_real_key');
      try {
        client.assertSecretKey('invoices.cancel');
      } catch (err) {
        expect((err as Error).message).toContain('invoices.cancel');
        expect((err as Error).message).toContain('sk_');
        expect((err as Error).message).toContain('pk_');
      }
    });

    it('treats unrecognized prefixes as secret (does not block forward-compat)', () => {
      // If Billium ever adds a third key type, the SDK should not pre-emptively
      // reject it — only known-bad `pk_*` keys are blocked.
      const client = new HttpClient(BASE_URL, 'newformat_xyz_123');
      expect(() => client.assertSecretKey('webhooks.create')).not.toThrow();
    });
  });
});
