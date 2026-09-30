import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/** The tests run the BUILT extension — the same bytes Chrome loads. */
export default function globalSetup(): void {
  execFileSync('pnpm', ['--filter', '@applier/extension', 'build'], {
    cwd: resolve(import.meta.dirname, '../..'),
    stdio: 'inherit',
  });
}
