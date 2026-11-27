import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/** The tests run the BUILT extension — the same bytes Chrome loads. */
export default function globalSetup(): void {
  execFileSync('pnpm', ['--filter', '@applier/extension', 'build'], {
    cwd: resolve(import.meta.dirname, '../..'),
    stdio: 'inherit',
    // Bake the e2e port into the bundle (protocol/api.ts): this build never talks to the dev server.
    env: {
      ...process.env,
      AUTOFILL_PORT: String(process.env['AUTOFILL_E2E_PORT'] ?? 7399),
      AUTOFILL_OUT_DIR: '.output-e2e',
    },
  });
}
