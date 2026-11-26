import type { SaveState } from '../hooks/useSkills';
import { RATING_VALUES } from '../lib/types';

export type SeenFilter = 'all' | 'seen' | 'unseen';
export type RatingKey = 'none' | '0' | '1' | '2' | '3' | '4' | '5';
export type SortMode = 'file' | 'unrated' | 'name' | 'rating';

export interface Filters {
  query: string;
  ratings: ReadonlySet<RatingKey>;
  seen: SeenFilter;
  sort: SortMode;
}

export interface Stats {
  total: number;
  rated: number;
  average: number | null;
  byRating: Record<RatingKey, number>;
}

interface ToolbarProps {
  filters: Filters;
  stats: Stats;
  visible: number;
  saveState: SaveState;
  csvPath: string | null;
  onChange: (filters: Filters) => void;
  onReload: () => void;
}

const SEEN_OPTIONS: readonly { key: SeenFilter; label: string }[] = [
  { key: 'all', label: 'all' },
  { key: 'seen', label: 'seen' },
  { key: 'unseen', label: 'not seen' },
];

const SORT_OPTIONS: readonly { key: SortMode; label: string }[] = [
  { key: 'file', label: 'file order' },
  { key: 'unrated', label: 'unrated first' },
  { key: 'name', label: 'by name' },
  { key: 'rating', label: 'by rating' },
];

function SaveIndicator({ state, onReload }: { state: SaveState; onReload: () => void }): React.JSX.Element {
  switch (state.status) {
    case 'saving':
      return <span className="save save--busy">Saving…</span>;
    case 'saved':
      return <span className="save save--ok">✓ Saved to skills.csv</span>;
    case 'error':
      return (
        <span className="save save--error">
          {state.message}
          {state.conflict && (
            <button type="button" className="chip" onClick={onReload}>
              Reload file
            </button>
          )}
        </span>
      );
    default:
      return <span className="save">Changes are saved to skills.csv automatically</span>;
  }
}

export function Toolbar({
  filters,
  stats,
  visible,
  saveState,
  csvPath,
  onChange,
  onReload,
}: ToolbarProps): React.JSX.Element {
  const toggleRating = (key: RatingKey): void => {
    const next = new Set(filters.ratings);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange({ ...filters, ratings: next });
  };

  const progress = stats.total > 0 ? (stats.rated / stats.total) * 100 : 0;
  const filtersActive = filters.query !== '' || filters.ratings.size > 0 || filters.seen !== 'all';

  return (
    <header className="toolbar">
      <div className="toolbar__top">
        <div>
          <h1>My skills</h1>
          <p className="toolbar__hint">
            Click the stars to rate. On a row, <kbd>0</kbd>–<kbd>5</kbd> rate, <kbd>S</kbd> toggles “seen”, <kbd>Backspace</kbd> clears
            the rating, <kbd>↑</kbd>/<kbd>↓</kbd> move to the next skill.
            {csvPath !== null && <span className="toolbar__path"> · {csvPath}</span>}
          </p>
        </div>
        <SaveIndicator state={saveState} onReload={onReload} />
      </div>

      <div className="toolbar__stats">
        <div className="progress">
          <div className="progress__bar" style={{ width: `${progress}%` }} />
        </div>
        <span>
          Rated <strong>{stats.rated}</strong> of <strong>{stats.total}</strong>
          {stats.byRating.none > 0 && <> · unrated {stats.byRating.none}</>}
          {stats.average !== null && (
            <>
              {' '}
              · average <strong>{stats.average.toFixed(2)}</strong>
            </>
          )}
          {visible !== stats.total && <> · showing {visible}</>}
        </span>
      </div>

      <div className="toolbar__controls">
        <input
          type="search"
          className="search"
          placeholder="Search skills…"
          value={filters.query}
          onChange={(event) => onChange({ ...filters, query: event.target.value })}
        />

        <label className="sort">
          Sort
          <select
            value={filters.sort}
            onChange={(event) => onChange({ ...filters, sort: event.target.value as SortMode })}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="chips" role="group" aria-label="Filter by rating">
          <button
            type="button"
            className={`chip ${filters.ratings.has('none') ? 'is-on' : ''}`}
            onClick={() => toggleRating('none')}
          >
            unrated <span className="chip__count">{stats.byRating.none}</span>
          </button>
          {RATING_VALUES.map((value) => {
            const key = String(value) as RatingKey;
            return (
              <button
                key={key}
                type="button"
                className={`chip ${filters.ratings.has(key) ? 'is-on' : ''}`}
                onClick={() => toggleRating(key)}
              >
                {value} <span className="chip__count">{stats.byRating[key]}</span>
              </button>
            );
          })}
        </div>

        <div className="chips" role="group" aria-label="Filter by seen">
          {SEEN_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`chip ${filters.seen === option.key ? 'is-on' : ''}`}
              onClick={() => onChange({ ...filters, seen: option.key })}
            >
              {option.label}
            </button>
          ))}
        </div>

        {filtersActive && (
          <button
            type="button"
            className="chip chip--reset"
            onClick={() => onChange({ ...filters, query: '', ratings: new Set(), seen: 'all' })}
          >
            Reset filters
          </button>
        )}
      </div>
    </header>
  );
}
