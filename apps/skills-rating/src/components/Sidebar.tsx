import { sectionAnchorId, type SectionGroup } from '../lib/sections';

interface SidebarProps {
  groups: readonly SectionGroup[];
}

export function Sidebar({ groups }: SidebarProps): React.JSX.Element {
  return (
    <nav className="sidebar" aria-label="Sections">
      <div className="sidebar__title">Sections</div>
      <ul>
        {groups.map(({ section, skills }) => {
          const unrated = skills.filter((s) => s.rating === null).length;
          return (
            <li key={section}>
              <a href={`#${sectionAnchorId(section)}`}>
                <span className="sidebar__name">{section}</span>
                <span className="sidebar__count">
                  {skills.length}
                  {unrated > 0 && <em title={`${unrated} unrated`}> +{unrated}</em>}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
