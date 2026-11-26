import { useCallback } from 'react';

import { RatingControl } from './RatingControl';
import { isRating, type Rating, type Skill } from '../lib/types';

interface SkillRowProps {
  skill: Skill;
  onRate: (rating: Rating) => void;
  onToggleSeen: () => void;
  onRemove: () => void;
}

/** Moves focus to the neighboring row — arrow-key navigation without a mouse. */
function focusSibling(current: HTMLElement, direction: 1 | -1): void {
  const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-skill-row]'));
  const index = rows.indexOf(current);
  const next = rows[index + direction];
  next?.focus();
}

export function SkillRow({ skill, onRate, onToggleSeen, onRemove }: SkillRowProps): React.JSX.Element {
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const digit = Number(event.key);
      if (event.key.length === 1 && isRating(digit)) {
        event.preventDefault();
        onRate(digit);
        return;
      }
      switch (event.key) {
        case 'Backspace':
        case 'Delete':
          event.preventDefault();
          onRate(null);
          break;
        case 's':
        case 'S':
        case 'ы':
        case 'і':
          event.preventDefault();
          onToggleSeen();
          break;
        case 'ArrowDown':
          event.preventDefault();
          focusSibling(event.currentTarget, 1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          focusSibling(event.currentTarget, -1);
          break;
        default:
          break;
      }
    },
    [onRate, onToggleSeen],
  );

  return (
    <div
      className={`skill ${skill.rating === null ? 'is-unrated' : ''}`}
      data-skill-row
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className="skill__label">
        <span className="skill__name">{skill.name}</span>
        <button
          type="button"
          className={`chip chip--seen ${skill.seen ? 'is-on' : ''}`}
          onClick={onToggleSeen}
          aria-pressed={skill.seen}
          title="Already seen this skill in job postings (key S)"
        >
          seen
        </button>
      </div>

      <div className="skill__actions">
        <RatingControl value={skill.rating} onChange={onRate} />
        <button
          type="button"
          className="skill__remove"
          onClick={() => {
            if (window.confirm(`Delete "${skill.name}" from skills.csv?`)) onRemove();
          }}
          title="Delete skill"
          aria-label={`Delete ${skill.name}`}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
