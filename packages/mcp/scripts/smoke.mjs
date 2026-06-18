// Manual smoke test: spawns the built MCP server over stdio and lists its
// tools, using dummy credentials (tool listing needs no live backend).
//   node scripts/smoke.mjs
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['dist/index.js'],
  cwd: new URL('..', import.meta.url).pathname,
  env: {
    ...process.env,
    BILLIUM_API_KEY: process.env.BILLIUM_API_KEY ?? 'sk_dummy',
    BILLIUM_MERCHANT_ID: process.env.BILLIUM_MERCHANT_ID ?? 'mer_dummy',
  },
});

const client = new Client({ name: 'smoke', version: '1.0.0' });
await client.connect(transport);
const { tools } = await client.listTools();
console.log(`Server booted over stdio. ${tools.length} tools:`);
for (const t of tools) console.log('  -', t.name);
await client.close();
