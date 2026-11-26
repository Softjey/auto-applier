import { useMemo, useState } from 'react';

import { SectionCard } from './components/SectionCard';
import { Sidebar } from './components/Sidebar';
import { Toolbar, type Filters, type RatingKey, type SortMode, type Stats } from './components/Toolbar';
import { useSkills } from './hooks/useSkills';
import { groupBySection } from './lib/sections';
import type { Skill } from './lib/types';

const EMPTY_BY_RATING: Stats['byRating'] = { none: 0, '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };

const ratingKey = (skill: Skill): RatingKey =>
  skill.rating === null ? 'none' : (String(skill.rating) as RatingKey);

function computeStats(skills: readonly Skill[]): Stats {
  const byRating = { ...EMPTY_BY_RATING };
  let sum = 0;
  let rated = 0;
  for (const skill of skills) {
    byRating[ratingKey(skill)] += 1;
    if (skill.rating !== null) {
      rated += 1;
      sum += skill.rating;
    }
  }
  return { total: skills.length, rated, average: rated > 0 ? sum / rated : null, byRating };
}

function matches(skill: Skill, filters: Filters): boolean {
  const query = filters.query.trim().toLowerCase();
  if (query !== '' && !skill.name.toLowerCase().includes(query) && !skill.section.toLowerCase().includes(query)) {
    return false;
  }
  if (filters.ratings.size > 0 && !filters.ratings.has(ratingKey(skill))) return false;
  if (filters.seen === 'seen' && !skill.seen) return false;
  if (filters.seen === 'unseen' && skill.seen) return false;
  return true;
}

/** Sorting is visual only — the row order in the CSV never changes. */
function sortSkills(skills: Skill[], mode: SortMode): Skill[] {
  if (mode === 'file') return skills;
  const sorted = [...skills];
  switch (mode) {
    case 'unrated':
      return sorted.sort((a, b) => Number(a.rating !== null) - Number(b.rating !== null));
    case 'name':
      return sorted.sort((a, b) => a.name.localeCompare(b.name, 'uk'));
    case 'rating':
      return sorted.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
    default:
      return sorted;
  }
}

export default function App(): React.JSX.Element {
  const { skills, csvPath, loadError, saveState, updateSkill, addSkill, removeSkill, reload } = useSkills();
  const [filters, setFilters] = useState<Filters>({
    query: '',
    ratings: new Set(),
    seen: 'all',
    sort: 'file',
  });

  const hasSections = useMemo(() => (skills ?? []).some((skill) => skill.section !== ''), [skills]);
  const allGroups = useMemo(
    () => (hasSections ? groupBySection(skills ?? []) : [{ section: '', skills: skills ?? [] }]),
    [skills, hasSections],
  );
  const stats = useMemo(() => computeStats(skills ?? []), [skills]);

  const visibleGroups = useMemo(
    () =>
      allGroups.map((group) => {
        const visible = group.skills.filter((skill) => matches(skill, filters));
        return {
          section: group.section,
          skills: group.skills,
          visible: sortSkills(visible, filters.sort),
          hiddenCount: group.skills.length - visible.length,
        };
      }),
    [allGroups, filters],
  );

  const visibleCount = visibleGroups.reduce((sum, group) => sum + group.visible.length, 0);

  const toggleSeen = (uid: string): void => {
    const target = skills?.find((s) => s.uid === uid);
    if (target !== undefined) updateSkill(uid, { seen: !target.seen });
  };

  if (loadError !== null) {
    return (
      <div className="state state--error">
        <h1>Could not read skills.csv</h1>
        <p>{loadError}</p>
        <button type="button" className="chip" onClick={reload}>
          Try again
        </button>
      </div>
    );
  }

  if (skills === null) return <div className="state">Loading skills.csv…</div>;

  return (
    <div className={`layout ${hasSections ? '' : 'layout--flat'}`}>
      {hasSections && <Sidebar groups={allGroups} />}

      <main className="content">
        <Toolbar
          filters={filters}
          stats={stats}
          visible={visibleCount}
          saveState={saveState}
          csvPath={csvPath}
          onChange={setFilters}
          onReload={reload}
        />

        {visibleCount === 0 ? (
          <div className="state state--empty">Nothing matches the current filters.</div>
        ) : (
          visibleGroups
            .filter((group) => group.visible.length > 0)
            .map((group) => (
              <SectionCard
                key={group.section}
                title={hasSections ? group.section : null}
                section={group.section}
                skills={group.visible}
                hiddenCount={group.hiddenCount}
                onRate={(uid, rating) => updateSkill(uid, { rating })}
                onToggleSeen={toggleSeen}
                onRemove={removeSkill}
                onAdd={addSkill}
              />
            ))
        )}
      </main>
    </div>
  );
}
