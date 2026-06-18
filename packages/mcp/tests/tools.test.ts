import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Billium } from '@billium/node';

import { createServer } from '../src/server';

/**
 * Drives the real MCP server over an in-memory transport with a mocked SDK
 * client — no network, no live backend. Proves the tools are discoverable and
 * that each one wires its arguments through to the SDK and shapes the result.
 */

function mockBillium() {
  return {
    invoices: {
      create: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
      cancel: vi.fn(),
    },
    webhooks: {
      create: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      ping: vi.fn(),
    },
    customers: {
      list: vi.fn(),
      get: vi.fn(),
      stats: vi.fn(),
      update: vi.fn(),
    },
    products: {
      create: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    wallets: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
}

async function connect(billium: ReturnType<typeof mockBillium>) {
  const server = createServer(billium as unknown as Billium);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(clientTransport);
  return client;
}

describe('Billium MCP tools', () => {
  let billium: ReturnType<typeof mockBillium>;
  let client: Client;

  beforeEach(async () => {
    billium = mockBillium();
    client = await connect(billium);
  });

  it('exposes the full tool set (invoices, webhooks, customers, products, wallets)', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        // invoices + webhooks
        'cancel_invoice',
        'create_invoice',
        'create_webhook',
        'delete_webhook',
        'get_invoice',
        'list_invoices',
        'list_webhooks',
        'ping_webhook',
        'update_webhook',
        // customers
        'list_customers',
        'get_customer',
        'get_customer_stats',
        'update_customer',
        // products
        'create_product',
        'get_product',
        'list_products',
        'update_product',
        'delete_product',
        // wallets
        'list_wallets',
        'get_wallet',
        'create_wallet',
        'update_wallet',
        'delete_wallet',
      ].sort(),
    );
  });

  it('create_invoice forwards params and auto-generates an idempotency key', async () => {
    const invoice = { id: 'inv_1', status: 'AWAITING_PAYMENT' };
    billium.invoices.create.mockResolvedValue(invoice);

    const res = await client.callTool({
      name: 'create_invoice',
      arguments: { name: 'Order #1', rawAmount: 49.99, currency: 'USD' },
    });

    expect(billium.invoices.create).toHaveBeenCalledTimes(1);
    const [params, options] = billium.invoices.create.mock.calls[0];
    expect(params).toMatchObject({
      name: 'Order #1',
      rawAmount: 49.99,
      currency: 'USD',
    });
    // idempotencyKey must NOT be passed inside the create params...
    expect(params).not.toHaveProperty('idempotencyKey');
    // ...but a generated one must reach the SDK options.
    expect(options.idempotencyKey).toEqual(expect.any(String));
    expect(options.idempotencyKey.length).toBeGreaterThan(0);

    expect(res.isError).toBeFalsy();
    expect(JSON.parse((res.content as any)[0].text)).toEqual(invoice);
  });

  it('create_invoice honors a caller-supplied idempotency key', async () => {
    billium.invoices.create.mockResolvedValue({ id: 'inv_2' });

    await client.callTool({
      name: 'create_invoice',
      arguments: { name: 'Order #2', rawAmount: 10, idempotencyKey: 'key-123' },
    });

    const [, options] = billium.invoices.create.mock.calls[0];
    expect(options.idempotencyKey).toBe('key-123');
  });

  it('list_invoices passes pagination through', async () => {
    const page = { data: [], total: 0, page: 2 };
    billium.invoices.list.mockResolvedValue(page);

    const res = await client.callTool({
      name: 'list_invoices',
      arguments: { page: 2, limit: 25 },
    });

    expect(billium.invoices.list).toHaveBeenCalledWith({ page: 2, limit: 25 });
    expect(JSON.parse((res.content as any)[0].text)).toEqual(page);
  });

  it('cancel_invoice calls the SDK with the id', async () => {
    billium.invoices.cancel.mockResolvedValue({ id: 'inv_3', status: 'CANCELLED' });

    await client.callTool({
      name: 'cancel_invoice',
      arguments: { invoiceId: 'inv_3' },
    });

    expect(billium.invoices.cancel).toHaveBeenCalledWith('inv_3');
  });

  it('create_webhook forwards url and events', async () => {
    billium.webhooks.create.mockResolvedValue({ id: 'wh_1' });

    await client.callTool({
      name: 'create_webhook',
      arguments: {
        url: 'https://example.com/hook',
        events: ['invoice.paid', 'payment.confirmed'],
      },
    });

    expect(billium.webhooks.create).toHaveBeenCalledWith({
      url: 'https://example.com/hook',
      events: ['invoice.paid', 'payment.confirmed'],
    });
  });

  it('update_webhook splits the id from the patch body', async () => {
    billium.webhooks.update.mockResolvedValue({ id: 'wh_9', isActive: false });

    await client.callTool({
      name: 'update_webhook',
      arguments: { webhookId: 'wh_9', isActive: false },
    });

    expect(billium.webhooks.update).toHaveBeenCalledWith('wh_9', {
      isActive: false,
    });
  });

  it('delete_webhook and ping_webhook return a text confirmation', async () => {
    billium.webhooks.delete.mockResolvedValue(undefined);
    billium.webhooks.ping.mockResolvedValue(undefined);

    const del = await client.callTool({
      name: 'delete_webhook',
      arguments: { webhookId: 'wh_5' },
    });
    const ping = await client.callTool({
      name: 'ping_webhook',
      arguments: { webhookId: 'wh_5' },
    });

    expect(billium.webhooks.delete).toHaveBeenCalledWith('wh_5');
    expect(billium.webhooks.ping).toHaveBeenCalledWith('wh_5');
    expect((del.content as any)[0].text).toContain('deleted');
    expect((ping.content as any)[0].text).toContain('Ping sent');
  });

  // ─── Merchant resources (customers, products, wallets) ─────────────────

  it('list_customers forwards pagination + search to the SDK', async () => {
    const page = { data: [], pagination: { page: 1, limit: 10, total: 0, lastPage: 0 } };
    billium.customers.list.mockResolvedValue(page);

    const res = await client.callTool({
      name: 'list_customers',
      arguments: { page: 1, limit: 10, search: 'alice' },
    });

    expect(billium.customers.list).toHaveBeenCalledWith({
      page: 1,
      limit: 10,
      search: 'alice',
    });
    expect(JSON.parse((res.content as any)[0].text)).toEqual(page);
  });

  it('update_customer splits the id from the patch body', async () => {
    billium.customers.update.mockResolvedValue({ id: 'cus_1', name: 'Bob' });

    await client.callTool({
      name: 'update_customer',
      arguments: { customerId: 'cus_1', name: 'Bob' },
    });

    expect(billium.customers.update).toHaveBeenCalledWith('cus_1', {
      name: 'Bob',
    });
  });

  it('create_product forwards the product fields', async () => {
    billium.products.create.mockResolvedValue({ id: 'prd_1' });

    await client.callTool({
      name: 'create_product',
      arguments: { name: 'T-shirt', price: 19.99, currency: 'USD' },
    });

    expect(billium.products.create).toHaveBeenCalledWith({
      name: 'T-shirt',
      price: 19.99,
      currency: 'USD',
    });
  });

  it('create_wallet forwards wallet config and validates enums', async () => {
    billium.wallets.create.mockResolvedValue({ id: 'wal_1' });

    await client.callTool({
      name: 'create_wallet',
      arguments: {
        cryptocurrency: 'BTC',
        network: 'BTC',
        walletType: 'DIRECT_WALLET',
        address: 'bc1qexample',
      },
    });

    expect(billium.wallets.create).toHaveBeenCalledWith({
      cryptocurrency: 'BTC',
      network: 'BTC',
      walletType: 'DIRECT_WALLET',
      address: 'bc1qexample',
    });
  });

  it('rejects an invalid wallet enum before reaching the SDK', async () => {
    const res = await client.callTool({
      name: 'create_wallet',
      arguments: {
        cryptocurrency: 'DOGE', // not a supported enum value
        network: 'BTC',
        walletType: 'DIRECT_WALLET',
      },
    });

    expect(res.isError).toBe(true);
    expect(billium.wallets.create).not.toHaveBeenCalled();
  });

  it('list_wallets takes no arguments and returns the array', async () => {
    billium.wallets.list.mockResolvedValue([{ id: 'wal_1' }]);

    const res = await client.callTool({ name: 'list_wallets', arguments: {} });

    expect(billium.wallets.list).toHaveBeenCalledTimes(1);
    expect(JSON.parse((res.content as any)[0].text)).toEqual([{ id: 'wal_1' }]);
  });

  it('surfaces SDK errors as an isError result with the HTTP status', async () => {
    billium.invoices.get.mockRejectedValue(
      Object.assign(new Error('Not found'), { status: 404 }),
    );

    const res = await client.callTool({
      name: 'get_invoice',
      arguments: { invoiceId: 'inv_missing' },
    });

    expect(res.isError).toBe(true);
    expect((res.content as any)[0].text).toContain('404');
    expect((res.content as any)[0].text).toContain('Not found');
  });

  it('rejects invalid input before reaching the SDK', async () => {
    const res = await client.callTool({
      name: 'create_invoice',
      arguments: { name: 'Bad', rawAmount: -5 },
    });

    // Zod validation fails → error result, SDK never called.
    expect(res.isError).toBe(true);
    expect(billium.invoices.create).not.toHaveBeenCalled();
  });
});
