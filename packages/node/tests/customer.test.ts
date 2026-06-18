import { describe, it, expect, vi, beforeEach } from 'vitest';

import { CustomersClient } from '../src/customer';
import type {
  Customer,
  CustomerStats,
  ListCustomersParams,
} from '../src/customer';
import type { PaginatedResult } from '../src/index';
import type { HttpClient } from '../src/http';

// Test fixtures in the real prefix format: `{prefix}_{32 hex chars}`. The SDK
// passes IDs through verbatim — the backend strips the prefix server-side. From
// the SDK's perspective an ID is just an opaque string.
const MERCHANT_ID = 'mer_550e8400e29b41d4a716446655440000';
const CUSTOMER_ID = 'cus_9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c';
const BASE_PATH = `/v1/merchants/merchant/${MERCHANT_ID}/customers`;

const SAMPLE_CUSTOMER: Customer = {
  id: CUSTOMER_ID,
  merchantId: MERCHANT_ID,
  email: 'alice@example.com',
  name: 'Alice',
  address: '1 Market St',
  phoneNumber: '+15551234567',
  metadata: null,
  createdAt: '2025-03-15T04:00:00.000Z',
  updatedAt: '2025-03-15T04:00:00.000Z',
  deletedAt: null,
  location: { country: 'US', city: 'San Francisco' },
};

const SAMPLE_STATS: CustomerStats = {
  revenue: '149.97',
  totalInvoices: 4,
  paidInvoices: 3,
  paidRate: 75,
};

/**
 * Builds a mocked `HttpClient` with a `vi.fn()` per verb plus `assertSecretKey`.
 * `assertSecretKey` defaults to a no-op (simulating a secret key) so happy-path
 * tests don't trip the guard; the public-key tests override it to throw.
 */
function mockHttp() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    assertSecretKey: vi.fn(),
  } as unknown as HttpClient & {
    get: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    assertSecretKey: ReturnType<typeof vi.fn>;
  };
}

