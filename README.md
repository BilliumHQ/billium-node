# Billium SDKs

Official client libraries for [Billium](https://billium.to) — non-custodial crypto payments, invoices, and webhooks.

## Packages

| Package | Version | Description |
|---|---|---|
| [`@billium/node`](./packages/node) | [![npm](https://img.shields.io/npm/v/@billium/node.svg)](https://www.npmjs.com/package/@billium/node) | Node.js SDK — invoices, webhook signature verification, webhook management |
| [`@billium/mcp`](./packages/mcp) | [![npm](https://img.shields.io/npm/v/@billium/mcp.svg)](https://www.npmjs.com/package/@billium/mcp) | MCP server — manage invoices and webhooks from Claude, Cursor, and any MCP host |

Additional language SDKs will live as siblings under `packages/` as they ship.

## Quick start

```bash
npm install @billium/node
```

```typescript
import { Billium } from '@billium/node';

const billium = new Billium({
  apiKey: process.env.BILLIUM_API_KEY,
  merchantId: process.env.BILLIUM_MERCHANT_ID,
  webhookSecret: process.env.BILLIUM_WEBHOOK_SECRET,
});

const invoice = await billium.invoices.create(
  { name: 'Order #1234', rawAmount: 99.99 },
  { idempotencyKey: crypto.randomUUID() },
);
```

See [`packages/node/README.md`](./packages/node/README.md) for the full Node.js SDK reference.

## Repository layout

```
.
├── packages/
│   ├── node/              # @billium/node — TypeScript Node.js SDK
│   │   ├── src/           # Source
│   │   ├── tests/         # Vitest test suite
│   │   ├── README.md      # Public-facing docs (rendered on npmjs.com)
│   │   └── CHANGELOG.md   # Per-release notes
│   └── mcp/               # @billium/mcp — Model Context Protocol server
│       ├── src/           # Server + tool definitions
│       ├── tests/         # Vitest in-memory round-trip suite
│       └── README.md      # Host setup (Claude Code, Cursor, …)
└── .github/
    ├── workflows/         # CI + release automation
    ├── ISSUE_TEMPLATE/    # Bug + feature request forms
    └── CODEOWNERS         # Review requirements
```

## Development

This is an npm workspace. Run scripts from the repository root:

```bash
npm install        # installs all workspace packages
npm run lint       # typechecks every package (src + tests)
npm test           # runs every package's test suite
npm run build      # builds every package
```

To work on a specific package, you can also `cd packages/node && npm <script>`.

### Releasing

Releases are published to npm by GitHub Actions when a `v*.*.*` tag is pushed:

1. Bump `packages/node/package.json#version` **and** `packages/node/src/version.ts#SDK_VERSION` to the new version (CI verifies they match).
2. Add a section to `packages/node/CHANGELOG.md` describing the changes.
3. Commit the bump on `main`.
4. Tag and push: `git tag v1.0.1 && git push origin v1.0.1`.
5. The release workflow runs lint, test, build, then `npm publish` with provenance.

## License

[MIT](./LICENSE)
