// Where the builder reads and saves a theater.
//
// The shared store is src/theater/theaterStore.ts: Supabase venues rows, a
// version counter and a theater_changes table (migrations/003). The builder
// uses it once the theater has a stored record there. Until then (migration
// not applied, or the theater never saved) a person's own panel edits go to a
// draft in this browser only, and the page says so. Guests never read drafts,
// and an AI's proposal is never applied to one (BuilderPage holds it).

import { TheaterDefinition, TheaterRecord, validateDefinition } from '../theater/definition';
import { builtInRecord, fetchStoredTheater, listChanges as listSharedChanges, saveTheater } from '../theater/theaterStore';

export interface TheaterChange {
  version: number;
  at: string;
  /** Who applied it, in words: a person's name, or "Claude (for Mike), approved by Mike". */
  by: string;
  note: string;
}

export type SaveResult =
  | { ok: true; version: number }
  | { ok: false; conflict: true; current: TheaterRecord }
  | { ok: false; conflict?: false; error: string };

export interface TheaterStore {
  /** Words for the page: where saves go. */
  readonly label: string;
  /** True when saves reach the shared store (other builders and guests see them). */
  readonly shared: boolean;
  load(slug: string): Promise<TheaterRecord | null>;
  save(slug: string, definition: TheaterDefinition, baseVersion: number, change: { by: string; note: string }): Promise<SaveResult>;
  listChanges(slug: string): Promise<TheaterChange[]>;
}

// ---------------------------------------------------------------------------
// This-browser drafts
// ---------------------------------------------------------------------------

interface Draft {
  record: TheaterRecord;
  changes: TheaterChange[];
}

const KEY = (slug: string) => `frontrow_builder_draft_${slug}`;
const memory = new Map<string, Draft>();

function readDraft(slug: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(KEY(slug));
    if (raw) {
      const d = JSON.parse(raw) as Draft;
      if (d?.record?.definition && validateDefinition(d.record.definition).length === 0) return d;
    }
  } catch {
    /* storage blocked or corrupt: fall back to memory */
  }
  return memory.get(slug) ?? null;
}

function writeDraft(slug: string, d: Draft) {
  memory.set(slug, d);
  try {
    window.localStorage.setItem(KEY(slug), JSON.stringify(d));
  } catch {
    /* the draft lasts until reload */
  }
}

function seed(slug: string): Draft | null {
  const built = builtInRecord(slug);
  if (!built) return null;
  return { record: { ...structuredClone(built), version: 1 }, changes: [] };
}

export const browserDraftStore: TheaterStore = {
  label: 'Draft in this browser only. Guests see no change until theater records are saved to the shared store.',
  shared: false,
  async load(slug) {
    const d = readDraft(slug) ?? seed(slug);
    return d ? structuredClone(d.record) : null;
  },
  async save(slug, definition, baseVersion, change) {
    const errs = validateDefinition(definition);
    if (errs.length) return { ok: false, error: errs.join('; ') };
    const d = readDraft(slug) ?? seed(slug);
    if (!d) return { ok: false, error: `no theater "${slug}"` };
    if (d.record.version !== baseVersion) return { ok: false, conflict: true, current: structuredClone(d.record) };
    const version = baseVersion + 1;
    writeDraft(slug, {
      record: { ...d.record, version, definition: structuredClone(definition) },
      changes: [{ version, at: new Date().toISOString(), by: change.by, note: change.note }, ...d.changes].slice(0, 200),
    });
    return { ok: true, version };
  },
  async listChanges(slug) {
    return structuredClone(readDraft(slug)?.changes ?? []);
  },
};

/** Drop this browser's draft and start again from the built-in record. */
export function resetBrowserDraft(slug: string) {
  memory.delete(slug);
  try {
    window.localStorage.removeItem(KEY(slug));
  } catch {
    /* nothing stored */
  }
}

// ---------------------------------------------------------------------------
// The shared store
// ---------------------------------------------------------------------------

export const sharedStore: TheaterStore = {
  label: 'Saved to the theater’s shared record. Every change is a new version in its history.',
  shared: true,
  async load(slug) {
    return fetchStoredTheater(slug);
  },
  async save(slug, definition, baseVersion, change) {
    // The database records who was signed in; the note keeps who proposed it (an AI, say).
    const r = await saveTheater(slug, definition, baseVersion, `${change.note} (${change.by})`.slice(0, 2000));
    if ('error' in r) return { ok: false, error: r.error };
    if (!('current' in r)) return { ok: true, version: r.version };
    {
      const current = await fetchStoredTheater(slug);
      if (current) return { ok: false, conflict: true, current };
      return { ok: false, error: 'Someone else saved first, and the new version could not be read.' };
    }
  },
  async listChanges(slug) {
    const list = await listSharedChanges(slug);
    return list.map((c) => ({ version: c.version, at: c.changedAt, by: c.changedBy ?? 'someone', note: c.changeNote }));
  },
};

/** The shared store when the theater has a stored record there, else this browser's drafts. */
export async function chooseBuilderStore(slug: string): Promise<TheaterStore> {
  try {
    const stored = await Promise.race([
      fetchStoredTheater(slug),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);
    if (stored) return sharedStore;
  } catch {
    /* database unreachable: drafts */
  }
  return browserDraftStore;
}
