import { useState } from 'react';

import { SkillRow } from './SkillRow';
import { sectionAnchorId } from '../lib/sections';
import type { Rating, Skill } from '../lib/types';

interface SectionCardProps {
  /** Section name, or `null` if the file has no section column. */
  title: string | null;
  section: string;
  skills: Skill[];
  hiddenCount: number;
  onRate: (uid: string, rating: Rating) => void;
  onToggleSeen: (uid: string) => void;
  onRemove: (uid: string) => void;
  onAdd: (name: string, section: string) => void;
}

export function SectionCard({
  title,
  section,
  skills,
  hiddenCount,
  onRate,
  onToggleSeen,
  onRemove,
  onAdd,
}: SectionCardProps): React.JSX.Element {
  const [draft, setDraft] = useState('');

  const rated = skills.filter((s) => s.rating !== null);
  const average = rated.length > 0 ? rated.reduce((sum, s) => sum + (s.rating ?? 0), 0) / rated.length : null;

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    const name = draft.trim();
    if (name === '') return;
    onAdd(name, section);
    setDraft('');
  };

  return (
    <section className="card" id={title === null ? undefined : sectionAnchorId(title)}>
      {title !== null && (
        <header className="card__head">
          <h2>{title}</h2>
          <span className="card__meta">
            {skills.length} skills
            {average !== null && <> · average {average.toFixed(1)}</>}
            {hiddenCount > 0 && <> · {hiddenCount} hidden</>}
          </span>
        </header>
      )}

      <div className="card__rows">
        {skills.map((skill) => (
          <SkillRow
            key={skill.uid}
            skill={skill}
            onRate={(rating) => onRate(skill.uid, rating)}
            onToggleSeen={() => onToggleSeen(skill.uid)}
            onRemove={() => onRemove(skill.uid)}
          />
        ))}
      </div>

      <form className="card__add" onSubmit={submit}>
        <input
          type="text"
          value={draft}
          placeholder={title === null ? 'Add a new skill…' : `Add a skill to "${title}"…`}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" disabled={draft.trim() === ''}>
          Add
        </button>
      </form>
    </section>
  );
}
