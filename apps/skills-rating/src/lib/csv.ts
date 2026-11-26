import { isRating, type Rating, type SkillRecord } from './types';

/** RFC 4180 parser: supports quotes, escaped `""`, and commas and line breaks inside fields. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let fieldStarted = false;

  const endField = (): void => {
    row.push(field);
    field = '';
    fieldStarted = false;
  };
  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && !fieldStarted) {
      inQuotes = true;
      fieldStarted = true;
    } else if (char === ',') {
      endField();
    } else if (char === '\r') {
      if (text[i + 1] !== '\n') endRow(); // a lone \r also ends a row
    } else if (char === '\n') {
      endRow();
    } else {
      field += char;
      fieldStarted = true;
    }
  }

  if (field !== '' || row.length > 0) endRow();

  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

function escapeCsvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/**
 * The format of one particular file: which columns, in what order, and the line separator.
 * Needed so a write returns the file in exactly the shape it was read in.
 */
export interface CsvFormat {
  /** Column headers in file order (e.g. ['skill','rating','already_seen']). */
  headers: string[];
  /** Whether the file had a header row. */
  hasHeader: boolean;
  eol: '\n' | '\r\n';
  trailingNewline: boolean;
}

export interface SkillsFile {
  format: CsvFormat;
  skills: SkillRecord[];
}

const SECTION_KEYS = new Set(['section', 'category', 'group', 'секція']);
const NAME_KEYS = new Set(['skill', 'name', 'скіл', 'навичка']);
const RATING_KEYS = new Set(['rating', 'level', 'score', 'оцінка']);
const SEEN_KEYS = new Set(['already_seen', 'seen', 'вже бачив']);

const DEFAULT_HEADERS_3 = ['skill', 'rating', 'already_seen'];
const DEFAULT_HEADERS_4 = ['section', 'skill', 'rating', 'already_seen'];

interface ColumnMap {
  section: number;
  name: number;
  rating: number;
  seen: number;
}

function mapColumns(headers: readonly string[]): ColumnMap {
  const find = (keys: ReadonlySet<string>): number =>
    headers.findIndex((h) => keys.has(h.trim().toLowerCase()));
  return {
    section: find(SECTION_KEYS),
    name: find(NAME_KEYS),
    rating: find(RATING_KEYS),
    seen: find(SEEN_KEYS),
  };
}

function parseRating(raw: string): Rating {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const num = Number(trimmed);
  return isRating(num) ? num : null;
}

const TRUTHY_SEEN = new Set(['yes', 'y', 'true', '1', 'так', '+']);

function detectEol(text: string): '\n' | '\r\n' {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

/** Reads skills.csv, keeping its format for the write back. */
export function parseSkillsFile(text: string): SkillsFile {
  const rows = parseCsv(text);
  const first = rows[0] ?? [];
  const hasHeader = mapColumns(first).name !== -1;

  const headers = hasHeader
    ? first.map((h) => h.trim())
    : first.length >= 4
      ? DEFAULT_HEADERS_4
      : DEFAULT_HEADERS_3;

  const columns = mapColumns(headers);
  const nameIndex = columns.name === -1 ? 0 : columns.name;

  const format: CsvFormat = {
    headers,
    hasHeader,
    eol: detectEol(text),
    trailingNewline: text === '' || /\r?\n$/.test(text),
  };

  const skills = rows.slice(hasHeader ? 1 : 0).flatMap<SkillRecord>((row) => {
    const name = (row[nameIndex] ?? '').trim();
    if (name === '') return [];

    const extra: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (index === columns.section || index === nameIndex || index === columns.rating || index === columns.seen) {
        return;
      }
      extra[header] = row[index] ?? '';
    });

    return [
      {
        name,
        rating: parseRating(columns.rating === -1 ? '' : (row[columns.rating] ?? '')),
        seen: TRUTHY_SEEN.has((columns.seen === -1 ? '' : (row[columns.seen] ?? '')).trim().toLowerCase()),
        section: columns.section === -1 ? '' : (row[columns.section] ?? '').trim(),
        ...(Object.keys(extra).length > 0 ? { extra } : {}),
      },
    ];
  });

  return { format, skills };
}

/** Writes the skills back in the same format: same columns, order and line separator. */
export function serializeSkillsFile(file: SkillsFile): string {
  const { format, skills } = file;
  const columns = mapColumns(format.headers);
  const nameIndex = columns.name === -1 ? 0 : columns.name;

  const rows: string[][] = [];
  if (format.hasHeader) rows.push([...format.headers]);

  for (const skill of skills) {
    const row = format.headers.map((header, index) => {
      if (index === nameIndex) return skill.name;
      if (index === columns.rating) return skill.rating === null ? '' : String(skill.rating);
      if (index === columns.seen) return skill.seen ? 'yes' : '';
      if (index === columns.section) return skill.section;
      return skill.extra?.[header] ?? '';
    });
    rows.push(row);
  }

  const body = rows.map((row) => row.map(escapeCsvField).join(',')).join(format.eol);
  return format.trailingNewline ? body + format.eol : body;
}
