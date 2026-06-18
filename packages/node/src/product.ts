import { HttpClient } from './http';
import { PaginatedResult } from './invoices';

// ─── Product types ────────────────────────────────────────────────────────────

/**
 * Fiat currency a product is priced in. Mirrors the backend `Currency`
 * enum — the price itself is always a fiat amount; the customer pays the
 * crypto equivalent at checkout time.
 */
export type ProductCurrency = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD' | 'JPY';

/**
 * A product as returned by the Billium merchant API.
 *
 * **Note on `price`:** it's a string, not a number, because it's stored as
 * `Decimal(15, 6)` in the database and serialized as a string to preserve
 * precision. Use a decimal library (e.g. `decimal.js`) for arithmetic.
 *
 * **Note on `image` vs `signedImage`:** `image` is the raw storage key (an
 * internal object path, or `null` when no image was uploaded). `signedImage`
 * is a short-lived presigned URL you can render directly in an `<img>` tag.
 * It's `null` when the product has no image, or when generating the URL
 * failed. Prefer `signedImage` for display; treat `image` as opaque.
 *
 * **Note on `askFor*` flags:** these control which customer fields the
 * hosted product checkout page collects before payment.
 */
export interface Product {
  id: string;
  merchantId: string;
  /** Raw storage key for the product image, or `null`. Opaque — prefer `signedImage` for display. */
  image: string | null;
  name: string;
  description: string | null;
  /** Decimal serialized as string. The product's fiat price. */
  price: string;
  currency: ProductCurrency;
  /** Whether the product is purchasable through its checkout page. */
  isActive: boolean;
  /** Whether the checkout page asks the customer for their name. */
  askForName: boolean;
  /** Whether the checkout page asks the customer for their address. */
  askForAddress: boolean;
  /** Whether the checkout page asks the customer for their phone number. */
  askForPhoneNumber: boolean;
  createdAt: string;
  updatedAt: string;
  /**
   * Soft-delete timestamp. `null` for live products; set to an ISO date on
   * the object returned by `delete()`.
   */
  deletedAt: string | null;
  /**
   * Short-lived presigned URL for the product image, ready to render.
   * `null` when there is no image. Present on `create()`, `get()`, `list()`,
   * and `update()` responses; absent on the `delete()` response.
   */
  signedImage?: string | null;
}

// ─── Input types ─────────────────────────────────────────────────────────────

export interface CreateProductParams {
  /** Product display name (≤ 200 chars). */
  name: string;
  /** Fiat price (0–1,000,000). Sent as a number; returned as a string. */
  price: number;
  /** Currency code. Defaults to 'USD'. */
  currency?: ProductCurrency;
  /** Optional product description (≤ 1000 chars). */
  description?: string;
  /** Storage key of a previously uploaded image (≤ 500 chars). */
  image?: string;
  /** Whether the product is purchasable on creation. Defaults to `true`. */
  isActive?: boolean;
  /** Whether the checkout page asks the customer for their name. Defaults to `false`. */
  askForName?: boolean;
  /** Whether the checkout page asks the customer for their address. Defaults to `false`. */
  askForAddress?: boolean;
  /** Whether the checkout page asks the customer for their phone number. Defaults to `false`. */
  askForPhoneNumber?: boolean;
}

/**
 * Fields accepted by `products.update()`. Every field is optional — only the
 * keys you send are changed; omitted keys are left untouched.
 */
export type UpdateProductParams = Partial<CreateProductParams>;

export interface ListProductsParams {
  /** Page number (1-based). Defaults to 1. */
  page?: number;
  /** Number of results per page (max 100). Defaults to 10. */
  limit?: number;
  /** Search by product name, description, ID, or exact price. */
  search?: string;
}

// ─── Client ──────────────────────────────────────────────────────────────────

export class ProductsClient {
  private readonly basePath: string;

  constructor(
    private readonly http: HttpClient,
    merchantId: string,
  ) {
    this.basePath = `/v1/merchants/merchant/${merchantId}/products`;
  }

  /**
   * Creates a new product for the merchant.
   *
   * **Requires a secret key (`sk_*`).** Public keys (`pk_*`) have scope only
   * for `product.view`, not product creation.
   */
  async create(params: CreateProductParams): Promise<Product> {
    // Marked async so the synchronous throw inside `assertSecretKey` becomes
    // a rejected promise — `create(...).catch(...)` and `await create(...)`
    // both see the same error path.
    this.http.assertSecretKey('products.create');
    return this.http.post<Product>(this.basePath, params);
  }

  /**
   * Retrieves a single product by ID.
   */
  get(productId: string): Promise<Product> {
    return this.http.get<Product>(`${this.basePath}/${productId}`);
  }

  /**
   * Lists products for the merchant with optional pagination and search.
   */
  list(params?: ListProductsParams): Promise<PaginatedResult<Product>> {
    return this.http.get<PaginatedResult<Product>>(this.basePath, params);
  }

  /**
   * Updates an existing product. Only the fields you pass are changed.
   *
   * **Requires a secret key (`sk_*`).** Public keys (`pk_*`) cannot mutate
   * products.
   */
  async update(
    productId: string,
    params: UpdateProductParams,
  ): Promise<Product> {
    this.http.assertSecretKey('products.update');
    return this.http.patch<Product>(`${this.basePath}/${productId}`, params);
  }

  /**
   * Soft-deletes a product. The returned object has `deletedAt` set and does
   * not include `signedImage`.
   *
   * **Requires a secret key (`sk_*`).** Public keys (`pk_*`) cannot delete
   * products.
   */
  async delete(productId: string): Promise<Product> {
    this.http.assertSecretKey('products.delete');
    return this.http.delete<Product>(`${this.basePath}/${productId}`);
  }
}
