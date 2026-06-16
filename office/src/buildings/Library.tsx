import { useMemo } from 'react';
import { BuildingFrame } from '../components/BuildingFrame';
import { useWallText } from '../hooks/useCanon';
import { Desk } from '../components/Desk';
import { PERSONAS } from '../data/personas';

interface Quote { text: string; attribution?: string }

function parseQuotes(md: string): Quote[] {
  const out: Quote[] = [];
  for (const block of md.split(/\n---+\n/g)) {
    const lines = block.split('\n').map(l => l.trimEnd());
    const ql: string[] = [];
    let attr: string | undefined;
    for (const line of lines) {
      if (!line.startsWith('> ')) continue;
      const inner = line.slice(2);
      if (/^—|^--/.test(inner.trim())) attr = inner.replace(/^—\s*|^--\s*/, '').trim();
      else ql.push(inner);
    }
    if (ql.length) {
      const text = ql.join(' ').replace(/^"+|"+$/g, '').replace(/\*+/g, '').trim();
      out.push({ text, attribution: attr });
    }
  }
  return out;
}

export function Library({ onBack }: { onBack: () => void }) {
  const md = useWallText();
  const quotes = useMemo(() => parseQuotes(md), [md]);
  const mem = PERSONAS.find(p => p.slug === 'mem')!;
  const levin = PERSONAS.find(p => p.slug === 'levin')!;

  return (
    <BuildingFrame
      route="library"
      eyebrow="canon · the archive · the territory"
      title="The Library"
      inhabitants="Mem · Levin · The Wall lives here"
      vibe="reading hall + stacks + hall of stelae"
      onBack={onBack}
    >
      <div className="lib-shell">
        <aside className="lib-stacks" aria-label="The stacks">
          <header className="lib-stacks-head">stacks</header>
          <ol className="lib-shelves">
            {[
              ['SRMW', 'Mike\'s collected writings'],
              ['Wall index', 'attributed quotes, dated'],
              ['Voice direction', 'style guide — Drew + team'],
              ['SOMA-v2.0', 'architectural'],
              ['SOMA-STATE', 'what works vs aspirational'],
              ['Audits', 'session synthesis logs'],
              ['Levin RAG', '13K+ chunks from papers/videos/blog'],
              ['Yeshie recipes', 'web automation library'],
              ['Personas', 'all 24 voices'],
            ].map(([t, s], i) => (
              <li key={i} className="lib-shelf">
                <span className="lib-shelf-spine" />
                <div>
                  <strong>{t}</strong>
                  <em>{s}</em>
                </div>
              </li>
            ))}
          </ol>
        </aside>

        <main className="lib-hall" aria-label="Hall of stelae">
          <div className="lib-hall-head">
            <span className="lib-eyebrow">hall of stelae</span>
            <h2>The Wall</h2>
            <p>Walk slowly. Each stele earned its place.</p>
          </div>
          <div className="lib-stelae">
            {quotes.map((q, i) => (
              <figure key={i} className="stele">
                <div className="stele-cap" aria-hidden />
                <blockquote>"{q.text}"</blockquote>
                {q.attribution && <figcaption>— {q.attribution}</figcaption>}
                <div className="stele-base" aria-hidden />
              </figure>
            ))}
          </div>
        </main>

        <aside className="lib-desks" aria-label="Library desks">
          <header className="lib-desks-head">desks</header>
          <Desk persona={mem} />
          <Desk persona={levin} />
        </aside>
      </div>
    </BuildingFrame>
  );
}
