#!/usr/bin/env node
// Pulls SOMA canon (the Wall + persona files) into public/canon at build time.
// Idempotent. Silent on missing source — the office still renders.
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const SOMA = process.env.SOMA_DIR || resolve(process.env.HOME || '', 'Projects/SOMA');

const outCanon = resolve(root, 'public/canon');
const outPersonas = resolve(outCanon, 'personas');
mkdirSync(outPersonas, { recursive: true });

const wallSrc = join(SOMA, 'wall.md');
const wallDst = join(outCanon, 'wall.md');
let wallSize = 0;
if (existsSync(wallSrc)) {
  copyFileSync(wallSrc, wallDst);
  wallSize = statSync(wallSrc).size;
} else {
  writeFileSync(wallDst, '# The Wall\n\n*Source not found at ' + wallSrc + ' — populate ~/Projects/SOMA/wall.md*\n');
}

const personasSrc = join(SOMA, 'personas');
const personaIndex = [];
if (existsSync(personasSrc)) {
  for (const entry of readdirSync(personasSrc)) {
    if (!entry.endsWith('.md')) continue;
    const src = join(personasSrc, entry);
    const dst = join(outPersonas, entry);
    copyFileSync(src, dst);
    const slug = entry.replace(/\.md$/, '').toLowerCase();
    personaIndex.push({ slug, file: 'personas/' + entry, bytes: statSync(src).size });
  }
}

writeFileSync(
  join(outCanon, 'manifest.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      wall: { exists: existsSync(wallSrc), bytes: wallSize },
      personas: personaIndex.sort((a, b) => a.slug.localeCompare(b.slug)),
    },
    null,
    2,
  ),
);

console.log(
  `[sync-canon] wall=${wallSize}B personas=${personaIndex.length} from ${SOMA}`,
);
