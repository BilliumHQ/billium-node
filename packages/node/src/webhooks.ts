import { createHmac, timingSafeEqual } from 'crypto';

import {
  BilliumError,
  BilliumWebhookSignatureError,
  BilliumWebhookTimestampError,
} from './errors';
import { HttpClient } from './http';

// ─── Webhook event types ──────────────────────────────────────────────────────

export type WebhookEventType =
  // Invoice
  | 'invoice.*'
  | 'invoice.created'
  | 'invoice.updated'
  | 'invoice.paid'
  | 'invoice.underpaid'
  | 'invoice.overpaid'
  | 'invoice.expired'
  | 'invoice.cancelled'
  // Payment
  | 'payment.*'
  | 'payment.created'
  | 'payment.updated'
  | 'payment.detected'
  | 'payment.confirmed'
  | 'payment.paid'
  | 'payment.underpaid'
  | 'payment.overpaid'
  | 'payment.expired';

// ─── Webhook management types ─────────────────────────────────────────────────

export interface WebhookSecret {
  id: string;
  webhookId: string;
  secretKeyPreview: string;
  isActive: boolean;
  expiresAt?: string;
}

export interface Webhook {
  id: string;
  merchantId: string;
  url: string;
  events: WebhookEventType[];
  isActive: boolean;
  description?: string;
  /** Number of retry attempts on failure (0–10). */
  retryCount: number;
  /** Request timeout in milliseconds (1000–30000). */
  timeout: number;
  webhookSecrets: WebhookSecret[];
}

export interface CreateWebhookParams {
  /** The HTTPS URL Billium will POST events to. */
  url: string;
  /** List of event types to subscribe to. Use `'invoice.*'` or `'payment.*'` to subscribe to all events in a category. */
  events: WebhookEventType[];
  /** Optional description for this endpoint. */
  description?: string;
  /** Whether the webhook is active on creation. Defaults to `true`. */
  isActive?: boolean;
  /** Number of retry attempts on delivery failure (0–10). Defaults to `3`. */
  retryCount?: number;
  /** Request timeout in milliseconds (1000–30000). Defaults to `30000`. */
  timeout?: number;
}

export type UpdateWebhookParams = Partial<CreateWebhookParams>;

// ─── Signature verification types ────────────────────────────────────────────

export interface WebhookEvent {
  event: string;
  id: string;
  data: unknown;
  timestamp: string;
}

export interface VerifyOptions {
  /**
   * Maximum allowed age of the webhook timestamp in seconds.
   * Set to 0 to disable the check.
   * @default 300
   */
  tolerance?: number;
}

// ─── Client ──────────────────────────────────────────────────────────────────

export class WebhooksClient {
  private readonly basePath: string | undefined;

  constructor(
    private readonly defaultSecret?: string,
    private readonly http?: HttpClient,
    merchantId?: string,
  ) {
    this.basePath = merchantId
      ? `/v1/merchants/merchant/${merchantId}/webhooks`
      : undefined;
  }

  // ─── Signature verification ───────────────────────────────────────────────

  /**
   * Parses and verifies an incoming Billium webhook request.
   *
   * Signature header format:  x-signature: t={unix_seconds},v1={hmac_sha256_hex}
   * Signed string:            "{unix_seconds}.{raw_body}"
   * Algorithm:                HMAC-SHA256
   *
   * If `webhookSecret` was passed to the `Billium` constructor, you can omit
   * the `secret` argument here. Pass it explicitly to override.
   *
   * @param rawBody   Raw request body as Buffer or string — must not be parsed
   * @param signature Value of the `x-signature` header
   * @param secret    Webhook secret — can be omitted if set in the constructor
   * @param options   Optional config (tolerance window)
   *
   * @throws {BilliumError}                  No secret available
   * @throws {BilliumWebhookSignatureError}  Header malformed or HMAC mismatch
   * @throws {BilliumWebhookTimestampError}  Timestamp outside tolerance window
   */
  verify(
    rawBody: Buffer | string,
    signature: string,
    secret?: string,
    options: VerifyOptions = {},
  ): WebhookEvent {
    const resolvedSecret = secret ?? this.defaultSecret;
    if (!resolvedSecret) {
      throw new BilliumError(
        'A webhook secret is required. Pass it as the third argument or set webhookSecret in the Billium constructor.',
      );
    }
    return this.verifyInternal(rawBody, signature, resolvedSecret, options);
  }

  // ─── Webhook management ───────────────────────────────────────────────────

