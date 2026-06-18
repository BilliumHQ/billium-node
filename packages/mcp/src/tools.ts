import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Billium, WebhookEventType } from '@billium/node';

/**
 * The 17 webhook event types Billium emits, plus the two category wildcards.
 * Kept in sync with `@billium/node`'s `WebhookEventType` union.
 */
const WEBHOOK_EVENTS: [WebhookEventType, ...WebhookEventType[]] = [
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

export type ToolResult = {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
};

export function ok(data: unknown): ToolResult {
  const text =
    typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: 'text', text }] };
}

export function fail(err: unknown): ToolResult {
  // Duck-type the SDK's error shape (BilliumApiError carries `status`) so we
  // surface actionable messages without a runtime import of the SDK.
  const status = (err as { status?: number })?.status;
  const message = err instanceof Error ? err.message : String(err);
  const text = status
    ? `Billium API error (${status}): ${message}`
    : `Billium error: ${message}`;
  return { content: [{ type: 'text', text }], isError: true };
}

/**
 * Registers every Billium tool on the given MCP server, backed by the supplied
 * SDK client. Split out from the transport wiring so tests can drive it with an
 * in-memory client and a mock `Billium`.
 */
export function registerTools(server: McpServer, billium: Billium): void {
  // ─── Invoices ──────────────────────────────────────────────────────────

  server.registerTool(
    'create_invoice',
    {
      title: 'Create invoice',
      description:
        'Create a new crypto payment invoice for the merchant and return it, ' +
        'including the hosted checkout URL. The customer pays in crypto; ' +
        'settlement is non-custodial (funds go straight to the merchant wallet). ' +
        'An idempotency key is generated automatically unless you pass one.',
      inputSchema: {
        name: z.string().describe('Invoice display name, e.g. "Order #1234".'),
        rawAmount: z
          .number()
          .positive()
          .describe('Amount in the given currency (e.g. 99.99).'),
        currency: z
          .string()
          .optional()
          .describe("Currency code, e.g. 'USD'. Defaults to USD."),
        customerEmail: z.string().email().optional(),
        customerName: z.string().optional(),
        customerAddress: z.string().optional(),
        customerPhoneNumber: z.string().optional(),
        description: z.string().optional(),
        redirectUrl: z
          .string()
          .url()
          .optional()
          .describe('URL to send the customer to after a successful payment.'),
        idempotencyKey: z
          .string()
          .optional()
          .describe(
            'Optional dedup key. If omitted, a UUID is generated so retries ' +
              'never create duplicate invoices.',
          ),
      },
    },
    async ({ idempotencyKey, ...params }) => {
      try {
        const invoice = await billium.invoices.create(params, {
          idempotencyKey: idempotencyKey ?? randomUUID(),
        });
        return ok(invoice);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'get_invoice',
    {
      title: 'Get invoice',
      description:
        'Fetch a single invoice by ID, including its current status, ' +
        'customer, payments, and status timeline.',
      inputSchema: {
        invoiceId: z.string().describe('The invoice ID (inv_...).'),
      },
    },
    async ({ invoiceId }) => {
      try {
        return ok(await billium.invoices.get(invoiceId));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'list_invoices',
    {
      title: 'List invoices',
      description:
        'List the merchant’s invoices with pagination and optional search. ' +
        'Returns a page of invoices plus total/page metadata.',
      inputSchema: {
        page: z.number().int().positive().optional(),
        limit: z
          .number()
          .int()
          .positive()
          .max(100)
          .optional()
          .describe('Results per page (max 100). Defaults to 10.'),
        search: z
          .string()
          .optional()
          .describe('Filter by invoice name, description, or ID.'),
      },
    },
    async (params) => {
      try {
        return ok(await billium.invoices.list(params));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'cancel_invoice',
    {
      title: 'Cancel invoice',
      description:
        'Cancel an invoice that has not yet been paid. Returns the updated ' +
        'invoice. Already-terminal invoices (paid/expired/cancelled) cannot ' +
        'be cancelled.',
      inputSchema: {
        invoiceId: z.string().describe('The invoice ID (inv_...).'),
      },
    },
    async ({ invoiceId }) => {
      try {
        return ok(await billium.invoices.cancel(invoiceId));
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ─── Webhooks ──────────────────────────────────────────────────────────

  server.registerTool(
    'create_webhook',
    {
      title: 'Create webhook',
      description:
        'Register a webhook endpoint that Billium will POST events to. Use ' +
        "'invoice.*' or 'payment.*' to subscribe to every event in a category.",
      inputSchema: {
        url: z.string().url().describe('HTTPS URL Billium will POST events to.'),
        events: z
          .array(z.enum(WEBHOOK_EVENTS))
          .nonempty()
          .describe('Event types to subscribe to.'),
        description: z.string().optional(),
        isActive: z.boolean().optional(),
        retryCount: z.number().int().min(0).max(10).optional(),
        timeout: z.number().int().min(1000).max(30000).optional(),
      },
    },
    async (params) => {
      try {
        return ok(await billium.webhooks.create(params));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'list_webhooks',
    {
      title: 'List webhooks',
      description: 'List all webhook endpoints configured for the merchant.',
      inputSchema: {},
    },
    async () => {
      try {
        return ok(await billium.webhooks.list());
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'update_webhook',
    {
      title: 'Update webhook',
      description:
        'Update an existing webhook endpoint (URL, subscribed events, active ' +
        'state, retries, or timeout). Only the fields you pass are changed.',
      inputSchema: {
        webhookId: z.string().describe('The webhook ID (wh_...).'),
        url: z.string().url().optional(),
        events: z.array(z.enum(WEBHOOK_EVENTS)).nonempty().optional(),
        description: z.string().optional(),
        isActive: z.boolean().optional(),
        retryCount: z.number().int().min(0).max(10).optional(),
        timeout: z.number().int().min(1000).max(30000).optional(),
      },
    },
    async ({ webhookId, ...params }) => {
      try {
        return ok(await billium.webhooks.update(webhookId, params));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'delete_webhook',
    {
      title: 'Delete webhook',
      description: 'Permanently delete a webhook endpoint.',
      inputSchema: {
        webhookId: z.string().describe('The webhook ID (wh_...).'),
      },
    },
    async ({ webhookId }) => {
      try {
        await billium.webhooks.delete(webhookId);
        return ok(`Webhook ${webhookId} deleted.`);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'ping_webhook',
    {
      title: 'Ping webhook',
      description:
        'Send a test event to a webhook endpoint to verify it is reachable ' +
        'and that your signature verification works.',
      inputSchema: {
        webhookId: z.string().describe('The webhook ID (wh_...).'),
      },
    },
    async ({ webhookId }) => {
      try {
        await billium.webhooks.ping(webhookId);
        return ok(`Ping sent to webhook ${webhookId}.`);
      } catch (err) {
        return fail(err);
      }
    },
  );
}
