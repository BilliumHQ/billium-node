# Changelog

All notable changes to `@billium/node` are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0]

### Added

- **Customers client.** `billium.customers.list / get / stats / update`. Customers are created implicitly when an invoice is issued, so there is no `create` or `delete` — the client covers reading and editing existing records. `stats(customerId)` returns aggregate metrics (`CustomerStats`), and `Customer` carries an optional `location` (`CustomerLocation`). New exported types: `Customer`, `CustomerLocation`, `CustomerStats`, `ListCustomersParams`, `UpdateCustomerParams`.
- **Products client.** `billium.products.create / get / list / update / delete` — full CRUD over catalog products. `update` accepts a partial of the create params (`UpdateProductParams = Partial<CreateProductParams>`). New exported types: `Product`, `ProductCurrency` (`'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD' | 'JPY'`), `CreateProductParams`, `UpdateProductParams`, `ListProductsParams`.
- **Wallets client.** `billium.wallets.list / get / create / update / delete` for managing the destination wallets that receive settlement. `Wallet` distinguishes `DIRECT_WALLET` from `XPUB_WALLET` (`WalletType`) and is typed against the supported `Cryptocurrency` set and `Network` rails (`BTC`, `ETH`, `BNB`, `POL`, `LTC`, `CRO`, `TRX`). New exported types: `Wallet`, `WalletType`, `Cryptocurrency`, `Network`, `CreateWalletParams`, `UpdateWalletParams`.

All three clients require a secret key (`sk_*`). Consistent with the existing public-key safety guard, calling any of their methods with a `pk_*` key throws a `BilliumError` at call time rather than round-tripping a `403`. These additions are backward compatible — no existing method signature, option, or response shape changed, which is why this is a minor release.

### Note

