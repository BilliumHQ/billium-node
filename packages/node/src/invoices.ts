import { HttpClient } from './http';

// ─── Invoice types ──────────────────────────────────────────────────────────

export type InvoiceStatus =
  | 'AWAITING_PAYMENT'
  | 'PENDING_CONFIRMATION'
  | 'PAID'
  | 'UNDERPAID'
  | 'OVERPAID'
  | 'EXPIRED'
  | 'CANCELLED';

/**
 * Customer attached to an invoice. Returned as a nested relation, not as
 * flat `customerEmail` / `customerName` fields, because that mirrors the
 * underlying data model: a customer is a separate entity that can be linked
 * to multiple invoices.
 */
export interface InvoiceCustomer {
  id: string;
  merchantId: string;
  email: string;
  name: string | null;
  address: string | null;
  phoneNumber: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Product an invoice was generated from, when applicable. Only set for
 * invoices created via the public product checkout endpoint.
 */
export interface InvoiceProduct {
  id: string;
  name: string;
  description: string | null;
  price: string;
  currency: string;
  image: string | null;
}

/**
 * A single transition in an invoice's status history. Useful for rendering
 * a timeline in a merchant dashboard.
 */
export interface InvoiceTimelineEntry {
  id: string;
  invoiceId: string;
  paymentStatus: InvoiceStatus;
  time: string;
}

/**
 * On-chain payment received against an invoice. An invoice can have zero
 * payments (still awaiting), one (typical), or many (split payments,
 * overpayments, etc.).
 */
export interface InvoicePayment {
  id: string;
  invoiceId: string;
  chainId: number | null;
  /** Symbol of the chain's native coin (e.g. 'BTC', 'ETH'). */
  network: string | null;
  txHash: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  amount: string;
  currency: string;
  status: string;
  receivedTxAt: string | null;
  confirmedTxAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * An invoice as returned by the Billium merchant API.
 *
 * **Note on numeric fields:** `rawAmount` and `endAmount` are strings, not
 * numbers, because they're stored as `Decimal(15, 6)` in the database and
 * serialized as strings to preserve precision. Use a decimal library
 * (e.g. `decimal.js`) for arithmetic.
 *
 * **Note on relations:** `customer`, `product`, `payments`, and
 * `invoiceTimeline` are always present on responses from `create()`,
 * `get()`, `list()`, and `cancel()`. They will be `null` / `[]` when
 * empty, never `undefined`.
 */
export interface Invoice {
  id: string;
  merchantId: string;
  customerId: string | null;
  productId: string | null;
  name: string;
  description: string | null;
  redirectUrl: string | null;
  /** Decimal serialized as string. The amount the merchant set on the invoice. */
  rawAmount: string;
  /** Decimal serialized as string. The amount the customer actually pays (rawAmount + fees, when applicable). */
  endAmount: string;
  currency: string;
  status: InvoiceStatus;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;

  // Relations — always included on merchant API responses.
  customer: InvoiceCustomer | null;
  product: InvoiceProduct | null;
  payments: InvoicePayment[];
  invoiceTimeline: InvoiceTimelineEntry[];
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// ─── Input types ─────────────────────────────────────────────────────────────

export interface CreateInvoiceParams {
  /** Invoice display name. */
  name: string;
  /** Amount in the specified currency. */
  rawAmount: number;
  /** Currency code (e.g. 'USD'). Defaults to 'USD'. */
  currency?: string;
  /** Customer email address. */
  customerEmail?: string;
  /** Customer full name. */
  customerName?: string;
  /** Customer billing address. */
  customerAddress?: string;
  /** Customer phone number. */
  customerPhoneNumber?: string;
  /** Optional description shown on the invoice. */
  description?: string;
  /** URL to redirect the customer after payment. */
  redirectUrl?: string;
}

export interface ListInvoicesParams {
  /** Page number (1-based). Defaults to 1. */
  page?: number;
  /** Number of results per page (max 100). Defaults to 10. */
  limit?: number;
  /** Search by invoice name, description, or ID. */
  search?: string;
}

// ─── Request options ─────────────────────────────────────────────────────────

/**
 * Per-call options accepted by `invoices.create()`.
 */
export interface CreateInvoiceOptions {
  /**
   * A unique key (≤ 255 chars, scoped to your merchant) that the server uses
   * to deduplicate retried requests. If you call `create()` twice with the
   * same key and same body within 24 hours, the second call returns the
   * exact response from the first — no duplicate invoice is created.
   *
   * **You should set this on every `create()` call** in production. The SDK
   * also requires it for transparent retries on POST: without this header,
   * the SDK will not retry a failed `create()` call (even on `503`),
   * because it cannot prove the server didn't already accept the first
   * attempt.
   *
   * Generate a fresh key per logical operation (e.g. one per checkout
   * session, one per cart submission). A UUID v4 is a good default:
   *
   * ```typescript
   * import { randomUUID } from 'crypto';
   *
   * const invoice = await billium.invoices.create(
   *   { name: 'Order #1234', rawAmount: 99.99 },
   *   { idempotencyKey: randomUUID() },
   * );
   * ```
   *
   * If the server sees the same key with a *different* body, it returns
   * `409 Conflict` — that's a programming bug, not a transient error.
   */
  idempotencyKey?: string;
}

// ─── Client ──────────────────────────────────────────────────────────────────

export class InvoicesClient {
  private readonly basePath: string;

  constructor(
    private readonly http: HttpClient,
    merchantId: string,
  ) {
    this.basePath = `/api/v1/merchants/merchant/${merchantId}/invoices`;
  }

  /**
   * Creates a new invoice for the merchant.
   *
   * Pass `options.idempotencyKey` for safe retries — see
   * {@link CreateInvoiceOptions.idempotencyKey} for the full rationale.
   */
  create(
    params: CreateInvoiceParams,
    options: CreateInvoiceOptions = {},
  ): Promise<Invoice> {
    const headers: Record<string, string> | undefined = options.idempotencyKey
      ? { 'Idempotency-Key': options.idempotencyKey }
      : undefined;
    return this.http.post<Invoice>(this.basePath, params, { headers });
  }

  /**
   * Retrieves a single invoice by ID.
   */
  get(invoiceId: string): Promise<Invoice> {
    return this.http.get<Invoice>(`${this.basePath}/${invoiceId}`);
  }

  /**
   * Lists invoices for the merchant with optional pagination and search.
   */
  list(params?: ListInvoicesParams): Promise<PaginatedResult<Invoice>> {
    return this.http.get<PaginatedResult<Invoice>>(this.basePath, params);
  }

  /**
   * Cancels an invoice. Only invoices in non-terminal states can be cancelled.
   * Terminal states: PAID, UNDERPAID, OVERPAID, EXPIRED, CANCELLED.
   *
   * **Requires a secret key (`sk_*`).** Public keys (`pk_*`) cannot mutate
   * existing invoices.
   */
  async cancel(invoiceId: string): Promise<Invoice> {
    // Marked async so that the synchronous throw inside `assertSecretKey`
    // becomes a rejected promise — `cancel(...).catch(...)` and
    // `await cancel(...)` should both see the same error path.
    this.http.assertSecretKey('invoices.cancel');
    return this.http.post<Invoice>(`${this.basePath}/${invoiceId}/cancel`);
  }
}
