import { HttpClient } from './http';
import { PaginatedResult } from './invoices';

// ─── Customer types ──────────────────────────────────────────────────────────

/**
 * Approximate location of a customer, derived from the geo data attached to
 * their most recent checkout activity. Only populated on responses from
 * `get()` — `list()` rows and the `update()` response do not include it.
 *
 * Both fields are `null` when the customer has no recorded activity yet, or
 * when MaxMind couldn't resolve the IP to a country/city.
 */
export interface CustomerLocation {
  /** ISO 3166-1 alpha-2 country code (e.g. 'US'), or `null` if unknown. */
  country: string | null;
  /** City name (e.g. 'San Francisco'), or `null` if unknown. */
  city: string | null;
}

/**
 * A customer in a merchant's directory.
 *
 * **How customers are created:** customers are not created directly through
 * this resource — there is no `create()` method. A customer row is
 * auto-provisioned by the backend the first time an invoice is generated for
 * a given `email` under the merchant (the `(merchantId, email)` pair is
 * unique). This client lets you list, retrieve, and update those rows.
 *
 * **Note on `metadata`:** an arbitrary JSON value the backend may attach to a
 * customer (used internally for checkout enrichment). Typed as `unknown`
 * because its shape is not part of the SDK's stable contract — narrow it
 * yourself if you depend on it. It is `null` when unset.
 *
 * **Note on `location`:** only present on the response from `get()`. It is
 * `undefined` on `list()` rows and on the `update()` response, which return
 * the raw customer record without the derived location. Guard for it before
 * reading.
 *
 * **Note on `Date` fields:** `createdAt` and `updatedAt` are ISO 8601 strings,
 * not `Date` objects — parse them with `new Date(...)` if you need a `Date`.
 */
export interface Customer {
  id: string;
  merchantId: string;
  email: string;
  name: string | null;
  address: string | null;
  phoneNumber: string | null;
  /** Arbitrary JSON attached by the backend, or `null` when unset. */
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
  /** Soft-delete timestamp; `null` for active customers (the only ones returned). */
  deletedAt: string | null;

  /**
   * Derived geolocation. Present only on `get()` responses — `undefined` on
   * `list()` rows and the `update()` response.
   */
  location?: CustomerLocation;
}

/**
 * Aggregate spend and invoice stats for a single customer, as returned by
 * `stats()`.
 *
 * **Note on `revenue`:** the sum of `rawAmount` across the customer's `PAID`
 * invoices. It is a string (Decimal serialized to preserve precision) when
 * the customer has at least one paid invoice, and falls back to the number
 * `0` when they have none. Coerce it before doing arithmetic.
 */
export interface CustomerStats {
  /** Total revenue from PAID invoices. Decimal-as-string, or `0` when none. */
  revenue: string | number;
  /** Count of all non-deleted invoices for this customer. */
  totalInvoices: number;
  /** Count of invoices in the PAID state. */
  paidInvoices: number;
  /** Percentage of invoices that are paid (0–100). */
  paidRate: number;
}

// ─── Input types ─────────────────────────────────────────────────────────────

export interface ListCustomersParams {
  /** Page number (1-based). Defaults to 1. */
  page?: number;
  /** Number of results per page (max 100). Defaults to 10. */
  limit?: number;
  /** Search by email, name, phone number, address, or ID. */
  search?: string;
}

/**
 * Fields accepted by `update()`. Every field is optional — only the keys you
 * pass are changed.
 *
 * Note that `email` is **not** updatable through this resource: a customer's
 * email is the natural key that ties them to their invoices, so the backend
 * only lets you edit the descriptive fields.
 */
export interface UpdateCustomerParams {
  /** Customer full name. */
  name?: string;
  /** Customer billing address. */
  address?: string;
  /** Customer phone number. */
  phoneNumber?: string;
}

// ─── Client ──────────────────────────────────────────────────────────────────

export class CustomersClient {
  private readonly basePath: string;

  constructor(
    private readonly http: HttpClient,
    merchantId: string,
  ) {
    this.basePath = `/v1/merchants/merchant/${merchantId}/customers`;
  }

  /**
   * Lists customers for the merchant with optional pagination and search.
   *
   * **Requires a secret key (`sk_*`).** Public keys (`pk_*`) have no
   * `customer:view` scope — they're limited to invoice and product reads.
   */
  async list(
    params?: ListCustomersParams,
  ): Promise<PaginatedResult<Customer>> {
    // Marked async so the synchronous throw inside `assertSecretKey` becomes a
    // rejected promise — both `list(...).catch(...)` and `await list(...)`
    // should surface the same error path.
    this.http.assertSecretKey('customers.list');
    return this.http.get<PaginatedResult<Customer>>(this.basePath, params);
  }

  /**
   * Retrieves a single customer by ID. The returned record includes the
   * derived {@link CustomerLocation} under `location`.
   *
   * **Requires a secret key (`sk_*`).**
   */
  async get(customerId: string): Promise<Customer> {
    this.http.assertSecretKey('customers.get');
    return this.http.get<Customer>(`${this.basePath}/${customerId}`);
  }

  /**
   * Retrieves aggregate spend and invoice stats for a customer (total
   * revenue from paid invoices, invoice counts, paid rate).
   *
   * **Requires a secret key (`sk_*`).**
   */
  async stats(customerId: string): Promise<CustomerStats> {
    this.http.assertSecretKey('customers.stats');
    return this.http.get<CustomerStats>(
      `${this.basePath}/${customerId}/resume`,
    );
  }

  /**
   * Updates a customer's descriptive fields (`name`, `address`,
   * `phoneNumber`). Email is not updatable — see {@link UpdateCustomerParams}.
   *
   * **Requires a secret key (`sk_*`).** Public keys (`pk_*`) cannot mutate
   * customers.
   */
  async update(
    customerId: string,
    params: UpdateCustomerParams,
  ): Promise<Customer> {
    this.http.assertSecretKey('customers.update');
    return this.http.patch<Customer>(
      `${this.basePath}/${customerId}`,
      params,
    );
  }
}
