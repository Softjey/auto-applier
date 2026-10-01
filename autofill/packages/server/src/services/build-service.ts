import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { REPO_ROOT } from '../config';

/** The dev build the user loaded into Chrome (\`pnpm --filter @applier/extension build\`). */
const MANIFEST = resolve(
  process.env['AUTOFILL_EXTENSION_DIR'] ??
    resolve(REPO_ROOT, 'autofill/packages/extension/.output/chrome-mv3'),
  'manifest.json',
);

/** mtime of the built manifest, or null when there is no build. */
export async function buildTime(): Promise<number | null> {
  return stat(MANIFEST).then(
    (s) => Math.floor(s.mtimeMs),
    () => null,
  );
}
