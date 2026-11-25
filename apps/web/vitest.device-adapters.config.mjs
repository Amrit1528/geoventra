/**
 * Minimal Vitest config for the device-adapters UI tests.
 *
 * The shared vitest.config.ts currently pins @vitejs/plugin-react to a Vite version
 * that is incompatible with the installed Vitest runner. This config avoids that
 * plugin (Vite/esbuild handles the TSX transform) so the device adapter tests stay
 * runnable until the shared test tooling is aligned.
 */
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, '');
const ui = fileURLToPath(new URL('../../packages/ui/src', import.meta.url)).replace(/\/$/, '');

export default {
  resolve: {
    alias: {
      '@': `${web}/src`,
      '@geoventra/ui': ui,
    },
  },
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/app/(app)/device-adapters/page.test.tsx'],
    pool: 'forks',
    fileParallelism: false,
  },
};
