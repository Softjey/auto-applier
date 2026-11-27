import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import type { FieldDescriptor, SalaryBand, SalaryQuote } from '@applier/protocol';
import { REPO_ROOT } from '../config';

const run = promisify(execFile);
const SCRIPT = resolve(REPO_ROOT, '.claude/skills/apply-to-jobs/scripts/salary-quote.mjs');

export type SalaryResult =
  | { status: 'quote'; quote: SalaryQuote }
  | { status: 'below-floor'; note: string }
  | { status: 'error'; message: string };

interface QuoteJson {
  quote: number;
  unit: SalaryQuote['unit'];
  belowFloor: boolean;
  note: string;
}

/**
 * The figure for one salary field, computed by salary-quote.mjs — the same script the
 * agent uses — from the band THIS vacancy published (or none). The unit it is quoted in
 * follows what the field asks for, so an hourly-rate field never gets a rounded month.
 */
export class SalaryService {
  async quote(field: FieldDescriptor, band?: SalaryBand): Promise<SalaryResult> {
    const text = `${field.label} ${(field.options ?? []).map((o) => o.label).join(' ')}`;
    const args = ['--json', `--as=${periodOf(field.label)}`];
    if (band) {
      if (band.min !== undefined) args.push(`--min=${band.min}`);
      if (band.max !== undefined) args.push(`--max=${band.max}`);
      args.push(
        `--currency=${band.unit.currency}`,
        `--period=${band.unit.period}`,
        `--basis=${band.unit.basis}`,
      );
    }
    const currency = currencyOf(text);
    if (currency) args.push(`--as-currency=${currency}`);

    try {
      const { stdout } = await run('node', [SCRIPT, ...args], { env: process.env });
      const json = JSON.parse(stdout) as QuoteJson;
      return { status: 'quote', quote: { amount: json.quote, unit: json.unit, note: json.note } };
    } catch (e) {
      const err = e as { code?: number; stdout?: string; stderr?: string; message: string };
      // Exit code 3 = the quote is under the floor: do not submit, ask the user.
      if (err.code === 3 && err.stdout) {
        return { status: 'below-floor', note: (JSON.parse(err.stdout) as QuoteJson).note };
      }
      return { status: 'error', message: err.stderr?.trim() || err.message };
    }
  }
}

const periodOf = (label: string): 'hour' | 'year' | 'month' =>
  /hourly|per hour|godzin|\/h\b/i.test(label)
    ? 'hour'
    : /annual|per year|rocz|yearly/i.test(label)
      ? 'year'
      : 'month';

const currencyOf = (text: string): string | undefined =>
  /\bEUR\b|€/.test(text)
    ? 'EUR'
    : /\bUSD\b|\$/.test(text)
      ? 'USD'
      : /\bGBP\b|£/.test(text)
        ? 'GBP'
        : undefined;
