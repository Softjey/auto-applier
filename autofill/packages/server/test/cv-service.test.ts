import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Resolver } from '../src/legacy/resolver';
import { CvService } from '../src/services/cv-service';

const resolverWith = (config: Awaited<ReturnType<Resolver['loadConfig']>>) =>
  ({ loadConfig: async () => config }) as unknown as Resolver;

describe('CvService', () => {
  it('lists a single base resume when there is no resume repo', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cv-'));
    const file = join(dir, 'me.pdf');
    await writeFile(file, 'pdf');
    const cvs = new CvService(
      resolverWith({ paths: { baseResume: file }, resumeFileName: 'Jane.pdf' }),
    );
    expect(await cvs.list()).toEqual([{ id: 'base', label: 'Base resume' }]);
    expect(await cvs.read('base')).toMatchObject({
      name: 'Jane.pdf',
      base64: Buffer.from('pdf').toString('base64'),
    });
  });

  it('prefers tailored CVs and falls back to the base one when none are saved', async () => {
    const repo = await mkdtemp(join(tmpdir(), 'repo-'));
    const base = join(repo, 'base.pdf');
    await writeFile(base, 'base');
    const config = { paths: { resumeRepo: repo, baseResume: base } };
    expect(await new CvService(resolverWith(config)).list()).toEqual([
      { id: 'base', label: 'Base resume' },
    ]);

    await mkdir(join(repo, 'out', 'SAVED', 'Acme_1-Dev'), { recursive: true });
    await writeFile(join(repo, 'out', 'SAVED', 'Acme_1-Dev', 'CV.pdf'), 'tailored');
    expect((await new CvService(resolverWith(config)).list()).map((c) => c.id)).toEqual([
      'SAVED/Acme_1-Dev',
    ]);
  });

  it('returns nothing, and no base file, when nothing is configured or the path is missing', async () => {
    expect(await new CvService(resolverWith({})).list()).toEqual([]);
    expect(
      await new CvService(resolverWith({ paths: { baseResume: '/nope/x.pdf' } })).list(),
    ).toEqual([]);
    expect(await new CvService(resolverWith({})).read('base')).toBeNull();
  });
});