describe('CustomersClient', () => {
  let http: ReturnType<typeof mockHttp>;
  let customers: CustomersClient;

  beforeEach(() => {
    http = mockHttp();
    customers = new CustomersClient(http, MERCHANT_ID);
  });

  // ─── list() ───────────────────────────────────────────────────────────────

  describe('list()', () => {
    const PAGE_RESPONSE: PaginatedResult<Customer> = {
      data: [SAMPLE_CUSTOMER],
      pagination: { page: 1, limit: 10, total: 1, lastPage: 1 },
    };

    it('GETs the customers base path and returns the paginated result', async () => {
      http.get.mockResolvedValue(PAGE_RESPONSE);

      const result = await customers.list();

      expect(http.get).toHaveBeenCalledWith(BASE_PATH, undefined);
      expect(result.pagination.total).toBe(1);
      expect(result.data[0].id).toBe(CUSTOMER_ID);
    });

    it('forwards page, limit, and search as query params', async () => {
      http.get.mockResolvedValue(PAGE_RESPONSE);

      const params: ListCustomersParams = { page: 2, limit: 50, search: 'ali' };
      await customers.list(params);

      expect(http.get).toHaveBeenCalledWith(BASE_PATH, params);
    });

    it('asserts a secret key before issuing the request', async () => {
      http.get.mockResolvedValue(PAGE_RESPONSE);

      await customers.list();

      expect(http.assertSecretKey).toHaveBeenCalledWith('customers.list');
    });

    it('rejects (and skips the request) when assertSecretKey throws', async () => {
      http.assertSecretKey.mockImplementation(() => {
        throw new Error('requires a secret key (sk_*)');
      });

      await expect(customers.list()).rejects.toThrow(/sk_/);
      expect(http.get).not.toHaveBeenCalled();
    });
  });

  // ─── get() ────────────────────────────────────────────────────────────────

  describe('get()', () => {
    it('GETs the correct customer URL', async () => {
      http.get.mockResolvedValue(SAMPLE_CUSTOMER);

      const customer = await customers.get(CUSTOMER_ID);

      expect(http.get).toHaveBeenCalledWith(`${BASE_PATH}/${CUSTOMER_ID}`);
      expect(customer.id).toBe(CUSTOMER_ID);
      expect(customer.location?.country).toBe('US');
    });

    it('asserts a secret key before issuing the request', async () => {
      http.get.mockResolvedValue(SAMPLE_CUSTOMER);

      await customers.get(CUSTOMER_ID);

      expect(http.assertSecretKey).toHaveBeenCalledWith('customers.get');
    });

    it('rejects (and skips the request) when assertSecretKey throws', async () => {
      http.assertSecretKey.mockImplementation(() => {
        throw new Error('requires a secret key (sk_*)');
      });

      await expect(customers.get(CUSTOMER_ID)).rejects.toThrow(/sk_/);
      expect(http.get).not.toHaveBeenCalled();
    });
  });

  // ─── stats() ──────────────────────────────────────────────────────────────

  describe('stats()', () => {
    it('GETs the /resume endpoint and returns customer stats', async () => {
      http.get.mockResolvedValue(SAMPLE_STATS);

      const stats = await customers.stats(CUSTOMER_ID);

      expect(http.get).toHaveBeenCalledWith(
        `${BASE_PATH}/${CUSTOMER_ID}/resume`,
      );
      expect(stats.totalInvoices).toBe(4);
      expect(stats.paidInvoices).toBe(3);
      expect(stats.paidRate).toBe(75);
    });

    it('asserts a secret key before issuing the request', async () => {
      http.get.mockResolvedValue(SAMPLE_STATS);

      await customers.stats(CUSTOMER_ID);

      expect(http.assertSecretKey).toHaveBeenCalledWith('customers.stats');
    });

    it('rejects (and skips the request) when assertSecretKey throws', async () => {
      http.assertSecretKey.mockImplementation(() => {
        throw new Error('requires a secret key (sk_*)');
      });

      await expect(customers.stats(CUSTOMER_ID)).rejects.toThrow(/sk_/);
      expect(http.get).not.toHaveBeenCalled();
    });
  });

  // ─── update() ─────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('PATCHes the correct customer URL with the provided fields', async () => {
      const updated = { ...SAMPLE_CUSTOMER, name: 'Alice Smith' };
      http.patch.mockResolvedValue(updated);

      const customer = await customers.update(CUSTOMER_ID, {
        name: 'Alice Smith',
      });

      expect(http.patch).toHaveBeenCalledWith(`${BASE_PATH}/${CUSTOMER_ID}`, {
        name: 'Alice Smith',
      });
      expect(customer.name).toBe('Alice Smith');
    });

    it('forwards every updatable field when provided', async () => {
      http.patch.mockResolvedValue(SAMPLE_CUSTOMER);

      await customers.update(CUSTOMER_ID, {
        name: 'Alice Smith',
        address: '500 Howard St',
        phoneNumber: '+15559876543',
      });

      expect(http.patch).toHaveBeenCalledWith(`${BASE_PATH}/${CUSTOMER_ID}`, {
        name: 'Alice Smith',
        address: '500 Howard St',
        phoneNumber: '+15559876543',
      });
    });

    it('asserts a secret key before issuing the request', async () => {
      http.patch.mockResolvedValue(SAMPLE_CUSTOMER);

      await customers.update(CUSTOMER_ID, { name: 'Alice Smith' });

      expect(http.assertSecretKey).toHaveBeenCalledWith('customers.update');
    });

    it('rejects (and skips the request) when assertSecretKey throws', async () => {
      http.assertSecretKey.mockImplementation(() => {
        throw new Error('requires a secret key (sk_*)');
      });

      await expect(
        customers.update(CUSTOMER_ID, { name: 'Nope' }),
      ).rejects.toThrow(/sk_/);
      expect(http.patch).not.toHaveBeenCalled();
    });
  });

  // ─── basePath ───────────────────────────────────────────────────────────────

  describe('basePath construction', () => {
    it('scopes the path to the merchant ID passed to the constructor', async () => {
      http.get.mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 10, total: 0, lastPage: 0 },
      });

      await customers.list();

      const [path] = http.get.mock.calls[0] as [string];
      expect(path).toBe(
        `/v1/merchants/merchant/${MERCHANT_ID}/customers`,
      );
    });
  });
});
