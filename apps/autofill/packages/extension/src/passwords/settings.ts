/** Per-user switches for the password manager. Kept in the extension, never on the server. */
export interface PasswordSettings {
  /** Fill a sign-in form the moment it appears when exactly one login fits the site. */
  autoFill: boolean;
  /** Save a new login straight after a successful sign-in instead of asking first. */
  autoSave: boolean;
  /** Hosts the user said "never save for this site" on. */
  neverSave: string[];
}

export const DEFAULT_SETTINGS: PasswordSettings = {
  autoFill: true,
  autoSave: false,
  neverSave: [],
};

const KEY = 'passwordSettings';

export async function loadSettings(): Promise<PasswordSettings> {
  try {
    const stored = (await browser.storage.local.get(KEY))[KEY] as
      Partial<PasswordSettings> | undefined;
    return { ...DEFAULT_SETTINGS, ...stored };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(patch: Partial<PasswordSettings>): Promise<PasswordSettings> {
  const next = { ...(await loadSettings()), ...patch };
  await browser.storage.local.set({ [KEY]: next });
  return next;
}
