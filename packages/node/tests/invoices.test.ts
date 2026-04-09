import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { Billium, BilliumApiError } from '../src/index';
import type { Invoice, PaginatedResult } from '../src/index';

const API_KEY = 'sk_test_fixture_not_a_real_key';
// Test fixture in the real prefix format: `{prefix}_{32 hex chars}`. The
// SDK passes these through verbatim — the backend strips the prefix and
// queries Prisma with the bare UUID. From the SDK's perspective an ID is
// just an opaque string.
const MERCHANT_ID = 'mer_550e8400e29b41d4a716446655440000';
const INVOICE_ID = 'inv_7d9b8e2c1a4f4e3d9c2b8f7a6d5e3b1c';

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
    text: async () => String(body),
  });
}

const SAMPLE_INVOICE: Invoice = {
  id: INVOICE_ID,
  merchantId: MERCHANT_ID,
  customerId: null,
  productId: null,
  name: 'Order #1',
  description: null,
  redirectUrl: null,
  rawAmount: '49.99',
  endAmount: '49.99',
  currency: 'USD',
  status: 'AWAITING_PAYMENT',
  expiresAt: '2025-03-16T04:00:00.000Z',
  createdAt: '2025-03-15T04:00:00.000Z',
  updatedAt: '2025-03-15T04:00:00.000Z',
  customer: null,
  product: null,
  payments: [],
  invoiceTimeline: [],
};

