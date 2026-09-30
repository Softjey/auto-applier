/**
 * Everything site-specific lives behind this interface. The core (scan, plan,
 * execute) never mentions a host; adding an ATS means adding one adapter file
 * and registering it. Quirks are written down in
 * .claude/skills/apply-to-jobs/ats/<host>.md — the adapter is where they become code.
 */
export interface SiteAdapter {
  /** Stable id, used in reports. */
  readonly id: string;
  /** Match patterns for the manifest (Chrome match-pattern syntax). */
  readonly matchPatterns: readonly string[];
  /** Is this URL a page that carries (or opens) an application form? */
  matches(url: URL): boolean;
  /** Where the form lives (a modal, a form element). Default: the whole document. */
  scope?(doc: Document): ParentNode | null;
  /** Override the scraped label of a control (for forms that have none). */
  label?(el: HTMLElement, index: number, siblings: readonly HTMLElement[]): string | undefined;
  /** Controls the adapter must never touch. */
  ignore?(el: HTMLElement, label: string): boolean;
  /** Labels that must never be ticked even if the plan says check. */
  neverTick?: RegExp;
  /** Checkboxes on this site cannot be read or driven reliably: leave every one to the user. */
  leaveCheckboxes?: boolean;
  /**
   * Uploading the CV makes the site rewrite the form (eRecruiter's postback
   * resets selects). Fill, upload, wait this long, then fill again.
   */
  refillAfterCvMs?: number;
}
