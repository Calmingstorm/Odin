import { defineConfig } from 'vite';

// Build tooling for the Odin WebUI. Deliberately minimal: the UI keeps its
// plain-ES-module + template-string structure (no SFCs), so the only Vue
// build needed is the esm-bundler WITH the runtime template compiler.
// NOTE: runtime template compilation is why 'unsafe-eval' remains in the
// CSP — tracked for removal when/if pages migrate to precompiled SFCs.
export default defineConfig({
  root: 'ui',
  // Assets are served by the bot under /ui/ — hashed asset URLs must match
  base: '/ui/',
  resolve: {
    alias: {
      vue: 'vue/dist/vue.esm-bundler.js',
    },
  },
  define: {
    __VUE_OPTIONS_API__: 'true',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        ws: true,
      },
    },
  },
  preview: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        ws: true,
      },
    },
  },
});
