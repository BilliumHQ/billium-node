import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { HttpClient } from '../src/http';
import { BilliumApiError, BilliumError } from '../src/errors';
import { WalletsClient } from '../src/wallet';
import type { Wallet } from '../src/wallet';

const SECRET_KEY = 'sk_test_fixture_not_a_real_key';
const PUBLIC_KEY = 'pk_test_fixture_not_a_real_key';
const BASE_URL = 'https://api.billium.test';
// Realistic prefix format: `{prefix}_{32 hex chars}`. The SDK passes IDs
// through verbatim — the backend strips the prefix server-side.
const MERCHANT_ID = 'mer_550e8400e29b41d4a716446655440000';
const WALLET_ID = 'wal_3a1b9c8d7e6f5a4b3c2d1e0f9a8b7c6d';

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
    text: async () => String(body),
  });
}

// A real HttpClient so the test exercises the same verb/path/header plumbing
// the SDK uses in production. `maxRetries: 0` keeps each method to a single
// fetch call so `fetch.mock.calls[0]` is unambiguous.
function client(apiKey: string): WalletsClient {
  const http = new HttpClient(BASE_URL, apiKey, { maxRetries: 0 });
  return new WalletsClient(http, MERCHANT_ID);
}

const SAMPLE_WALLET: Wallet = {
  id: WALLET_ID,
  merchantId: MERCHANT_ID,
  cryptocurrency: 'BTC',
  network: 'BTC',
  walletType: 'DIRECT_WALLET',
  isEnabled: true,
  requiredConfirmations: 2,
  address: 'bc1qexampleexampleexampleexampleexampleex',
  xpub: null,
  derivationPath: null,
  lastUsedIndex: null,
  createdAt: '2025-03-15T04:00:00.000Z',
  updatedAt: '2025-03-15T04:00:00.000Z',
};

const SAMPLE_XPUB_WALLET: Wallet = {
  ...SAMPLE_WALLET,
  id: 'wal_ffffffffffffffffffffffffffffffff',
  walletType: 'XPUB_WALLET',
  address: null,
  xpub: 'xpubExampleExampleExampleExampleExample',
  derivationPath: "m/84'/0'/0'/0",
  lastUsedIndex: 0,
};

