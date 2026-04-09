import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { Billium, BilliumError } from '../src/index';
import type { Webhook, WebhookEventType } from '../src/index';

const API_KEY = 'sk_test_fixture_not_a_real_key';
// Realistic prefix format: `{prefix}_{32 hex chars}`. The SDK passes IDs
// through verbatim — backend strips the prefix server-side.
const MERCHANT_ID = 'mer_550e8400e29b41d4a716446655440000';
const WEBHOOK_ID = 'wh_3a1b9c8d7e6f5a4b3c2d1e0f9a8b7c6d';

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
    text: async () => String(body),
  });
}

const SAMPLE_WEBHOOK: Webhook = {
  id: WEBHOOK_ID,
  merchantId: MERCHANT_ID,
  url: 'https://example.com/webhooks/billium',
  events: ['invoice.paid', 'invoice.expired'],
  isActive: true,
  retryCount: 3,
  timeout: 30000,
  webhookSecrets: [
    {
      id: 'whs_1',
      webhookId: WEBHOOK_ID,
      secretKeyPreview: 'whsec_xxxxx...xxxx',
      isActive: true,
    },
  ],
};

describe('WebhooksClient — management', () => {
  let billium: Billium;

  beforeEach(() => {
    billium = new Billium({ apiKey: API_KEY, merchantId: MERCHANT_ID });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ─── create() ─────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('POSTs to the correct path with the webhook config', async () => {
      const fetch = mockFetch(201, SAMPLE_WEBHOOK);
      vi.stubGlobal('fetch', fetch);

      const webhook = await billium.webhooks.create({
        url: 'https://example.com/webhooks/billium',
        events: ['invoice.paid', 'invoice.expired'],
      });

      const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(`/merchants/merchant/${MERCHANT_ID}/webhooks`);
      expect(init.method).toBe('POST');
      expect(webhook.id).toBe(WEBHOOK_ID);
      expect(webhook.events).toContain('invoice.paid');
    });

    it('sends optional fields when provided', async () => {
      const fetch = mockFetch(201, SAMPLE_WEBHOOK);
      vi.stubGlobal('fetch', fetch);

      await billium.webhooks.create({
        url: 'https://example.com/webhooks/billium',
        events: ['invoice.*'],
        description: 'Production endpoint',
        retryCount: 5,
        timeout: 10000,
        isActive: false,
      });

      const [, init] = fetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.description).toBe('Production endpoint');
      expect(body.retryCount).toBe(5);
      expect(body.timeout).toBe(10000);
      expect(body.isActive).toBe(false);
    });

    it('throws BilliumError before hitting fetch when constructed with a public key', async () => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);

      const publicBillium = new Billium({
        apiKey: 'pk_test_fixture_not_a_real_key',
        merchantId: MERCHANT_ID,
      });

      await expect(
        publicBillium.webhooks.create({
          url: 'https://example.com/webhooks',
          events: ['invoice.paid'],
        }),
      ).rejects.toThrow(BilliumError);

      // Critical safety check: the error must surface BEFORE the request is
      // sent. If it doesn't, the SDK is offering false promises about the
      // public/secret distinction.
      expect(fetch).not.toHaveBeenCalled();
    });

    it('accepts every documented event type in the WebhookEventType union', async () => {
      // This test is mostly a typecheck assertion: if any of these literals
      // ever gets removed from the WebhookEventType union, this file fails
      // to compile. The runtime call exists just to keep vitest happy.
      const allEvents: WebhookEventType[] = [
        'invoice.*',
        'invoice.created',
        'invoice.updated',
        'invoice.paid',
        'invoice.underpaid',
        'invoice.overpaid',
        'invoice.expired',
        'invoice.cancelled',
        'payment.*',
        'payment.created',
        'payment.updated',
        'payment.detected',
        'payment.confirmed',
        'payment.paid',
        'payment.underpaid',
        'payment.overpaid',
        'payment.expired',
      ];

      const fetch = mockFetch(201, SAMPLE_WEBHOOK);
      vi.stubGlobal('fetch', fetch);

      await billium.webhooks.create({
        url: 'https://example.com/webhooks/billium',
        events: allEvents,
      });

      const [, init] = fetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.events).toContain('invoice.cancelled');
      expect(body.events).toContain('payment.created');
      expect(body.events).toContain('payment.updated');
    });
  });

  // ─── list() ───────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('GETs the webhooks list', async () => {
      const fetch = mockFetch(200, [SAMPLE_WEBHOOK]);
      vi.stubGlobal('fetch', fetch);

      const webhooks = await billium.webhooks.list();

      const [url] = fetch.mock.calls[0] as [string];
      expect(url).toContain(`/merchants/merchant/${MERCHANT_ID}/webhooks`);
      expect(Array.isArray(webhooks)).toBe(true);
      expect(webhooks[0].id).toBe(WEBHOOK_ID);
    });
  });

  // ─── update() ─────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('PATCHes the correct webhook URL', async () => {
      const updated = { ...SAMPLE_WEBHOOK, isActive: false };
      const fetch = mockFetch(200, updated);
      vi.stubGlobal('fetch', fetch);

      const webhook = await billium.webhooks.update(WEBHOOK_ID, { isActive: false });

      const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(`/webhooks/${WEBHOOK_ID}`);
      expect(init.method).toBe('PATCH');
      expect(webhook.isActive).toBe(false);
    });
  });

  // ─── delete() ─────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('sends DELETE to the correct URL', async () => {
      const fetch = mockFetch(200, {});
      vi.stubGlobal('fetch', fetch);

      await billium.webhooks.delete(WEBHOOK_ID);

      const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(`/webhooks/${WEBHOOK_ID}`);
      expect(init.method).toBe('DELETE');
    });
  });

  // ─── ping() ───────────────────────────────────────────────────────────────

  describe('ping()', () => {
    it('POSTs to the ping endpoint', async () => {
      const fetch = mockFetch(201, {});
      vi.stubGlobal('fetch', fetch);

      await billium.webhooks.ping(WEBHOOK_ID);

      const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(`/webhooks/${WEBHOOK_ID}/ping`);
      expect(init.method).toBe('POST');
    });
  });

  // ─── Unconfigured ─────────────────────────────────────────────────────────

  describe('unconfigured (no apiKey / merchantId)', () => {
    it('throws BilliumError when management methods are called', async () => {
      const unconfigured = new Billium({ webhookSecret: 'whsec_abc' });

      await expect(unconfigured.webhooks.list()).rejects.toThrow(BilliumError);
      await expect(
        unconfigured.webhooks.create({
          url: 'https://example.com',
          events: ['invoice.paid'],
        }),
      ).rejects.toThrow(BilliumError);
    });
  });
});
