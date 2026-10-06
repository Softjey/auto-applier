import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { CvResponse, CvSummary } from '@applier/protocol';
import type { Resolver } from '../legacy/resolver';

interface CvEntry extends CvSummary {
  file: string;
  mtimeMs: number;
}

/** Only vacancies still to apply to. Applied/rejected CVs are history, not candidates. */
const STATUS_DIRS = ['SAVED'] as const;

/** Id of the single CV a user without a resume repo points `paths.baseResume` at. */
const BASE_ID = 'base';

/**
 * Tailored CVs live in <resumeRepo>/out/<STATUS>/<Company>_<vacancyId>-<Title>/.
 * Ids are only ever accepted from this listing, never used as paths, so a
 * crafted id cannot escape the out/ tree.
 */
export class CvService {
  /** `outDir` overrides <resumeRepo>/out (e2e tests point it at a fixture CV). */
  constructor(
    private readonly resolver: Resolver,
    private readonly outDir?: string,
  ) {}

  async list(): Promise<CvSummary[]> {
    return (await this.scan()).map(({ id, label }) => ({ id, label }));
  }

  async read(id: string): Promise<CvResponse | null> {
    const hit = (await this.scan()).find((cv) => cv.id === id);
    if (!hit) return null;
    const { resumeFileName } = await this.resolver.loadConfig();
    return {
      name: resumeFileName ?? 'CV.pdf',
      base64: (await readFile(hit.file)).toString('base64'),
    };
  }

  private async scan(): Promise<CvEntry[]> {
    const { paths } = await this.resolver.loadConfig();
    const out = this.outDir ?? (paths?.resumeRepo ? join(paths.resumeRepo, 'out') : undefined);
    const entries: CvEntry[] = [];
    if (!out) return this.baseOnly(paths?.baseResume);
    for (const status of STATUS_DIRS) {
      const base = join(out, status);
      const dirs = await readdir(base).catch(() => [] as string[]);
      for (const dir of dirs) {
        const files = await readdir(join(base, dir)).catch(() => [] as string[]);
        const pdf = files.find((name) => /\.pdf$/i.test(name));
        if (!pdf) continue;
        const file = join(base, dir, pdf);
        entries.push({
          id: `${status}/${dir}`,
          label: dir,
          file,
          mtimeMs: (await stat(file)).mtimeMs,
        });
      }
    }
    if (entries.length === 0) return this.baseOnly(paths?.baseResume);
    return entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
  }

  /** One resume for every vacancy: no tailoring, just the user's own PDF. */
  private async baseOnly(file?: string): Promise<CvEntry[]> {
    if (!file) return [];
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) return [];
    return [{ id: BASE_ID, label: 'Base resume', file, mtimeMs: info.mtimeMs }];
  }
}
