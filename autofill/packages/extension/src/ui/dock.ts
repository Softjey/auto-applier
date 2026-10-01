import { useEffect } from 'react';

export type DockSide = 'left' | 'right';

export const DOCK_WIDTH = 320;

const ATTR: Record<DockSide, string> = {
  left: 'data-applier-dock-left',
  right: 'data-applier-dock-right',
};
const PROPS = ['width', 'margin-left', 'margin-right'] as const;

type Saved = Record<(typeof PROPS)[number], [string, string]>;
let saved: Saved | null = null;

const amount = (html: HTMLElement, side: DockSide) => Number(html.getAttribute(ATTR[side]) ?? 0);

/**
 * Shrinks the page by what the sidebars on each side currently take, so a docked panel pushes the
 * page aside instead of covering it. The left and the right sidebar belong to different content
 * scripts that cannot see each other's state, so the amounts live on <html> where both can read them.
 */
function apply(html: HTMLElement) {
  const left = amount(html, 'left');
  const right = amount(html, 'right');
  if (left + right === 0) {
    if (saved) for (const p of PROPS) html.style.setProperty(p, ...saved[p]);
    saved = null;
    return;
  }
  saved ??= Object.fromEntries(
    PROPS.map((p) => [p, [html.style.getPropertyValue(p), html.style.getPropertyPriority(p)]]),
  ) as Saved;
  html.style.setProperty('width', `calc(100% - ${left + right}px)`, 'important');
  html.style.setProperty('margin-left', `${left}px`, 'important');
  html.style.setProperty('margin-right', `${right}px`, 'important');
}

/** While `active`, reserves a `width`-px column on `side` of the top-level page. */
export function useDock(side: DockSide, active: boolean, width = DOCK_WIDTH) {
  useEffect(() => {
    if (!active) return;
    const html = document.documentElement;
    html.setAttribute(ATTR[side], String(width));
    apply(html);
    return () => {
      html.removeAttribute(ATTR[side]);
      apply(html);
    };
  }, [side, active, width]);
}
