import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  CredsCheckRequest,
  CredsCheckResponse,
  CredsDraftRequest,
  CredsDraftResponse,
  CredsRevealResponse,
  CredsSaveRequest,
  CredsSaveResponse,
  LoginSummary,
} from '@applier/protocol';
import { REPO_ROOT } from '../config';

const SCRIPTS = resolve(REPO_ROOT, '.claude/skills/apply-to-jobs/scripts');

/** lib/credentials-store.mjs — the same store the `credentials.mjs` CLI uses. */
interface Store {
  findMatches(file: string, origin: string): LoginSummary[];
  reveal(file: string, origin: string, id: string): CredsRevealResponse | null;
  saveLogin(
    file: string,
    entry: { origin: string; login: string; password: string; verified: boolean },
  ): CredsSaveResponse;
  draftAccount(
    file: string,
    entry: {
      origin: string;
      login: string;
      length?: number | undefined;
      alphanumeric?: boolean | undefined;
      regenerate?: boolean | undefined;
    },
  ): CredsDraftResponse;
  checkLogin(
    file: string,
    entry: { origin: string; login: string; password: string },
  ): CredsCheckResponse['state'];
  markVerified(file: string, origin: string, id: string): boolean;
  removeEntry(file: string, origin: string, id: string): boolean;
}

const load = <T>(file: string): Promise<T> =>
  import(pathToFileURL(resolve(SCRIPTS, file)).href) as Promise<T>;

/** Where credentials.json is. Injected in tests so they never touch a real data repo. */
export type CredsFile = () => Promise<string>;

export const dataRepoCredsFile: CredsFile = async () => {
  const { dataPath } = await load<{ dataPath(...parts: string[]): string }>('lib/data-dir.mjs');
  return dataPath('credentials.json');
};

/** The login a new account is made with: the profile's own e-mail. */
export type LoginSource = () => Promise<string | null>;

export const profileEmail: LoginSource = async () => {
  const { loadProfile } = await load<{
    loadProfile(): { personal?: { email?: string } } | null;
  }>('lib/qa-match.mjs');
  return loadProfile()?.personal?.email ?? null;
};

/**
 * The password manager's brain. Every method takes the ORIGIN the browser reported for
 * the requesting page — the page itself never names a host — and the store only ever
 * returns a password for an entry whose domain fits that origin.
 */
export class CredsService {
  constructor(
    private readonly file: CredsFile = dataRepoCredsFile,
    private readonly login: LoginSource = profileEmail,
  ) {}

  private store = () => load<Store>('lib/credentials-store.mjs');

  async match(origin: string): Promise<LoginSummary[]> {
    return (await this.store()).findMatches(await this.file(), origin);
  }

  async reveal(origin: string, id: string): Promise<CredsRevealResponse | null> {
    return (await this.store()).reveal(await this.file(), origin, id);
  }

  async save(origin: string, req: CredsSaveRequest): Promise<CredsSaveResponse> {
    return (await this.store()).saveLogin(await this.file(), { origin, ...req });
  }

  async draft(origin: string, req: CredsDraftRequest): Promise<CredsDraftResponse> {
    const login = await this.login();
    if (!login) throw new Error('profile.json has no personal.email to sign up with');
    return (await this.store()).draftAccount(await this.file(), { origin, login, ...req });
  }

  async check(origin: string, req: CredsCheckRequest): Promise<CredsCheckResponse> {
    return { state: (await this.store()).checkLogin(await this.file(), { origin, ...req }) };
  }

  async verify(origin: string, id: string): Promise<boolean> {
    return (await this.store()).markVerified(await this.file(), origin, id);
  }

  async remove(origin: string, id: string): Promise<boolean> {
    return (await this.store()).removeEntry(await this.file(), origin, id);
  }
}
