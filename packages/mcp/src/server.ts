import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Billium } from '@billium/node';

import { registerTools } from './tools';
import { registerMerchantTools } from './tools-merchant';
import { MCP_VERSION } from './version';

/**
 * Builds the Billium MCP server and registers every tool against the given SDK
 * client. Transport-agnostic — `index.ts` connects it over stdio in production,
 * and tests connect it over an in-memory transport.
 */
export function createServer(billium: Billium): McpServer {
  const server = new McpServer({
    name: 'billium',
    version: MCP_VERSION,
  });

  registerTools(server, billium);
  registerMerchantTools(server, billium);

  return server;
}
