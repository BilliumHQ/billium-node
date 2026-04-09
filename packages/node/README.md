# @billium/node

Official Node.js SDK for [Billium](https://billium.to) — non-custodial crypto payments.

## Installation

```bash
npm install @billium/node
```

## Quick start

```typescript
import { Billium } from '@billium/node';

const billium = new Billium({
  apiKey: process.env.BILLIUM_API_KEY,           // sk_... (secret key)
  merchantId: process.env.BILLIUM_MERCHANT_ID,   // mer_...
  webhookSecret: process.env.BILLIUM_WEBHOOK_SECRET, // whsec_... (optional)
});
```

### About API keys

Billium issues two key types from the dashboard (Settings → Developer → API keys):

| Type | Prefix | Scope | Where to use |
|---|---|---|---|
| **Secret** | `sk_*` | Full server-side access — invoices, webhook management, customers, products | **This SDK.** Server code only — never ship a secret key to a browser. |
| **Public** | `pk_*` | Limited to `invoice.create`, `invoice.view`, `product.view` | Future browser-side SDKs (vanilla JS, React, Vue, Next.js client components) — not consumed by `@billium/node`. |

`@billium/node` is built for server environments and consumes **secret keys** (`sk_*`). If you pass a public key by mistake, methods that require secret scope (`webhooks.create()`, `invoices.cancel()`, etc.) will throw a `BilliumError` immediately with a clear message — they won't round-trip a generic `403` from the backend.

If you need to call Billium from a browser, route your requests through your own backend (running `@billium/node`) instead of calling Billium directly from client code. A browser-targeted SDK is on the roadmap, but its exact form — vanilla JS, React components, Vue, framework-agnostic — hasn't been decided yet, so there's no specific package name to wait on.

### About resource IDs

Every Billium resource ID is prefixed with a short tag indicating its type, followed by 32 hexadecimal characters. The prefix is for human and log-debuggability — when you see one of these in an error message, you instantly know what kind of resource it points at, without having to chase down which field it came from.

| Resource | Prefix | Example |
|---|---|---|
| Merchant | `mer_` | `mer_550e8400e29b41d4a716446655440000` |
| Invoice | `inv_` | `inv_7d9b8e2c1a4f4e3d9c2b8f7a6d5e3b1c` |
| Payment | `pay_` | `pay_3a1b9c8d7e6f5a4b3c2d1e0f9a8b7c6d` |
| Customer | `cus_` | `cus_a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7` |
| Product | `prd_` | `prd_b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8` |
| Webhook endpoint | `wh_` | `wh_c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9` |
| Wallet | `wal_` | `wal_d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0` |
| Invoice timeline entry | `tle_` | `tle_e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1` |
| Webhook event | `evt_` | `evt_f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2` |

The SDK treats IDs as opaque strings. You don't need to parse or construct them yourself — pass them through verbatim. The backend accepts both prefixed and bare UUID forms during the transition window, but you should always use the prefixed form returned by the API in production code.

## Invoices

### Create an invoice

```typescript
import { randomUUID } from 'crypto';

const invoice = await billium.invoices.create(
  {
    name: 'Order #1234',
    rawAmount: 99.99,
    currency: 'USD',
    customerEmail: 'customer@example.com',
    redirectUrl: 'https://yoursite.com/thank-you',
  },
  { idempotencyKey: randomUUID() },
);

console.log(invoice.id); // inv_...
```

#### Idempotency keys

Pass `idempotencyKey` whenever you call `create()` from anywhere a retry might happen — webhook handlers, queue workers, mobile-initiated checkouts, anything subject to timeouts or duplicate clicks.

The server stores the response keyed by `(merchantId, idempotencyKey)` for **24 hours**. If the same key arrives again with the same body, you get back the original invoice — no duplicate is created. If the key arrives with a *different* body, the server returns `409 Conflict` (it's almost always a programmer bug to reuse a key for two different requests).

The key also unlocks **automatic retries** on `create()`: without it, the SDK refuses to retry a failed `POST` because it can't prove the original didn't already succeed server-side. With it, the SDK will retry on transient errors (`5xx`, `429`, network failures) using exponential backoff with jitter.

```typescript
// One key per logical operation. UUID v4 is a good default.
await billium.invoices.create(params, { idempotencyKey: randomUUID() });

// Or, scope by your own business identifier — anything stable per attempt.
await billium.invoices.create(params, { idempotencyKey: `cart-${cartId}` });
```

### Get an invoice

```typescript
const invoice = await billium.invoices.get('inv_...');

invoice.id;                  // 'inv_...'
invoice.status;              // 'AWAITING_PAYMENT' | 'PAID' | ...
invoice.rawAmount;           // string — Decimal(15,6) serialized, use a decimal lib for math
invoice.customer?.email;     // string | undefined
invoice.payments;            // InvoicePayment[] — on-chain payments received against this invoice
invoice.invoiceTimeline;     // InvoiceTimelineEntry[] — status transition history
```

> **Note on amounts:** `rawAmount` and `endAmount` are returned as **strings**, not numbers. They're stored as `Decimal(15, 6)` in the database and serialized as strings to preserve precision. Use a decimal library (e.g. [`decimal.js`](https://github.com/MikeMcl/decimal.js/)) if you need to do arithmetic on them.

### List invoices

```typescript
const result = await billium.invoices.list({
  page: 1,
  limit: 20,
  search: 'Order',
});

console.log(result.data);  // Invoice[]
console.log(result.total); // total count
```

### Cancel an invoice

```typescript
await billium.invoices.cancel('inv_...');
```

## Webhooks

### Verify a webhook signature

Use `billium.webhooks.verify()` inside your webhook handler to validate that the request came from Billium.

```typescript
import express from 'express';

const app = express();

app.post('/webhooks', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const event = billium.webhooks.verify(
      req.body,                      // raw body (Buffer or string)
      req.headers['x-signature'],    // signature header
    );

    switch (event.event) {
      case 'invoice.paid':
        // handle payment
        break;
      case 'invoice.expired':
        // handle expiration
        break;
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Webhook verification failed:', err);
    res.sendStatus(400);
  }
});
```

You can also pass the secret explicitly per call:

```typescript
const event = billium.webhooks.verify(body, signature, 'whsec_...');
```

### Manage webhook endpoints

```typescript
// Create
const webhook = await billium.webhooks.create({
  url: 'https://yoursite.com/webhooks',
  events: ['invoice.paid', 'invoice.expired'],
  description: 'Production webhook',
});

// List
const webhooks = await billium.webhooks.list();

// Update
await billium.webhooks.update(webhook.id, {
  events: ['invoice.*'],
});

// Ping (send a test event)
await billium.webhooks.ping(webhook.id);

// Delete
await billium.webhooks.delete(webhook.id);
```

### Webhook event types

| Event | Delivery | Description |
|-------|----------|-------------|
| `invoice.*` | — | All invoice events (subscribe wildcard) |
| `invoice.created` | durable | Invoice was created |
| `invoice.updated` | best-effort | Invoice fields changed (status, expiry, etc.) |
| `invoice.paid` | **durable** | Invoice fully paid |
| `invoice.underpaid` | **durable** | Payment received but insufficient |
| `invoice.overpaid` | **durable** | Payment exceeds invoice amount |
| `invoice.expired` | **durable** | Invoice expired without payment |
| `invoice.cancelled` | **durable** | Invoice was cancelled by the merchant |
| `payment.*` | — | All payment events (subscribe wildcard) |
| `payment.created` | best-effort | Payment was created (customer initiated checkout) |
| `payment.updated` | best-effort | Payment fields changed (e.g. confirmation count) |
| `payment.detected` | **durable** | On-chain payment detected |
| `payment.confirmed` | **durable** | Payment confirmed on-chain |
| `payment.paid` | **durable** | Payment completed |
| `payment.underpaid` | **durable** | Underpayment detected |
| `payment.overpaid` | **durable** | Overpayment detected |
| `payment.expired` | **durable** | Payment expired |

#### Delivery guarantees

Billium emits webhooks via two paths depending on the event criticality:

- **Durable events** are written to a transactional outbox in the same database transaction as the underlying state change. A background processor picks them up every 10 seconds and delivers them — **even if the Billium backend crashes between the state change and the delivery attempt**, the event is replayed once the process recovers. These events have **at-least-once** delivery semantics: design your handler to be idempotent (e.g. dedupe on the `event.id` field).

- **Best-effort events** (`invoice.updated`, `payment.updated`, `payment.created`) are emitted in-process from the same request that triggered them, optimized for real-time UI sync (sub-second latency). These events have **at-most-once** semantics: a backend crash between the state change and HTTP delivery may drop them. Use them to keep your dashboards fresh, **not** to drive critical business logic — for that, listen to the matching durable event (e.g. use `payment.detected` / `payment.confirmed` instead of `payment.updated`).

In practice: **subscribe to terminal-state events for anything that touches money or fulfillment**, and treat `*.updated` and `payment.created` as nice-to-have UI hints.

## Configuration

```typescript
const billium = new Billium({
  apiKey: '...',         // Required for invoices and webhook management
  merchantId: '...',     // Required for invoices and webhook management
  webhookSecret: '...',  // Optional — default secret for webhook verification
  baseUrl: '...',        // Optional — defaults to https://api.billium.to

  // Retry configuration (all optional)
  maxRetries: 2,         // Total HTTP calls = maxRetries + 1. Default: 2
  baseDelayMs: 500,      // Initial backoff delay. Default: 500ms
  maxDelayMs: 30_000,    // Cap on backoff. Default: 30s
});
```

### Retries

The SDK automatically retries failed requests on:

- **Network errors** (DNS failure, connection reset, TLS handshake)
- **5xx responses** (500, 502, 503, 504)
- **429 Too Many Requests** — honoring the `Retry-After` header when present

Backoff is exponential with full jitter, so a fleet of clients failing simultaneously won't all retry at the same instant.

**Retry safety on POST**: `GET`, `PUT`, `PATCH`, and `DELETE` are always retried because they're idempotent by HTTP convention. `POST` is **only** retried when an `Idempotency-Key` is set on the request — otherwise a retry could create a duplicate resource if the original POST reached the server but the response was lost in transit. See the next section for how to set an idempotency key.

You can create a client with only `webhookSecret` if you only need to verify webhooks:

```typescript
const billium = new Billium({
  webhookSecret: process.env.BILLIUM_WEBHOOK_SECRET,
});

// This works:
const event = billium.webhooks.verify(body, signature);

// This throws — apiKey and merchantId are required:
await billium.invoices.list();
```

## Error handling

```typescript
import {
  BilliumError,
  BilliumApiError,
  BilliumWebhookSignatureError,
  BilliumWebhookTimestampError,
} from '@billium/node';

try {
  await billium.invoices.create({ name: 'Test', rawAmount: 10 });
} catch (err) {
  if (err instanceof BilliumApiError) {
    console.log(err.status);  // HTTP status code
    console.log(err.code);    // API error code
    console.log(err.message); // Error message
  }
}
```

| Error class | When |
|-------------|------|
| `BilliumError` | Base error — missing configuration |
| `BilliumApiError` | API returned a non-2xx response |
| `BilliumWebhookSignatureError` | Webhook signature mismatch or malformed header |
| `BilliumWebhookTimestampError` | Webhook timestamp outside tolerance window |

## Requirements

- Node.js >= 18.0.0
- Zero production dependencies

## License

MIT
