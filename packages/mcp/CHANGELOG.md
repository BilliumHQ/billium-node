# Changelog

All notable changes to `@billium/mcp` are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3]

### Fixed

- **MCP Registry namespace casing.** The registry's GitHub-OIDC auth grants the namespace using the org's canonical case (`io.github.BilliumHQ`), not lowercase, so the 0.1.2 submission was rejected with HTTP 403. Corrected `mcpName` and the `server.json` name to `io.github.BilliumHQ/billium` — this is the first version actually listed on the registry.

## [0.1.2]

### Fixed

- **MCP Registry publish.** The `server.json` description exceeded the registry's 100-character limit, so 0.1.1 published to npm but its registry submission was rejected (HTTP 422). Shortened the description; this is the first version listed on the MCP Registry. CI now guards `server.json` field lengths so this can't recur.

## [0.1.1]

### Added

- **Listed on the official [MCP Registry](https://registry.modelcontextprotocol.io)** as `io.github.BilliumHQ/billium`, so any MCP host can discover the Billium server through registry search. Adds an `mcpName` field to `package.json` and a `server.json` manifest, published automatically from CI on each `mcp-v*` tag via GitHub OIDC.

### Changed

- First release published end-to-end through CI via npm Trusted Publishing (OIDC) — this version carries a provenance attestation (verify with `npm audit signatures @billium/mcp`). 0.1.0 was a manual bootstrap publish (to claim the package name) and therefore has no provenance.

## [0.1.0]

Initial public release of the Billium MCP server.

### Added

- **stdio MCP server** exposing the Billium API to any [Model Context Protocol](https://modelcontextprotocol.io) host — Claude Code, Claude Desktop, Cursor, and others. Run with `npx -y @billium/mcp` (bin: `billium-mcp`).
- **23 tools** across five resources: invoices (`create_invoice`, `get_invoice`, `list_invoices`, `cancel_invoice`), webhooks (`create_webhook`, `list_webhooks`, `update_webhook`, `delete_webhook`, `ping_webhook`), customers (`list_customers`, `get_customer`, `get_customer_stats`, `update_customer`), products (`create_product`, `get_product`, `list_products`, `update_product`, `delete_product`), and wallets (`list_wallets`, `get_wallet`, `create_wallet`, `update_wallet`, `delete_wallet`).
- **Environment-based configuration.** Reads `BILLIUM_API_KEY` (`sk_...`) and `BILLIUM_MERCHANT_ID` (`mer_...`), with an optional `BILLIUM_BASE_URL` override for self-hosted or testing backends.
- **Zod-validated tool inputs.** Each tool validates its arguments before forwarding to the SDK, so malformed agent calls fail fast with a clear error rather than a generic API rejection.
- **Thin wrapper over [`@billium/node`](https://www.npmjs.com/package/@billium/node).** The server adds no custodial layer — your secret key stays on your machine and talks directly to the Billium API over HTTPS.
- **Automatic idempotency.** `create_invoice` always sends an idempotency key (generated if you don't pass one), so a retried tool call never creates a duplicate invoice.
- **npm provenance.** Published from GitHub Actions via OIDC Trusted Publishing, so every release carries a verifiable attestation tying the tarball to its source commit. Verify with `npm audit signatures @billium/mcp`.

[0.1.3]: https://github.com/BilliumHQ/billium-node/releases/tag/mcp-v0.1.3
[0.1.2]: https://github.com/BilliumHQ/billium-node/releases/tag/mcp-v0.1.2
[0.1.1]: https://github.com/BilliumHQ/billium-node/releases/tag/mcp-v0.1.1
[0.1.0]: https://github.com/BilliumHQ/billium-node/releases/tag/mcp-v0.1.0