These clients are the SDK surface that [`@billium/mcp`](https://www.npmjs.com/package/@billium/mcp) builds its customer, product, and wallet tools on. `@billium/mcp` depends on `@billium/node@^1.0.1`, so installing this release satisfies that range and those tools resolve to a build that actually contains the methods.

[1.1.0]: https://github.com/BilliumHQ/billium-node/releases/tag/v1.1.0

## [1.0.1]

### Changed

- **API base path moved from `/api/v1` to `/v1`.** Billium now serves its API on the dedicated `api.billium.to` subdomain, so the `/api` segment was redundant. The invoice and webhook resource paths were updated accordingly. This is an internal change — the public SDK surface (method names, options, response shapes) and the `baseUrl` default (`https://api.billium.to`) are unchanged.

  **Compatibility:** this version targets the Billium backend that serves `/v1`. If you self-host an older backend that still serves `/api/v1`, stay on `1.0.0`.

## [1.0.0]

Initial public release. The API surface is covered by the SemVer guarantee from this point on — breaking changes will only ship in major releases.

### Added

- **Invoices client.** `billium.invoices.create / get / list / cancel`. The `Invoice` response shape mirrors the backend exactly: customer information is nested under `invoice.customer` (as `InvoiceCustomer | null`), and `rawAmount` / `endAmount` are returned as **strings** (Prisma `Decimal(15,6)` serialized) rather than numbers — use a decimal library like `decimal.js` for arithmetic.
- **Webhook signature verification.** `billium.webhooks.verify(rawBody, signatureHeader)` performs HMAC-SHA256 with timing-safe comparison and a configurable tolerance window. Drop-in for Express, Fastify, Hono, Next.js Route Handlers — anywhere you can get the raw request body.
- **Webhook management.** `billium.webhooks.create / list / update / delete / ping` for managing webhook endpoints from server code. Requires a secret key.
- **Idempotency-Key support** on `invoices.create()` via `{ idempotencyKey }` option. The server deduplicates retries within a 24 h window so a network blip can't create duplicate invoices. Generate a UUID v4 per logical operation.
- **Automatic retries** for transient failures (`5xx`, `429`, network errors) with exponential backoff and full jitter. Honors `Retry-After` headers when present. Configurable via `maxRetries`, `baseDelayMs`, `maxDelayMs` on the `Billium` constructor (defaults: 2 retries, 500 ms base, 30 s cap). `POST` is only retried when an `Idempotency-Key` header is set — without one, the SDK refuses to retry POSTs to avoid creating duplicates.
- **Public-key safety guard.** Billium issues two API key types: `pk_*` (public, scope-limited) and `sk_*` (secret, full access). The SDK detects the `pk_*` prefix at construct time and throws a `BilliumError` immediately when a method that requires secret scope (`webhooks.create / list / update / delete / ping`, `invoices.cancel`) is called — no round-tripping a generic `403` from the backend to find out you used the wrong key. Public keys are reserved for future browser-side SDKs.
- **Prefixed resource IDs.** Every entity returned by the API has a typed prefix: `mer_` (merchant), `inv_` (invoice), `pay_` (payment), `cus_` (customer), `prd_` (product), `wh_` (webhook endpoint), `wal_` (wallet), `tle_` (invoice timeline entry), `evt_` (webhook event). Format: `{prefix}_{32 hex chars}`. The SDK treats IDs as opaque strings — pass them through verbatim. See the README's "About resource IDs" section.
- **Webhook event types.** The full `WebhookEventType` union covers every event the backend emits: `invoice.created/updated/paid/underpaid/overpaid/expired/cancelled`, `payment.created/updated/detected/confirmed/paid/underpaid/overpaid/expired`, plus the `invoice.*` and `payment.*` wildcards.
- **Per-event delivery guarantees** documented in the README. Terminal-state events (`invoice.paid`, `payment.confirmed`, etc.) flow through a transactional outbox with at-least-once delivery and crash recovery. Best-effort events (`invoice.updated`, `payment.updated`, `payment.created`) are emitted in-process for sub-second UI sync — use them as UI hints, not for critical business logic.
- **`User-Agent` header** (`billium-node/<version> (node/<process.version>)`) on every request, so backend operators can segment traffic by SDK version.
- **Dual ESM / CJS build** with TypeScript declarations for both module formats. `Billium` is exposed as a named export only — `import { Billium } from '@billium/node'` (ESM) or `const { Billium } = require('@billium/node')` (CJS) — to keep CJS consumers free of `.default` foot-guns and to tree-shake cleanly in modern bundlers.
- **Zero runtime dependencies.** The SDK uses only native Node.js APIs: `crypto` for HMAC verification, `fetch` for HTTP. Total install footprint ≈ 47 KB packed.
- **Public TypeScript surface** re-exports `Invoice`, `InvoiceStatus`, `InvoiceCustomer`, `InvoiceProduct`, `InvoicePayment`, `InvoiceTimelineEntry`, `CreateInvoiceParams`, `CreateInvoiceOptions`, `ListInvoicesParams`, `PaginatedResult`, `Webhook`, `WebhookEvent`, `WebhookEventType`, `WebhookSecret`, `CreateWebhookParams`, `UpdateWebhookParams`, `VerifyOptions`, `BilliumError`, `BilliumApiError`, `BilliumWebhookSignatureError`, `BilliumWebhookTimestampError`, and `SDK_VERSION`.
- **Test suite typecheck.** `npm run lint` typechecks both `src/` and `tests/` (via a separate `tsconfig.test.json`), so type drift in fixtures fails CI alongside source code.
- **npm provenance.** Releases are published from GitHub Actions via OIDC, so every published version carries a verifiable cryptographic attestation tying the tarball to its source commit. Verify with `npm audit signatures @billium/node`.

### Server-side prerequisites

These backend behaviors are required for `@billium/node 1.0.0` to work end-to-end. They shipped alongside the SDK as part of the same launch:

- `POST /merchants/merchant/:merchantId/invoices` returns the full invoice DTO with relations (the same shape as `GET /invoices/:id`).
- `POST /merchants/merchant/:merchantId/invoices/:invoiceId/cancel` returns the same full shape.
- `invoice.cancelled` webhook event is emitted via the outbox when a merchant cancels an invoice, with at-least-once delivery semantics.
- `Idempotency-Key` header is honored on `POST /invoices` with a 24 h TTL, body-hash mismatch detection, and an in-flight processing lock.
- A global response interceptor (`IdSerializerInterceptor`) prefixes resource IDs on every API response (`mer_`, `inv_`, etc.), and a global request middleware (`StripIdPrefixMiddleware`) strips the prefix on the way back in. Prisma still stores bare UUIDs at the database layer — the prefix lives only on the wire.
- Two-tier rate limiting: a global IP-based throttler (50 req / 60 s) and a per-API-key throttler (300 req / 60 s, keyed off the `x-api-key` prefix). Both expose `X-RateLimit-Limit / Remaining / Reset` and `Retry-After` headers, which the SDK's retry loop honors automatically.

[1.0.0]: https://github.com/BilliumHQ/billium-node/releases/tag/v1.0.0