  /**
   * Creates a new webhook endpoint for the merchant.
   *
   * Requires `apiKey` and `merchantId` in the constructor, and the `apiKey`
   * must be a **secret key** (`sk_*`) — public keys do not have webhook
   * management scope.
   */
  async create(params: CreateWebhookParams): Promise<Webhook> {
    const http = this.managementHttp();
    http.assertSecretKey('webhooks.create');
    return http.post<Webhook>(this.managementPath(), params);
  }

  /**
   * Lists all webhook endpoints for the merchant.
   *
   * Requires `apiKey` and `merchantId` in the constructor, and the `apiKey`
   * must be a secret key (`sk_*`).
   */
  async list(): Promise<Webhook[]> {
    const http = this.managementHttp();
    http.assertSecretKey('webhooks.list');
    return http.get<Webhook[]>(this.managementPath());
  }

  /**
   * Updates a webhook endpoint.
   *
   * Requires `apiKey` and `merchantId` in the constructor, and the `apiKey`
   * must be a secret key (`sk_*`).
   */
  async update(webhookId: string, params: UpdateWebhookParams): Promise<Webhook> {
    const http = this.managementHttp();
    http.assertSecretKey('webhooks.update');
    return http.patch<Webhook>(
      `${this.managementPath()}/${webhookId}`,
      params,
    );
  }

  /**
   * Deletes a webhook endpoint.
   *
   * Requires `apiKey` and `merchantId` in the constructor, and the `apiKey`
   * must be a secret key (`sk_*`).
   */
  async delete(webhookId: string): Promise<void> {
    const http = this.managementHttp();
    http.assertSecretKey('webhooks.delete');
    return http.delete<void>(`${this.managementPath()}/${webhookId}`);
  }

  /**
   * Sends a test ping to a webhook endpoint to verify it is reachable.
   *
   * Requires `apiKey` and `merchantId` in the constructor, and the `apiKey`
   * must be a secret key (`sk_*`).
   */
  async ping(webhookId: string): Promise<void> {
    const http = this.managementHttp();
    http.assertSecretKey('webhooks.ping');
    return http.post<void>(`${this.managementPath()}/${webhookId}/ping`);
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  private managementHttp(): HttpClient {
    if (!this.http) {
      throw new BilliumError(
        'billium.webhooks management methods require both `apiKey` and `merchantId` to be set in the Billium constructor.',
      );
    }
    return this.http;
  }

  private managementPath(): string {
    if (!this.basePath) {
      throw new BilliumError(
        'billium.webhooks management methods require both `apiKey` and `merchantId` to be set in the Billium constructor.',
      );
    }
    return this.basePath;
  }

  private verifyInternal(
    rawBody: Buffer | string,
    signature: string,
    secret: string,
    options: VerifyOptions,
  ): WebhookEvent {
    const tolerance = options.tolerance ?? 300;

    const { timestamp, v1 } = this.parseSignatureHeader(signature);

    if (tolerance > 0) {
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (Math.abs(nowSeconds - timestamp) > tolerance) {
        throw new BilliumWebhookTimestampError(
          `Webhook timestamp is outside the tolerance window of ${tolerance} seconds.`,
        );
      }
    }

    const body =
      typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');

    const expectedHex = createHmac('sha256', secret)
      .update(`${timestamp}.${body}`)
      .digest('hex');

    if (!this.timingSafeCompare(expectedHex, v1)) {
      throw new BilliumWebhookSignatureError(
        'Webhook signature verification failed.',
      );
    }

    try {
      return JSON.parse(body) as WebhookEvent;
    } catch {
      throw new BilliumWebhookSignatureError(
        'Webhook body is not valid JSON.',
      );
    }
  }

  private parseSignatureHeader(header: string): {
    timestamp: number;
    v1: string;
  } {
    let rawTimestamp: string | undefined;
    let v1: string | undefined;

    for (const part of header.split(',')) {
      if (part.startsWith('t=')) rawTimestamp = part.slice(2);
      else if (part.startsWith('v1=')) v1 = part.slice(3);
    }

    if (!rawTimestamp || !v1) {
      throw new BilliumWebhookSignatureError(
        'Invalid x-signature header. Expected format: t={unix_seconds},v1={hmac_sha256_hex}',
      );
    }

    const timestamp = parseInt(rawTimestamp, 10);
    if (isNaN(timestamp) || timestamp <= 0) {
      throw new BilliumWebhookSignatureError(
        'Invalid timestamp in x-signature header.',
      );
    }

    return { timestamp, v1 };
  }

  private timingSafeCompare(expected: string, actual: string): boolean {
    if (expected.length !== actual.length) return false;
    const expectedBuf = Buffer.from(expected, 'hex');
    const actualBuf = Buffer.from(actual, 'hex');
    if (expectedBuf.length !== actualBuf.length) return false;
    return timingSafeEqual(expectedBuf, actualBuf);
  }
}
