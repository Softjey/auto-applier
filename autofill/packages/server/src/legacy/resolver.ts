// The one seam between this package and the agent-side scripts under
// .claude/. Everything that decides "what is the right answer for this field"
// stays in resolve-fields.mjs / qa-match.mjs / field-labels.mjs, so a question
// never resolves differently depending on whether the agent or the extension
// asked it. Nothing here re-implements any of that.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { FieldDescriptor } from '@applier/protocol';
import { REPO_ROOT } from '../config';

const SCRIPTS = resolve(REPO_ROOT, '.claude/skills/apply-to-jobs/scripts');

export interface ClassifyResult {
  status: 'resolved' | 'runtime' | 'narrative' | 'review' | 'unknown' | 'skip';
  value?: unknown;
  source?: string;
  why?: string;
  runtime?: 'cv' | 'salary';
  candidates?: { id: string; q: string; a: string; score: number }[];
}

export interface AgentConfig {
  paths?: { resumeRepo?: string; baseResume?: string };
  resumeFileName?: string;
}

/** Profile + vocabulary are re-read on every call: a qa[] entry added a minute ago must apply now. */
export interface Resolver {
  classify(field: FieldDescriptor): Promise<ClassifyResult>;
  loadConfig(): Promise<AgentConfig>;
}

type ResolveFieldsModule = {
  classify(field: unknown, profile: unknown, vocab: unknown): ClassifyResult;
};
type QaMatchModule = { loadProfile(): unknown };
type FieldLabelsModule = {
  buildVocabulary(profile: unknown): unknown;
  loadConfig(): AgentConfig | null;
};

const load = <T>(file: string): Promise<T> =>
  import(pathToFileURL(resolve(SCRIPTS, file)).href) as Promise<T>;

interface PersonalProfile {
  personal?: { currentCity?: string; currentCountry?: string };
}

/**
 * A city box that offers suggestions as you type ("Warsaw" -> Warsaw, Poland / Warsaw, Indiana /
 * Warsaw, New York …) cannot be answered with the bare city: it is ambiguous, and the extension
 * rightly refuses to guess. The profile knows the country, so the answer carries it. A box that
 * lists its options up front, or any other field, is left as the resolver answered.
 */
export function withCountryForSuggestions(
  field: FieldDescriptor,
  result: ClassifyResult,
  profile: unknown,
): ClassifyResult {
  const { currentCity, currentCountry } = (profile as PersonalProfile).personal ?? {};
  const isSuggestBox = field.kind === 'combobox' && field.optionsHidden === true;
  if (!isSuggestBox || result.status !== 'resolved' || !currentCity || !currentCountry) {
    return result;
  }
  return typeof result.value === 'string' && result.value.trim() === currentCity
    ? { ...result, value: `${currentCity}, ${currentCountry}` }
    : result;
}

export function createLegacyResolver(): Resolver {
  return {
    async classify(field) {
      const [{ classify }, { loadProfile }, { buildVocabulary }] = await Promise.all([
        load<ResolveFieldsModule>('resolve-fields.mjs'),
        load<QaMatchModule>('lib/qa-match.mjs'),
        load<FieldLabelsModule>('lib/field-labels.mjs'),
      ]);
      const profile = loadProfile();
      return withCountryForSuggestions(
        field,
        classify(field, profile, buildVocabulary(profile)),
        profile,
      );
    },
    async loadConfig() {
      const { loadConfig } = await load<FieldLabelsModule>('lib/field-labels.mjs');
      return loadConfig() ?? {};
    },
  };
}
