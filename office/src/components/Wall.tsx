import { useMemo } from 'react';
import { useWallText } from '../hooks/useCanon';

interface Entry {
  kind: 'quote' | 'prose' | 'heading' | 'rule';
  lines: string[];
  attribution?: string;
}

function parseWall(md: string): Entry[] {
  const sections = md.split(/\n---+\n/g);
  const out: Entry[] = [];
  for (const raw of sections) {
    const block = raw.trim();
    if (!block) continue;
    const lines = block.split('\n').map(l => l.trimEnd());
    if (lines[0]?.startsWith('# ')) {
      out.push({ kind: 'heading', lines: [lines[0].slice(2)] });
      const rest = lines.slice(1).join('\n').trim();
      if (rest) out.push({ kind: 'prose', lines: rest.split('\n') });
      continue;
    }
    const quoteLines: string[] = [];
    const proseLines: string[] = [];
    let attribution: string | undefined;
    for (const line of lines) {
      if (line.startsWith('> ')) {
        const inner = line.slice(2);
        // attribution lines start with — or --
        if (/^—|^--/.test(inner.trim())) {
          attribution = inner.replace(/^—\s*|^--\s*/, '').trim();
        } else {
          quoteLines.push(inner);
        }
      } else if (line.trim()) {
        proseLines.push(line);
      }
    }
    if (quoteLines.length) {
      out.push({ kind: 'quote', lines: quoteLines, attribution });
    } else if (proseLines.length) {
      out.push({ kind: 'prose', lines: proseLines });
    }
  }
  return out;
}

export function Wall() {
  const md = useWallText();
  const entries = useMemo(() => parseWall(md), [md]);

  return (
    <section id="wall" className="wall">
      <header className="wall-header">
        <div className="wall-eyebrow">canon · scrollable · sacred</div>
        <h1 className="wall-title">The Wall</h1>
        <p className="wall-sub">
          Quotes that earned their way here. The map, not the territory.
        </p>
      </header>
      <div className="wall-scroll" role="region" aria-label="The Wall">
        {entries.map((e, i) => {
          if (e.kind === 'heading') {
            return null; // title is in the header
          }
          if (e.kind === 'prose') {
            return (
              <p className="wall-prose" key={i}>
                {e.lines.join(' ').replace(/\*+/g, '')}
              </p>
            );
          }
          if (e.kind === 'quote') {
            const quote = e.lines.join(' ').replace(/^"+|"+$/g, '').replace(/\*+/g, '').trim();
            return (
              <figure className="wall-quote" key={i}>
                <blockquote>
                  <span className="wall-mark" aria-hidden>“</span>
                  <span className="wall-quote-text">{quote}</span>
                </blockquote>
                {e.attribution && (
                  <figcaption>— {e.attribution}</figcaption>
                )}
              </figure>
            );
          }
          return null;
        })}
        <div className="wall-end">∎</div>
      </div>
    </section>
  );
}
