export {
  BilliumError,
  BilliumApiError,
  BilliumWebhookSignatureError,
  BilliumWebhookTimestampError,
} from './errors';

export { SDK_VERSION } from './version';

export type {
  WebhookEvent,
  VerifyOptions,
  WebhookEventType,
  Webhook,
  WebhookSecret,
  CreateWebhookParams,
  UpdateWebhookParams,
} from './webhooks';
export type {
  Invoice,
  InvoiceStatus,
  InvoiceCustomer,
  InvoiceProduct,
  InvoicePayment,
  InvoiceTimelineEntry,
  CreateInvoiceParams,
  CreateInvoiceOptions,
  ListInvoicesParams,
  PaginatedResult,
} from './invoices';
export type {
  Customer,
  CustomerLocation,
  CustomerStats,
  ListCustomersParams,
  UpdateCustomerParams,
} from './customer';
export type {
  Product,
  ProductCurrency,
  CreateProductParams,
  UpdateProductParams,
  ListProductsParams,
} from './product';
export type {
  Wallet,
  WalletType,
  Cryptocurrency,
  Network,
  CreateWalletParams,
  UpdateWalletParams,
} from './wallet';

import { WebhooksClient } from './webhooks';
import { InvoicesClient } from './invoices';
import { CustomersClient } from './customer';
import { ProductsClient } from './product';
import { WalletsClient } from './wallet';
import { HttpClient } from './http';

const DEFAULT_BASE_URL = 'https://api.billium.to';

export interface BilliumOptions {
  /**
   * Your Billium **secret** API key (`sk_*`). Required to use
   * `billium.invoices` and `billium.webhooks` management methods.
   *
   * Generate a key in the Billium dashboard under Settings → Developer →
   * API keys. The dashboard issues two key types — public (`pk_*`) and
   * secret (`sk_*`) — but the Node SDK only consumes secret keys, since
   * every method it exposes mutates state or accesses webhook management
   * endpoints that public keys aren't authorized for. Public keys are
   * reserved for browser-side SDKs (vanilla JS, React, etc.) which will
   * ship as separate packages.
   *
   * Passing a `pk_*` key here is allowed, but methods like
   * `webhooks.create()` and `invoices.cancel()` will throw a
   * `BilliumError` immediately rather than round-tripping a 403.
   */
  apiKey?: string;

  /**
   * Your merchant ID (mer_...).
   * Required to use `billium.invoices`.
   */
  merchantId?: string;

  /**
   * Your webhook secret (whsec_...).
   * When set, you can call `billium.webhooks.verify(body, signature)` without
   * passing the secret as a third argument on every call.
   */
  webhookSecret?: string;

  /**
   * Override the API base URL. Useful for self-hosted deployments or testing.
   * @default 'https://api.billium.to'
   */
  baseUrl?: string;

  /**
   * Maximum number of retry attempts for failed requests.
   * Total HTTP calls = `maxRetries + 1`. Set to 0 to disable retries.
   *
   * Retries fire on network errors, 5xx responses, and 429 (rate limited).
   * `Retry-After` headers from the server are honored when present.
   *
   * `GET`, `PUT`, `PATCH`, and `DELETE` are always retried when
   * `maxRetries > 0`. `POST` is retried only when an `Idempotency-Key`
   * header is set on the request — otherwise retrying could create
   * duplicate resources.
   *
   * @default 2
   */
  maxRetries?: number;

  /**
   * Initial backoff delay in milliseconds. Retries use exponential backoff
   * with full jitter, capped at `maxDelayMs`.
   * @default 500
   */
  baseDelayMs?: number;

  /**
   * Upper bound for the backoff delay between retries.
   * @default 30000
   */
  maxDelayMs?: number;
}

export class Billium {
  readonly webhooks: WebhooksClient;
  readonly invoices: InvoicesClient;
  readonly customers: CustomersClient;
  readonly products: ProductsClient;
  readonly wallets: WalletsClient;

  constructor(options: BilliumOptions = {}) {
    if (options.apiKey && options.merchantId) {
      const http = new HttpClient(
        options.baseUrl ?? DEFAULT_BASE_URL,
        options.apiKey,
        {
          maxRetries: options.maxRetries,
          baseDelayMs: options.baseDelayMs,
          maxDelayMs: options.maxDelayMs,
        },
      );
      this.webhooks = new WebhooksClient(options.webhookSecret, http, options.merchantId);
      this.invoices = new InvoicesClient(http, options.merchantId);
      this.customers = new CustomersClient(http, options.merchantId);
      this.products = new ProductsClient(http, options.merchantId);
      this.wallets = new WalletsClient(http, options.merchantId);
    } else {
      this.webhooks = new WebhooksClient(options.webhookSecret);
      const merchantId = options.merchantId ?? '';
      this.invoices = new InvoicesClient(unconfiguredHttp(), merchantId);
      this.customers = new CustomersClient(unconfiguredHttp(), merchantId);
      this.products = new ProductsClient(unconfiguredHttp(), merchantId);
      this.wallets = new WalletsClient(unconfiguredHttp(), merchantId);
    }
  }
}

// `Billium` is exported as a named export only (no `export default`), which:
//   - Eliminates the tsup CJS warning about mixed named+default exports.
//   - Avoids the `require('@billium/node').default` foot-gun in CJS.
//   - Tree-shakes cleanly in bundlers.
//   - Matches the 2024+ ecosystem norm (Resend, Clerk, Supabase, etc.).
//
// Usage:
//   ESM:  import { Billium } from '@billium/node';
//   CJS:  const { Billium } = require('@billium/node');

// ─── Internal ────────────────────────────────────────────────────────────────

/**
 * Placeholder `HttpClient` used when only `webhookSecret` is configured
 * (i.e. the consumer only needs to verify webhook signatures, not call
 * the REST API).
 *
 * Returns a Proxy that throws a clear, actionable error on **any** property
 * access — get, post, patch, delete, future verbs we haven't added yet —
 * so callers don't get misleading "x is not a function" runtime errors.
 *
 * Using a Proxy instead of a hand-rolled object means we don't have to
 * remember to update this every time `HttpClient` grows a new method, and
 * the unsafe `as unknown as HttpClient` cast is gone.
 */
function unconfiguredHttp(): HttpClient {
  const message =
    'billium.invoices, billium.customers, billium.products, billium.wallets, ' +
    'and billium.webhooks management methods require both `apiKey` and ' +
    '`merchantId` to be set in the Billium constructor.';

  return new Proxy({} as HttpClient, {
    get() {
      // Return a function that rejects, so both `await client.invoices.list()`
      // and `client.invoices.list().then(...)` surface the same error.
      return () =>
        Promise.reject(
          Object.assign(new Error(message), {
            name: 'BilliumError',
          }),
        );
    },
  });
}
