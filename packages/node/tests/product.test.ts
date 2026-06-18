import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { HttpClient } from '../src/http';
import { ProductsClient } from '../src/product';
import { BilliumApiError, BilliumError } from '../src/errors';
import type { Product } from '../src/product';
import type { PaginatedResult } from '../src/index';

const SECRET_KEY = 'sk_test_fixture_not_a_real_key';
const PUBLIC_KEY = 'pk_test_fixture_not_a_real_key';
// Realistic prefix format: `{prefix}_{32 hex chars}`. The SDK passes IDs
// through verbatim — the backend strips the prefix server-side. From the
// SDK's perspective an ID is just an opaque string.
const MERCHANT_ID = 'mer_550e8400e29b41d4a716446655440000';
const PRODUCT_ID = 'prd_1f2e3d4c5b6a7988a7b6c5d4e3f20110';
const BASE_URL = 'https://api.billium.test';

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
    text: async () => String(body),
  });
}

// Build a ProductsClient backed by a real HttpClient (so the path/verb/body
// assertions exercise the same request plumbing as production), keyed by the
// API key under test so we can cover both the secret and public-key paths.
function makeClient(apiKey: string): ProductsClient {
  const http = new HttpClient(BASE_URL, apiKey, { maxRetries: 0 });
  return new ProductsClient(http, MERCHANT_ID);
}

const SAMPLE_PRODUCT: Product = {
  id: PRODUCT_ID,
  merchantId: MERCHANT_ID,
  image: null,
  name: 'Pro Plan',
  description: null,
  price: '49.990000',
  currency: 'USD',
  isActive: true,
  askForName: false,
  askForAddress: false,
  askForPhoneNumber: false,
  createdAt: '2025-03-15T04:00:00.000Z',
  updatedAt: '2025-03-15T04:00:00.000Z',
  deletedAt: null,
  signedImage: null,
};

