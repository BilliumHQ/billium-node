# @billium/mcp

The official **Billium MCP server** — manage non-custodial crypto invoices and webhooks from any [Model Context Protocol](https://modelcontextprotocol.io) host: Claude Code, Claude Desktop, Cursor, and others.

Once connected, you can just ask:

> _"Create a $49.99 invoice for order #1234 and give me the checkout link."_
> _"List my last 10 invoices and tell me which are still awaiting payment."_
> _"Add a webhook to https://api.myshop.com/billium that fires on invoice.paid."_

…and the agent calls Billium directly.

## Requirements

- Node.js ≥ 18
- A Billium **secret** API key (`sk_...`) and your **merchant ID** (`mer_...`), from the dashboard under **Settings → Developer → API keys**.

## Configuration

The server reads three environment variables:

| Variable | Required | Description |
| --- | --- | --- |
| `BILLIUM_API_KEY` | ✅ | Secret API key (`sk_...`) |
| `BILLIUM_MERCHANT_ID` | ✅ | Merchant ID (`mer_...`) |
| `BILLIUM_BASE_URL` | — | Override the API base URL (self-hosted / testing) |

### Claude Code

```bash
claude mcp add billium \
  --env BILLIUM_API_KEY=sk_your_key \
  --env BILLIUM_MERCHANT_ID=mer_your_id \
  -- npx -y @billium/mcp
```

### Claude Desktop / Cursor

Add to your MCP config (`claude_desktop_config.json`, or Cursor's `mcp.json`):

```json
{
  "mcpServers": {
    "billium": {
      "command": "npx",
      "args": ["-y", "@billium/mcp"],
      "env": {
        "BILLIUM_API_KEY": "sk_your_key",
        "BILLIUM_MERCHANT_ID": "mer_your_id"
      }
    }
  }
}
```

## Tools

23 tools across invoices, webhooks, customers, products, and wallets.

**Invoices**

| Tool | Description |
| --- | --- |
| `create_invoice` | Create a crypto payment invoice (auto idempotency key) |
| `get_invoice` | Fetch an invoice by ID with status, payments, and timeline |
| `list_invoices` | List invoices with pagination and search |
| `cancel_invoice` | Cancel an unpaid invoice |

**Webhooks**

| Tool | Description |
| --- | --- |
| `create_webhook` | Register a webhook endpoint for invoice/payment events |
| `list_webhooks` | List configured webhook endpoints |
| `update_webhook` | Update a webhook's URL, events, or settings |
| `delete_webhook` | Delete a webhook endpoint |
| `ping_webhook` | Send a test event to a webhook endpoint |

**Customers**

| Tool | Description |
| --- | --- |
| `list_customers` | List customers with pagination and search |
| `get_customer` | Fetch a customer by ID |
| `get_customer_stats` | Revenue and invoice stats for a customer |
| `update_customer` | Update a customer's name/address/phone |

**Products**

| Tool | Description |
| --- | --- |
| `create_product` | Create a product for hosted checkout |
| `get_product` | Fetch a product by ID |
| `list_products` | List products with pagination and search |
| `update_product` | Update a product |
| `delete_product` | Delete a product |

**Wallets**

| Tool | Description |
| --- | --- |
| `list_wallets` | List wallet configurations (public config only) |
| `get_wallet` | Fetch a wallet by ID |
| `create_wallet` | Add a DIRECT_WALLET (address) or XPUB_WALLET (xpub) |
| `update_wallet` | Update a wallet's config |
| `delete_wallet` | Delete a wallet |

## Security

- Your secret key never leaves your machine — the server runs locally and talks
  directly to the Billium API over HTTPS.
- Settlement is **non-custodial**: payments go straight to your wallet; Billium
  never holds funds.
- `create_invoice` always sends an idempotency key (generated if you don't pass
  one), so a retried call never creates a duplicate invoice.

## How it works

This server is a thin [MCP](https://modelcontextprotocol.io) wrapper over the
[`@billium/node`](https://www.npmjs.com/package/@billium/node) SDK, exposed over
stdio. Each tool validates its input with [zod](https://zod.dev) and forwards it
to the SDK.

## License

MIT
