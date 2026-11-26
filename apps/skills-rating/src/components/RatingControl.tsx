import { useState } from 'react';

import { RATING_VALUES, type Rating } from '../lib/types';

interface RatingControlProps {
  value: Rating;
  onChange: (rating: Rating) => void;
}

const STARS = RATING_VALUES.filter((v) => v > 0);

export function RatingControl({ value, onChange }: RatingControlProps): React.JSX.Element {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value;

  return (
    <div className="rating" onMouseLeave={() => setHover(null)}>
      <button
        type="button"
        className={`rating__zero ${value === 0 ? 'is-active' : ''}`}
        onClick={() => onChange(value === 0 ? null : 0)}
        onMouseEnter={() => setHover(0)}
        aria-pressed={value === 0}
        title="Zero — do not know it at all"
      >
        0
      </button>

      <div className="rating__stars" role="group" aria-label="Rating from 1 to 5">
        {STARS.map((star) => (
          <button
            key={star}
            type="button"
            className={`rating__star ${shown !== null && shown >= star ? 'is-on' : ''} ${
              hover !== null ? 'is-preview' : ''
            }`}
            onClick={() => onChange(value === star ? null : star)}
            onMouseEnter={() => setHover(star)}
            aria-label={`${star} of 5`}
            aria-pressed={value === star}
          >
            ★
          </button>
        ))}
      </div>

      <span className={`rating__value ${value === null ? 'is-empty' : ''}`}>
        {value === null ? '—' : `${value}/5`}
      </span>
    </div>
  );
}
