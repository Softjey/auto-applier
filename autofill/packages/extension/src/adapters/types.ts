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
  /**
   * For an ATS that lives on its customers' own domains (Teamtailor career sites): the
   * URL alone says nothing, so the page is asked. Consulted only when no adapter's
   * `matches` took the URL.
   */
  detect?(url: URL, doc: Document): boolean;
  /** Needs the page-world selectize bridge (page-bridge.content.ts). */
  readonly needsBridge?: boolean;
  /**
   * Radio / checkbox groups the generic scan cannot see — custom segmented buttons that carry
   * no ARIA role (Ashby's Yes/No). Each group's `members` are the clickable elements.
   */
  groups?(root: ParentNode): WidgetGroup[];
  /** Where the form lives (a modal, a form element). Default: the whole document. */
  scope?(doc: Document): ParentNode | null;
  /** Override the scraped label of a control (for forms that have none). */
  label?(el: HTMLElement, index: number, siblings: readonly HTMLElement[]): string | undefined;
  /** Controls the adapter must never touch. */
  ignore?(el: HTMLElement, label: string): boolean;
  /** Labels that must never be ticked even if the plan says check. */
  neverTick?: RegExp;
  /**
   * Uploading the CV makes the site rewrite the form (eRecruiter's postback
   * resets selects). Fill, upload, wait this long, then fill again.
   */
  refillAfterCvMs?: number;
  /**
   * Uploading the CV makes the site parse it and overwrite fields already filled
   * (SmartRecruiters writes junk into First name). Upload first, wait, then fill.
   */
  cvFirst?: boolean;
}

/** A group of clickable options the adapter found in its own markup. */
export interface WidgetGroup {
  kind: 'radio-group' | 'checkbox-group';
  members: HTMLElement[];
  /** The question the group answers, as the page words it. */
  question?: string;
  required?: boolean;
}
