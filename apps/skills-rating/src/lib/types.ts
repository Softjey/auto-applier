/** Skill rating: 0–5, or `null` if not rated yet (an empty cell in the CSV). */
export type Rating = 0 | 1 | 2 | 3 | 4 | 5 | null;

/** One skills.csv row, normalized. */
export interface SkillRecord {
  name: string;
  rating: Rating;
  /** The `already_seen` column. */
  seen: boolean;
  /** Section — only when the file has such a column; otherwise an empty string. */
  section: string;
  /** Values of columns the app does not know, so a write does not drop them. */
  extra?: Record<string, string>;
}

/** The same, plus a stable id for React keys and focus. */
export interface Skill extends SkillRecord {
  uid: string;
}

export const RATING_VALUES = [0, 1, 2, 3, 4, 5] as const;

export function isRating(value: number): value is Exclude<Rating, null> {
  return Number.isInteger(value) && value >= 0 && value <= 5;
}
