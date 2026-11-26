import { useCallback, useEffect, useRef, useState } from 'react';

import { ConflictError, fetchSkills, saveSkills } from '../lib/api';
import type { Skill, SkillRecord } from '../lib/types';

const SAVE_DEBOUNCE_MS = 400;

export type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved'; at: number }
  | { status: 'error'; message: string; conflict: boolean };

let uidCounter = 0;
const nextUid = (): string => `s${(uidCounter += 1)}`;

const toSkills = (records: readonly SkillRecord[]): Skill[] =>
  records.map((record) => ({ ...record, uid: nextUid() }));

const toRecords = (skills: readonly Skill[]): SkillRecord[] =>
  skills.map(({ section, name, rating, seen }) => ({ section, name, rating, seen }));

export interface UseSkillsResult {
  skills: Skill[] | null;
  csvPath: string | null;
  loadError: string | null;
  saveState: SaveState;
  /** Updates one skill; changes are saved to skills.csv automatically. */
  updateSkill: (uid: string, patch: Partial<Omit<Skill, 'uid'>>) => void;
  addSkill: (name: string, section: string) => void;
  removeSkill: (uid: string) => void;
  reload: () => void;
}

export function useSkills(): UseSkillsResult {
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [csvPath, setCsvPath] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });

  const revisionRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const pendingRef = useRef<Skill[] | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);

  const flush = useCallback(async (): Promise<void> => {
    if (inFlightRef.current) return;
    const pending = pendingRef.current;
    if (pending === null) return;

    pendingRef.current = null;
    inFlightRef.current = true;
    setSaveState({ status: 'saving' });
    try {
      const { revision } = await saveSkills(toRecords(pending), revisionRef.current);
      revisionRef.current = revision;
      setSaveState({ status: 'saved', at: Date.now() });
    } catch (error) {
      const conflict = error instanceof ConflictError;
      // On a conflict, do not retry the write: wait until the user reloads the file.
      if (conflict) pendingRef.current = null;
      setSaveState({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
        conflict,
      });
    } finally {
      inFlightRef.current = false;
      if (pendingRef.current !== null) void flush();
    }
  }, []);

  const scheduleSave = useCallback(
    (next: Skill[]): void => {
      pendingRef.current = next;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void flush();
      }, SAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  const load = useCallback((): void => {
    setLoadError(null);
    fetchSkills()
      .then((response) => {
        revisionRef.current = response.revision;
        dirtyRef.current = false;
        pendingRef.current = null;
        setCsvPath(response.path);
        setSkills(toSkills(response.skills));
        setSaveState({ status: 'idle' });
      })
      .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : String(error)));
  }, []);

  useEffect(load, [load]);

  // Do not lose the latest changes if the tab is closed before the debounce fires.
  useEffect(() => {
    const onHide = (): void => {
      if (pendingRef.current !== null) void flush();
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [flush]);

  // Save in an effect, not in the state updater: StrictMode calls the updater twice.
  useEffect(() => {
    if (skills === null || !dirtyRef.current) return;
    dirtyRef.current = false;
    scheduleSave(skills);
  }, [skills, scheduleSave]);

  const mutate = useCallback((transform: (current: Skill[]) => Skill[]): void => {
    dirtyRef.current = true;
    setSkills((current) => (current === null ? current : transform(current)));
  }, []);

  const updateSkill = useCallback<UseSkillsResult['updateSkill']>(
    (uid, patch) => mutate((current) => current.map((s) => (s.uid === uid ? { ...s, ...patch } : s))),
    [mutate],
  );

  const addSkill = useCallback<UseSkillsResult['addSkill']>(
    (name, section) =>
      mutate((current) => {
        const created: Skill = { uid: nextUid(), name: name.trim(), rating: null, seen: false, section };
        if (section === '') return [...current, created];
        // Insert at the end of its section so the CSV order stays intact.
        const lastIndex = current.map((s) => s.section).lastIndexOf(section);
        if (lastIndex === -1) return [...current, created];
        return [...current.slice(0, lastIndex + 1), created, ...current.slice(lastIndex + 1)];
      }),
    [mutate],
  );

  const removeSkill = useCallback<UseSkillsResult['removeSkill']>(
    (uid) => mutate((current) => current.filter((s) => s.uid !== uid)),
    [mutate],
  );

  return { skills, csvPath, loadError, saveState, updateSkill, addSkill, removeSkill, reload: load };
}
