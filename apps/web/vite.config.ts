import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/** Serves (dev) and emits (build) web-ifc's WASM binary at /wasm/web-ifc.wasm; the package does not export it. */
function webIfcWasm(): Plugin {
  const source = join(dirname(createRequire(import.meta.url).resolve('web-ifc')), 'web-ifc.wasm');
  return {
    name: 'web-ifc-wasm',
    configureServer(server) {
      server.middlewares.use('/wasm/web-ifc.wasm', (_req, res) => {
        res.setHeader('Content-Type', 'application/wasm');
        createReadStream(source).pipe(res);
      });
    },
    async generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'wasm/web-ifc.wasm', source: await readFile(source) });
    },
  };
}

export default defineConfig({
  plugins: [react(), webIfcWasm()],
  // The lazily loaded viewer chunk bundles web-ifc's Emscripten glue (~4 MB); that is expected.
  build: { chunkSizeWarningLimit: 4500 },
  server: {
    port: 5173,
    proxy: { '/api': process.env.API_TARGET ?? 'http://127.0.0.1:3000' },
  },
});