describe('ProductsClient', () => {
  let products: ProductsClient;

  beforeEach(() => {
    products = makeClient(SECRET_KEY);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ─── create() ─────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('POSTs to the correct path and returns the product', async () => {
      const fetch = mockFetch(201, SAMPLE_PRODUCT);
      vi.stubGlobal('fetch', fetch);

      const product = await products.create({ name: 'Pro Plan', price: 49.99 });

      const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(`/merchants/merchant/${MERCHANT_ID}/products`);
      expect(init.method).toBe('POST');
      expect(product.id).toBe(PRODUCT_ID);
      expect(product.price).toBe('49.990000');
    });

    it('sends all optional fields when provided', async () => {
      const fetch = mockFetch(201, SAMPLE_PRODUCT);
      vi.stubGlobal('fetch', fetch);

      await products.create({
        name: 'Pro Plan',
        price: 49.99,
        currency: 'EUR',
        description: 'Annual subscription',
        image: 'products/abc.png',
        isActive: false,
        askForName: true,
        askForAddress: true,
        askForPhoneNumber: true,
      });

      const [, init] = fetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.currency).toBe('EUR');
      expect(body.description).toBe('Annual subscription');
      expect(body.image).toBe('products/abc.png');
      expect(body.isActive).toBe(false);
      expect(body.askForName).toBe(true);
      expect(body.askForAddress).toBe(true);
      expect(body.askForPhoneNumber).toBe(true);
    });

    it('throws BilliumApiError on validation failure', async () => {
      const fetch = mockFetch(400, { message: 'price must not be less than 0' });
      vi.stubGlobal('fetch', fetch);

      await expect(
        products.create({ name: 'Bad', price: -1 }),
      ).rejects.toThrow(BilliumApiError);
    });

    it('throws before hitting fetch when called with a public key', async () => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);

      const publicProducts = makeClient(PUBLIC_KEY);

      await expect(
        publicProducts.create({ name: 'Pro Plan', price: 49.99 }),
      ).rejects.toThrow(BilliumError);
      // The error must surface BEFORE the request is sent.
      await expect(
        publicProducts.create({ name: 'Pro Plan', price: 49.99 }),
      ).rejects.toThrow(/sk_/);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  // ─── get() ────────────────────────────────────────────────────────────────

  describe('get()', () => {
    it('GETs the correct product URL', async () => {
      const fetch = mockFetch(200, { ...SAMPLE_PRODUCT, isActive: false });
      vi.stubGlobal('fetch', fetch);

      const product = await products.get(PRODUCT_ID);

      const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(
        `/merchants/merchant/${MERCHANT_ID}/products/${PRODUCT_ID}`,
      );
      expect(init.method).toBe('GET');
      expect(product.isActive).toBe(false);
    });

    it('GETs with a public key (product.view is in public scope)', async () => {
      const fetch = mockFetch(200, SAMPLE_PRODUCT);
      vi.stubGlobal('fetch', fetch);

      const publicProducts = makeClient(PUBLIC_KEY);
      const product = await publicProducts.get(PRODUCT_ID);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(product.id).toBe(PRODUCT_ID);
    });

    it('throws BilliumApiError with status 404 when product not found', async () => {
      const fetch = mockFetch(404, { message: 'Product not found' });
      vi.stubGlobal('fetch', fetch);

      try {
        await products.get('prd_nope');
      } catch (err) {
        expect(err).toBeInstanceOf(BilliumApiError);
        expect((err as BilliumApiError).status).toBe(404);
      }
    });
  });

  // ─── list() ───────────────────────────────────────────────────────────────

  describe('list()', () => {
    const PAGE_RESPONSE: PaginatedResult<Product> = {
      data: [SAMPLE_PRODUCT],
      pagination: { page: 1, limit: 10, total: 1, lastPage: 1 },
    };

    it('GETs the products list and returns the paginated envelope', async () => {
      const fetch = mockFetch(200, PAGE_RESPONSE);
      vi.stubGlobal('fetch', fetch);

      const result = await products.list();

      const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(`/merchants/merchant/${MERCHANT_ID}/products`);
      expect(init.method).toBe('GET');
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.lastPage).toBe(1);
      expect(result.data[0].id).toBe(PRODUCT_ID);
    });

    it('passes page and limit as query params', async () => {
      const fetch = mockFetch(200, PAGE_RESPONSE);
      vi.stubGlobal('fetch', fetch);

      await products.list({ page: 2, limit: 50 });

      const [url] = fetch.mock.calls[0] as [string];
      expect(url).toContain('page=2');
      expect(url).toContain('limit=50');
    });

    it('passes search as query param when provided', async () => {
      const fetch = mockFetch(200, PAGE_RESPONSE);
      vi.stubGlobal('fetch', fetch);

      await products.list({ search: 'plan' });

      const [url] = fetch.mock.calls[0] as [string];
      expect(url).toContain('search=plan');
    });

    it('lists with a public key (product.view is in public scope)', async () => {
      const fetch = mockFetch(200, PAGE_RESPONSE);
      vi.stubGlobal('fetch', fetch);

      const publicProducts = makeClient(PUBLIC_KEY);
      await publicProducts.list();

      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  // ─── update() ─────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('PATCHes the correct product URL with the changed fields', async () => {
      const updated = { ...SAMPLE_PRODUCT, name: 'Pro Plan v2', isActive: false };
      const fetch = mockFetch(200, updated);
      vi.stubGlobal('fetch', fetch);

      const product = await products.update(PRODUCT_ID, {
        name: 'Pro Plan v2',
        isActive: false,
      });

      const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(`/products/${PRODUCT_ID}`);
      expect(init.method).toBe('PATCH');
      const body = JSON.parse(init.body as string);
      expect(body.name).toBe('Pro Plan v2');
      expect(body.isActive).toBe(false);
      expect(product.name).toBe('Pro Plan v2');
    });

    it('throws before hitting fetch when called with a public key', async () => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);

      const publicProducts = makeClient(PUBLIC_KEY);

      await expect(
        publicProducts.update(PRODUCT_ID, { name: 'Nope' }),
      ).rejects.toThrow(/sk_/);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  // ─── delete() ─────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('sends DELETE to the correct URL and returns the soft-deleted product', async () => {
      const deleted = {
        ...SAMPLE_PRODUCT,
        deletedAt: '2025-03-16T04:00:00.000Z',
      };
      delete (deleted as Partial<Product>).signedImage;
      const fetch = mockFetch(200, deleted);
      vi.stubGlobal('fetch', fetch);

      const product = await products.delete(PRODUCT_ID);

      const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(`/products/${PRODUCT_ID}`);
      expect(init.method).toBe('DELETE');
      expect(product.deletedAt).toBe('2025-03-16T04:00:00.000Z');
    });

    it('throws before hitting fetch when called with a public key', async () => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);

      const publicProducts = makeClient(PUBLIC_KEY);

      await expect(publicProducts.delete(PRODUCT_ID)).rejects.toThrow(/sk_/);
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
