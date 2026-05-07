import type { ReactNode } from 'react';
import type { Route } from '../hooks/useRoute';

interface Props {
  route: Exclude<Route, 'campus'>;
  title: string;
  eyebrow: string;
  inhabitants: string;
  vibe: string;
  onBack: () => void;
  children: ReactNode;
  className?: string;
}

export function BuildingFrame({ route, title, eyebrow, inhabitants, vibe, onBack, children, className }: Props) {
  return (
    <section className={`building building-${route} ${className || ''}`}>
      <div className="building-chrome">
        <button className="back-btn" onClick={onBack} aria-label="Back to campus">
          ← campus
        </button>
        <div className="building-meta">
          <span className="building-eyebrow">{eyebrow}</span>
          <h1 className="building-title">{title}</h1>
          <div className="building-sub">
            <span>{inhabitants}</span>
            <span className="dot">·</span>
            <span className="building-vibe">{vibe}</span>
          </div>
        </div>
      </div>
      <div className="building-body">{children}</div>
    </section>
  );
}
