# 1.0.0 release blurbs

Reusable copy for announcing `@billium/node 1.0.0` across blog, changelog, social, and customer email. Pick the format that fits the channel — they're all saying the same thing at different lengths.

---

## Tweet / short post (≤ 280 chars)

> **`@billium/node` 1.0 is on npm.** The official Node.js SDK for Billium — non-custodial crypto payments. Invoices, webhook verification, idempotent creates, automatic retries with exponential backoff. Zero runtime deps, signed with provenance.
>
> `npm install @billium/node`
>
> https://www.npmjs.com/package/@billium/node

---

## LinkedIn / Mastodon (3-5 paragraphs)

> **Billium's Node.js SDK just hit 1.0.**
>
> If you've ever integrated a payments API, you know the boilerplate: HMAC verification, signature timing checks, retry-on-503 logic, idempotency keys to avoid double-charging on a network blip. We wrote it once so you don't have to.
>
> `@billium/node 1.0` ships with:
>
> - **Invoices**: create, get, list, cancel — fully typed with the same shape the API returns.
> - **Webhook verification**: HMAC-SHA256 with timing-safe comparison and tolerance window. Drop-in for Express, Fastify, Hono, anything that gives you a raw body.
> - **Automatic retries** on transient failures (5xx, 429, network errors) with exponential backoff and jitter, honoring `Retry-After`. Refuses to retry POSTs without an idempotency key — because creating duplicate invoices is worse than failing.
> - **Idempotency keys** on `create()`, deduplicated server-side for 24 hours.
> - **Zero runtime dependencies**. Just `crypto` and `fetch` from the Node standard library.
> - **Dual ESM/CJS** with a single TypeScript declarations file each. Works in Next.js, NestJS, Express, Cloudflare Workers (with minor caveats — see roadmap).
> - **npm provenance**: every release is cryptographically tied to the source commit and built by GitHub Actions OIDC. Verify it yourself with `npm audit signatures @billium/node`.
>
> ```bash
> npm install @billium/node
> ```
>
> Repo: https://github.com/BilliumHQ/billium-node
> Docs: https://billium.to

---

## Blog post lead (5-8 paragraphs)

> # Shipping `@billium/node` 1.0
>
> We just published the first stable release of our official Node.js SDK on npm. If you're building a Node, NestJS, or Next.js app that needs to accept non-custodial crypto payments, `@billium/node` is now the recommended way to talk to the Billium API.
>
> ## What's in the box
>
> The SDK covers the two things every payments integration needs: **creating invoices** and **verifying webhooks**.
>
> **Creating invoices** is one method call, fully typed against the response shape the API actually returns. No mismatches between TypeScript types and runtime data — we audit-tested the SDK against the production backend before shipping.
>
> ```typescript
> import { Billium } from '@billium/node';
> import { randomUUID } from 'crypto';
>
> const billium = new Billium({
>   apiKey: process.env.BILLIUM_API_KEY,
>   merchantId: process.env.BILLIUM_MERCHANT_ID,
>   webhookSecret: process.env.BILLIUM_WEBHOOK_SECRET,
> });
>
> const invoice = await billium.invoices.create(
>   {
>     name: 'Order #1234',
>     rawAmount: 99.99,
>     currency: 'USD',
>     customerEmail: 'customer@example.com',
>   },
>   { idempotencyKey: randomUUID() },
> );
> ```
>
> **Verifying webhooks** is one method call too. Pass the raw request body and the `x-signature` header; the SDK does HMAC-SHA256 verification with timing-safe comparison and a configurable tolerance window. Out of the box it works in Express, Fastify, Hono, Next.js Route Handlers — anywhere you can get the unparsed body.
>
> ```typescript
> app.post('/webhooks', express.raw({ type: 'application/json' }), (req, res) => {
>   try {
>     const event = billium.webhooks.verify(req.body, req.headers['x-signature']);
>     // event.event is fully typed: 'invoice.paid' | 'invoice.cancelled' | ...
>     handle(event);
>     res.sendStatus(200);
>   } catch (err) {
>     // BilliumWebhookSignatureError or BilliumWebhookTimestampError
>     res.sendStatus(400);
>   }
> });
> ```
>
> ## What we're proud of
>
> A few decisions worth calling out:
>
> **The SDK refuses to retry POSTs without an idempotency key.** Most retry logic is naive: it'll retry any request that times out, including `POST /invoices`. That's fine — until the original request actually reached the server, processed, and the response was lost in transit. Now you have two invoices. We refuse to do this. POSTs are only retried when you pass `{ idempotencyKey }`, which the server uses to deduplicate the second attempt. The default is *correctness over availability*, the way it should be.
>
> **Zero runtime dependencies.** The entire SDK is `crypto` and `fetch` from the Node standard library. No `axios`, no `node-fetch`, no transitive dependency tree to audit. The total install footprint is ~40 KB.
>
> **Provenance from day one.** Every published version has a cryptographic provenance attestation tied to the source commit and the GitHub Actions workflow that built it. Anyone can verify the chain of custody:
>
> ```bash
> npm audit signatures @billium/node
> ```
>
> This is the new bar for SDK trust in 2025. We didn't want to ship without it.
>
> **Webhook delivery semantics are documented honestly.** Some events (`invoice.paid`, `payment.confirmed`, etc.) go through a transactional outbox and have at-least-once delivery with crash recovery. Others (`invoice.updated`, `payment.updated`) are best-effort, optimized for sub-second UI sync. The README says exactly which is which, so you know what to trust for business logic vs what to treat as a UI hint. No magic.
>
> ## Get started
>
> ```bash
> npm install @billium/node
> ```
>
> - **GitHub**: https://github.com/BilliumHQ/billium-node
> - **npm**: https://www.npmjs.com/package/@billium/node
> - **Docs**: https://billium.to
>
> Found a bug or have a feature request? Open an issue. PRs welcome.

---

## Internal / customer email (2-3 paragraphs)

> Subject: **Billium Node.js SDK is now stable (`@billium/node 1.0`)**
>
> Hi <name>,
>
> If you're integrating Billium in a Node.js, NestJS, or Next.js project, the official SDK is now stable on npm. `@billium/node 1.0` covers invoice creation, webhook signature verification, and webhook management, with full TypeScript types and zero runtime dependencies.
>
> Two features I think you'll appreciate:
>
> 1. **Idempotency keys** — pass `{ idempotencyKey: randomUUID() }` to `create()` and the server will deduplicate retries within 24 hours. No more double-charges from network blips.
> 2. **Automatic retries** — built-in exponential backoff with jitter on transient failures, honoring `Retry-After`. Set `maxRetries: 0` to disable if you'd rather handle retries yourself.
>
> Install:
>
> ```bash
> npm install @billium/node
> ```
>
> Full docs: https://github.com/BilliumHQ/billium-node — let me know if you hit anything weird.
>
> — <signature>
