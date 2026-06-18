import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  sourcemap: true,
  clean: true,
  minify: false,
  splitting: false,
  target: 'node18',
  // Keep the shebang so the published bin is directly executable via npx.
  banner: { js: '#!/usr/bin/env node' },
  // @billium/node and the MCP SDK are real dependencies — installed by the
  // consumer, not inlined — so they stay external.
  external: ['@billium/node', '@modelcontextprotocol/sdk', 'zod'],
});