describe('WalletsClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ─── list() ─────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('GETs the wallets list and returns the array', async () => {
      const fetch = mockFetch(200, [SAMPLE_WALLET, SAMPLE_XPUB_WALLET]);
      vi.stubGlobal('fetch', fetch);

      const wallets = await client(SECRET_KEY).list();

      const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(`/merchants/merchant/${MERCHANT_ID}/wallets`);
      expect(init.method).toBe('GET');
      expect(Array.isArray(wallets)).toBe(true);
      expect(wallets[0].id).toBe(WALLET_ID);
      expect(wallets[1].walletType).toBe('XPUB_WALLET');
    });
  });

  // ─── get() ──────────────────────────────────────────────────────────────────

  describe('get()', () => {
    it('GETs the correct wallet URL', async () => {
      const fetch = mockFetch(200, SAMPLE_WALLET);
      vi.stubGlobal('fetch', fetch);

      const wallet = await client(SECRET_KEY).get(WALLET_ID);

      const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(
        `/merchants/merchant/${MERCHANT_ID}/wallets/${WALLET_ID}`,
      );
      expect(init.method).toBe('GET');
      expect(wallet.id).toBe(WALLET_ID);
    });

    it('throws BilliumApiError with status 404 when wallet not found', async () => {
      const fetch = mockFetch(404, { message: 'Wallet not found' });
      vi.stubGlobal('fetch', fetch);

      try {
        await client(SECRET_KEY).get('wal_nope');
      } catch (err) {
        expect(err).toBeInstanceOf(BilliumApiError);
        expect((err as BilliumApiError).status).toBe(404);
      }
    });
  });

  // ─── create() ───────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('POSTs to the correct path with the wallet config', async () => {
      const fetch = mockFetch(201, SAMPLE_WALLET);
      vi.stubGlobal('fetch', fetch);

      const wallet = await client(SECRET_KEY).create({
        cryptocurrency: 'BTC',
        walletType: 'DIRECT_WALLET',
        network: 'BTC',
        address: SAMPLE_WALLET.address as string,
      });

      const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(`/merchants/merchant/${MERCHANT_ID}/wallets`);
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body as string);
      expect(body.cryptocurrency).toBe('BTC');
      expect(body.walletType).toBe('DIRECT_WALLET');
      expect(body.address).toBe(SAMPLE_WALLET.address);
      expect(wallet.id).toBe(WALLET_ID);
    });

    it('sends xpub fields for an XPUB_WALLET', async () => {
      const fetch = mockFetch(201, SAMPLE_XPUB_WALLET);
      vi.stubGlobal('fetch', fetch);

      await client(SECRET_KEY).create({
        cryptocurrency: 'BTC',
        walletType: 'XPUB_WALLET',
        network: 'BTC',
        xpub: SAMPLE_XPUB_WALLET.xpub as string,
        derivationPath: "m/84'/0'/0'/0",
        isEnabled: false,
        requiredConfirmations: 3,
      });

      const [, init] = fetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.xpub).toBe(SAMPLE_XPUB_WALLET.xpub);
      expect(body.derivationPath).toBe("m/84'/0'/0'/0");
      expect(body.isEnabled).toBe(false);
      expect(body.requiredConfirmations).toBe(3);
    });

    it('throws BilliumApiError on validation failure', async () => {
      const fetch = mockFetch(400, { message: 'Wallet already exists' });
      vi.stubGlobal('fetch', fetch);

      await expect(
        client(SECRET_KEY).create({
          cryptocurrency: 'BTC',
          walletType: 'DIRECT_WALLET',
          network: 'BTC',
          address: 'bad',
        }),
      ).rejects.toThrow(BilliumApiError);
    });

    it('throws BilliumError before hitting fetch when called with a public key', async () => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);

      await expect(
        client(PUBLIC_KEY).create({
          cryptocurrency: 'BTC',
          walletType: 'DIRECT_WALLET',
          network: 'BTC',
          address: SAMPLE_WALLET.address as string,
        }),
      ).rejects.toThrow(BilliumError);

      // Critical safety check: the error must surface BEFORE the request is
      // sent. The public/secret distinction is meaningless otherwise.
      await expect(
        client(PUBLIC_KEY).create({
          cryptocurrency: 'BTC',
          walletType: 'DIRECT_WALLET',
          network: 'BTC',
          address: SAMPLE_WALLET.address as string,
        }),
      ).rejects.toThrow(/sk_/);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  // ─── update() ───────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('PATCHes the correct wallet URL with the changed fields', async () => {
      const updated = { ...SAMPLE_WALLET, isEnabled: false };
      const fetch = mockFetch(200, updated);
      vi.stubGlobal('fetch', fetch);

      const wallet = await client(SECRET_KEY).update(WALLET_ID, {
        isEnabled: false,
        requiredConfirmations: 6,
      });

      const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(`/wallets/${WALLET_ID}`);
      expect(init.method).toBe('PATCH');
      const body = JSON.parse(init.body as string);
      expect(body.isEnabled).toBe(false);
      expect(body.requiredConfirmations).toBe(6);
      expect(wallet.isEnabled).toBe(false);
    });

    it('throws BilliumError before hitting fetch when called with a public key', async () => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);

      await expect(
        client(PUBLIC_KEY).update(WALLET_ID, { isEnabled: false }),
      ).rejects.toThrow(/sk_/);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  // ─── delete() ───────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('sends DELETE to the correct URL', async () => {
      const fetch = mockFetch(200, SAMPLE_WALLET);
      vi.stubGlobal('fetch', fetch);

      await client(SECRET_KEY).delete(WALLET_ID);

      const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(`/wallets/${WALLET_ID}`);
      expect(init.method).toBe('DELETE');
    });

    it('throws BilliumApiError when the wallet has active payments', async () => {
      const fetch = mockFetch(400, {
        message: 'Cannot delete a wallet with active payments',
      });
      vi.stubGlobal('fetch', fetch);

      try {
        await client(SECRET_KEY).delete(WALLET_ID);
      } catch (err) {
        expect(err).toBeInstanceOf(BilliumApiError);
        expect((err as BilliumApiError).status).toBe(400);
      }
    });

    it('throws BilliumError before hitting fetch when called with a public key', async () => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);

      await expect(client(PUBLIC_KEY).delete(WALLET_ID)).rejects.toThrow(/sk_/);
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