describe('InvoicesClient', () => {
  let billium: Billium;

  beforeEach(() => {
    billium = new Billium({ apiKey: API_KEY, merchantId: MERCHANT_ID });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ─── create() ─────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('POSTs to the correct path and returns the invoice', async () => {
      const fetch = mockFetch(201, SAMPLE_INVOICE);
      vi.stubGlobal('fetch', fetch);

      const invoice = await billium.invoices.create({
        name: 'Order #1',
        rawAmount: 49.99,
      });

      const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(`/merchants/merchant/${MERCHANT_ID}/invoices`);
      expect(init.method).toBe('POST');
      expect(invoice.id).toBe(INVOICE_ID);
      expect(invoice.status).toBe('AWAITING_PAYMENT');
    });

    it('sends all optional fields when provided', async () => {
      const fetch = mockFetch(201, SAMPLE_INVOICE);
      vi.stubGlobal('fetch', fetch);

      await billium.invoices.create({
        name: 'Order #1',
        rawAmount: 49.99,
        currency: 'USD',
        customerEmail: 'customer@example.com',
        customerName: 'Alice',
        description: 'Premium plan',
        redirectUrl: 'https://example.com/thanks',
      });

      const [, init] = fetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.currency).toBe('USD');
      expect(body.customerEmail).toBe('customer@example.com');
      expect(body.redirectUrl).toBe('https://example.com/thanks');
    });

    it('throws BilliumApiError on validation failure', async () => {
      const fetch = mockFetch(400, { message: 'rawAmount must not be less than 0' });
      vi.stubGlobal('fetch', fetch);

      await expect(
        billium.invoices.create({ name: 'Bad', rawAmount: -1 }),
      ).rejects.toThrow(BilliumApiError);
    });

    it('forwards Idempotency-Key header when option is provided', async () => {
      const fetch = mockFetch(201, SAMPLE_INVOICE);
      vi.stubGlobal('fetch', fetch);

      await billium.invoices.create(
        { name: 'Order #1', rawAmount: 49.99 },
        { idempotencyKey: 'order-1234' },
      );

      const [, init] = fetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Idempotency-Key']).toBe('order-1234');
    });

    it('omits Idempotency-Key header when option is not provided', async () => {
      const fetch = mockFetch(201, SAMPLE_INVOICE);
      vi.stubGlobal('fetch', fetch);

      await billium.invoices.create({ name: 'Order #1', rawAmount: 49.99 });

      const [, init] = fetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Idempotency-Key']).toBeUndefined();
      expect(headers['idempotency-key']).toBeUndefined();
    });
  });

  // ─── get() ────────────────────────────────────────────────────────────────

  describe('get()', () => {
    it('GETs the correct invoice URL', async () => {
      const fetch = mockFetch(200, { ...SAMPLE_INVOICE, status: 'PAID' });
      vi.stubGlobal('fetch', fetch);

      const invoice = await billium.invoices.get(INVOICE_ID);

      const [url] = fetch.mock.calls[0] as [string];
      expect(url).toContain(`/merchants/merchant/${MERCHANT_ID}/invoices/${INVOICE_ID}`);
      expect(invoice.status).toBe('PAID');
    });

    it('throws BilliumApiError with status 404 when invoice not found', async () => {
      const fetch = mockFetch(404, { message: 'Invoice not found' });
      vi.stubGlobal('fetch', fetch);

      try {
        await billium.invoices.get('inv_nope');
      } catch (err) {
        expect(err).toBeInstanceOf(BilliumApiError);
        expect((err as BilliumApiError).status).toBe(404);
      }
    });
  });

  // ─── list() ───────────────────────────────────────────────────────────────

  describe('list()', () => {
    const PAGE_RESPONSE: PaginatedResult<Invoice> = {
      data: [SAMPLE_INVOICE],
      total: 1,
      page: 1,
      limit: 10,
    };

    it('GETs the invoices list and returns paginated result', async () => {
      const fetch = mockFetch(200, PAGE_RESPONSE);
      vi.stubGlobal('fetch', fetch);

      const result = await billium.invoices.list();

      const [url] = fetch.mock.calls[0] as [string];
      expect(url).toContain(`/merchants/merchant/${MERCHANT_ID}/invoices`);
      expect(result.total).toBe(1);
      expect(result.data[0].id).toBe(INVOICE_ID);
    });

    it('passes page and limit as query params', async () => {
      const fetch = mockFetch(200, PAGE_RESPONSE);
      vi.stubGlobal('fetch', fetch);

      await billium.invoices.list({ page: 2, limit: 50 });

      const [url] = fetch.mock.calls[0] as [string];
      expect(url).toContain('page=2');
      expect(url).toContain('limit=50');
    });

    it('passes search as query param when provided', async () => {
      const fetch = mockFetch(200, PAGE_RESPONSE);
      vi.stubGlobal('fetch', fetch);

      await billium.invoices.list({ search: 'order' });

      const [url] = fetch.mock.calls[0] as [string];
      expect(url).toContain('search=order');
    });
  });

  // ─── cancel() ─────────────────────────────────────────────────────────────

  describe('cancel()', () => {
    it('POSTs to the cancel endpoint and returns updated invoice', async () => {
      const cancelled = { ...SAMPLE_INVOICE, status: 'CANCELLED' };
      const fetch = mockFetch(200, cancelled);
      vi.stubGlobal('fetch', fetch);

      const invoice = await billium.invoices.cancel(INVOICE_ID);

      const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(`/invoices/${INVOICE_ID}/cancel`);
      expect(init.method).toBe('POST');
      expect(invoice.status).toBe('CANCELLED');
    });

    it('throws BilliumApiError when invoice is already in a terminal state', async () => {
      const fetch = mockFetch(400, { message: 'Invoice not found' });
      vi.stubGlobal('fetch', fetch);

      try {
        await billium.invoices.cancel('inv_paid');
      } catch (err) {
        expect(err).toBeInstanceOf(BilliumApiError);
        expect((err as BilliumApiError).status).toBe(400);
      }
    });

    it('throws before hitting fetch when called with a public key', async () => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);

      const publicBillium = new Billium({
        apiKey: 'pk_test_fixture_not_a_real_key',
        merchantId: MERCHANT_ID,
      });

      await expect(publicBillium.invoices.cancel('inv_x')).rejects.toThrow(
        /sk_/,
      );
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  // ─── Unconfigured client ──────────────────────────────────────────────────

  describe('unconfigured (no apiKey / merchantId)', () => {
    it('rejects with a descriptive error when invoices methods are called', async () => {
      const unconfigured = new Billium({ webhookSecret: 'whsec_abc' });

      await expect(
        unconfigured.invoices.list(),
      ).rejects.toThrow(/apiKey.*merchantId|merchantId.*apiKey/i);
    });
  });
});
