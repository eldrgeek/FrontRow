import { useEffect, useState } from 'react';

interface PersonaIndex { slug: string; file: string; bytes: number }
interface Manifest {
  generatedAt: string;
  wall: { exists: boolean; bytes: number };
  personas: PersonaIndex[];
}

export function useManifest() {
  const [m, setM] = useState<Manifest | null>(null);
  useEffect(() => {
    fetch('/canon/manifest.json')
      .then(r => r.json())
      .then(setM)
      .catch(() => setM({ generatedAt: '', wall: { exists: false, bytes: 0 }, personas: [] }));
  }, []);
  return m;
}

export function useWallText() {
  const [t, setT] = useState<string>('');
  useEffect(() => {
    fetch('/canon/wall.md')
      .then(r => r.text())
      .then(setT)
      .catch(() => setT('# The Wall\n\n*Canon file not synced. Run `npm run sync-canon`.*'));
  }, []);
  return t;
}

export function usePersonaText(slug: string, exists: boolean) {
  const [t, setT] = useState<string | null>(null);
  useEffect(() => {
    if (!exists) { setT(null); return; }
    fetch(`/canon/personas/${slug}.md`).then(r => r.ok ? r.text() : '').then(setT).catch(() => setT(null));
  }, [slug, exists]);
  return t;
}
