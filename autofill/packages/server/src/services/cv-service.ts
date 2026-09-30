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

/**
 * Tailored CVs live in <resumeRepo>/out/<STATUS>/<Company>_<vacancyId>-<Title>/.
 * Ids are only ever accepted from this listing, never used as paths, so a
 * crafted id cannot escape the out/ tree.
 */
export class CvService {
  constructor(private readonly resolver: Resolver) {}

  async list(): Promise<CvSummary[]> {
    return (await this.scan()).map(({ id, label }) => ({ id, label }));
  }

  async read(id: string): Promise<CvResponse | null> {
    const hit = (await this.scan()).find((cv) => cv.id === id);
    if (!hit) return null;
    const { resumeFileName } = await this.resolver.loadConfig();
    return { name: resumeFileName ?? 'CV.pdf', base64: (await readFile(hit.file)).toString('base64') };
  }

  private async scan(): Promise<CvEntry[]> {
    const { paths } = await this.resolver.loadConfig();
    if (!paths?.resumeRepo) return [];
    const entries: CvEntry[] = [];
    for (const status of STATUS_DIRS) {
      const base = join(paths.resumeRepo, 'out', status);
      const dirs = await readdir(base).catch(() => [] as string[]);
      for (const dir of dirs) {
        const files = await readdir(join(base, dir)).catch(() => [] as string[]);
        const pdf = files.find((name) => /\.pdf$/i.test(name));
        if (!pdf) continue;
        const file = join(base, dir, pdf);
        entries.push({ id: `${status}/${dir}`, label: dir, file, mtimeMs: (await stat(file)).mtimeMs });
      }
    }
    return entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
  }
}
