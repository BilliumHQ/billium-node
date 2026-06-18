import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { billiumFromEnv } from './config';
import { createServer } from './server';

async function main(): Promise<void> {
  const billium = billiumFromEnv();
  const server = createServer(billium);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stdout is the MCP protocol channel — all human-readable logging must go to
  // stderr so it never corrupts the JSON-RPC stream.
  console.error('Billium MCP server running on stdio.');
}

main().catch((err: unknown) => {
  console.error(
    'Failed to start Billium MCP server:',
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
