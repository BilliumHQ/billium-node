import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Billium } from '@billium/node';

import { ok, fail } from './tools';

// Enums mirrored from @billium/node so tool inputs are validated up front.
const CRYPTOCURRENCIES = [
  'BTC',
  'ETH',
  'USDT',
  'USDC',
  'BNB',
  'SHIB',
  'POL',
  'LTC',
  'DAI',
  'CRO',
  'TRX',
  'UNI',
] as const;
const NETWORKS = ['BTC', 'ETH', 'BNB', 'POL', 'LTC', 'CRO', 'TRX'] as const;
const WALLET_TYPES = ['DIRECT_WALLET', 'XPUB_WALLET'] as const;
const PRODUCT_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'] as const;

const paginationShape = {
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(100).optional(),
  search: z.string().optional().describe('Free-text search filter.'),
};

/**
 * Registers the merchant data-resource tools (customers, products, wallets)
 * on top of the core invoice/webhook tools. Kept separate from `tools.ts` so
 * each domain stays readable; both are registered by `createServer`.
 */
export function registerMerchantTools(
  server: McpServer,
  billium: Billium,
): void {
  // ─── Customers ─────────────────────────────────────────────────────────
  // Customers are auto-provisioned from invoices — there is no create/delete,
  // only list/get/stats/update.

  server.registerTool(
    'list_customers',
    {
      title: 'List customers',
      description:
        'List the merchant’s customers (auto-created from invoices) with ' +
        'pagination and optional search by email/name/phone/address.',
      inputSchema: paginationShape,
    },
    async (params) => {
      try {
        return ok(await billium.customers.list(params));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'get_customer',
    {
      title: 'Get customer',
      description:
        'Fetch a single customer by ID, including derived location when known.',
      inputSchema: { customerId: z.string().describe('Customer ID (cus_...).') },
    },
    async ({ customerId }) => {
      try {
        return ok(await billium.customers.get(customerId));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'get_customer_stats',
    {
      title: 'Get customer stats',
      description:
        'Get a customer’s aggregate spend and invoice stats: total revenue ' +
        'from paid invoices, invoice counts, and paid rate.',
      inputSchema: { customerId: z.string().describe('Customer ID (cus_...).') },
    },
    async ({ customerId }) => {
      try {
        return ok(await billium.customers.stats(customerId));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'update_customer',
    {
      title: 'Update customer',
      description:
        'Update a customer’s name, address, or phone number. Email cannot be ' +
        'changed (it is the key that ties a customer to their invoices).',
      inputSchema: {
        customerId: z.string().describe('Customer ID (cus_...).'),
        name: z.string().optional(),
        address: z.string().optional(),
        phoneNumber: z.string().optional(),
      },
    },
    async ({ customerId, ...params }) => {
      try {
        return ok(await billium.customers.update(customerId, params));
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ─── Products ──────────────────────────────────────────────────────────

  server.registerTool(
    'create_product',
    {
      title: 'Create product',
      description:
        'Create a product the merchant can sell through a hosted checkout ' +
        'page. Price is a fiat amount; the customer pays the crypto equivalent.',
      inputSchema: {
        name: z.string().describe('Product display name.'),
        price: z
          .number()
          .positive()
          .describe('Fiat price (e.g. 19.99). Returned as a string.'),
        currency: z.enum(PRODUCT_CURRENCIES).optional(),
        description: z.string().optional(),
        image: z
          .string()
          .optional()
          .describe('Storage key of a previously uploaded image.'),
        isActive: z.boolean().optional(),
        askForName: z.boolean().optional(),
        askForAddress: z.boolean().optional(),
        askForPhoneNumber: z.boolean().optional(),
      },
    },
    async (params) => {
      try {
        return ok(await billium.products.create(params));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'get_product',
    {
      title: 'Get product',
      description: 'Fetch a single product by ID (with a presigned image URL).',
      inputSchema: { productId: z.string().describe('Product ID (prd_...).') },
    },
    async ({ productId }) => {
      try {
        return ok(await billium.products.get(productId));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'list_products',
    {
      title: 'List products',
      description:
        'List the merchant’s products with pagination and optional search.',
      inputSchema: paginationShape,
    },
    async (params) => {
      try {
        return ok(await billium.products.list(params));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'update_product',
    {
      title: 'Update product',
      description:
        'Update a product. Only the fields you pass are changed.',
      inputSchema: {
        productId: z.string().describe('Product ID (prd_...).'),
        name: z.string().optional(),
        price: z.number().positive().optional(),
        currency: z.enum(PRODUCT_CURRENCIES).optional(),
        description: z.string().optional(),
        image: z.string().optional(),
        isActive: z.boolean().optional(),
        askForName: z.boolean().optional(),
        askForAddress: z.boolean().optional(),
        askForPhoneNumber: z.boolean().optional(),
      },
    },
    async ({ productId, ...params }) => {
      try {
        return ok(await billium.products.update(productId, params));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'delete_product',
    {
      title: 'Delete product',
      description: 'Delete a product.',
      inputSchema: { productId: z.string().describe('Product ID (prd_...).') },
    },
    async ({ productId }) => {
      try {
        return ok(await billium.products.delete(productId));
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ─── Wallets ───────────────────────────────────────────────────────────

  server.registerTool(
    'list_wallets',
    {
      title: 'List wallets',
      description:
        'List the merchant’s crypto wallet configurations (DIRECT_WALLET / ' +
        'XPUB_WALLET). Only public config is returned — never private keys.',
      inputSchema: {},
    },
    async () => {
      try {
        return ok(await billium.wallets.list());
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'get_wallet',
    {
      title: 'Get wallet',
      description: 'Fetch a single wallet configuration by ID.',
      inputSchema: { walletId: z.string().describe('Wallet ID (wal_...).') },
    },
    async ({ walletId }) => {
      try {
        return ok(await billium.wallets.get(walletId));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'create_wallet',
    {
      title: 'Create wallet',
      description:
        'Add a receiving wallet for a (cryptocurrency, network) pair. Pass ' +
        '`address` for a DIRECT_WALLET, or `xpub` (extended PUBLIC key) for an ' +
        'XPUB_WALLET. One wallet per pair.',
      inputSchema: {
        cryptocurrency: z.enum(CRYPTOCURRENCIES),
        network: z.enum(NETWORKS),
        walletType: z.enum(WALLET_TYPES),
        address: z
          .string()
          .optional()
          .describe('Required for DIRECT_WALLET.'),
        xpub: z
          .string()
          .optional()
          .describe('Extended PUBLIC key — required for XPUB_WALLET (BTC/LTC).'),
        derivationPath: z.string().optional(),
        isEnabled: z.boolean().optional(),
        requiredConfirmations: z.number().int().min(1).max(100).optional(),
      },
    },
    async (params) => {
      try {
        return ok(await billium.wallets.create(params));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'update_wallet',
    {
      title: 'Update wallet',
      description:
        'Update a wallet’s mutable config (address, xpub, enabled state, ' +
        'confirmations, derivation path). Identity fields cannot change.',
      inputSchema: {
        walletId: z.string().describe('Wallet ID (wal_...).'),
        address: z.string().optional(),
        xpub: z.string().optional(),
        isEnabled: z.boolean().optional(),
        requiredConfirmations: z.number().int().min(1).max(100).optional(),
        derivationPath: z.string().optional(),
      },
    },
    async ({ walletId, ...params }) => {
      try {
        return ok(await billium.wallets.update(walletId, params));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'delete_wallet',
    {
      title: 'Delete wallet',
      description:
        'Delete a wallet. Rejected if it still has active payments against it.',
      inputSchema: { walletId: z.string().describe('Wallet ID (wal_...).') },
    },
    async ({ walletId }) => {
      try {
        return ok(await billium.wallets.delete(walletId));
      } catch (err) {
        return fail(err);
      }
    },
  );
}
