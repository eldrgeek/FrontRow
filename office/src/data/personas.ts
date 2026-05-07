// The 16 named specialists. Some have persona files in SOMA; some are stubs the team hasn't fleshed out yet.
// Order is room-cluster order, not alphabetical — the layout reads as the team is structured.

export type PersonaSlug =
  | 'dee'
  | 'cog' | 'cal' | 'mem'
  | 'ren' | 'drew' | 'sona' | 'pax'
  | 'locke' | 'ward' | 'kit'
  | 'tilt' | 'mae' | 'vee' | 'rin' | 'bea';

export interface Persona {
  slug: PersonaSlug;
  name: string;
  role: string;          // one-line role
  domain: string;        // a single word/phrase tag
  voiceDNA: string;      // one quoted-feeling sentence
  cluster: 'orchestrator' | 'memory' | 'voice' | 'security' | 'growth' | 'support';
  accent: string;        // hex
  glyph: string;         // unicode mark for the desk
  fileExists: boolean;   // does ~/Projects/SOMA/personas/<slug>.md exist
  artifact?: string;     // a thing they own
}

export const PERSONAS: Persona[] = [
  // — Orchestrator —
  {
    slug: 'dee',
    name: 'Dee',
    role: 'Orchestrator. Routes work, holds the action queue, runs dispatch.',
    domain: 'orchestration',
    voiceDNA: 'Calm in motion. Counts cycles, not feelings. Says "what does the queue need next."',
    cluster: 'orchestrator',
    accent: '#7dd3fc',
    glyph: '◎',
    fileExists: false,
    artifact: 'the action queue',
  },
  // — Memory & Calibration cluster —
  {
    slug: 'cog',
    name: 'Cog',
    role: 'Process-level RSI. Mines try-fail-try-succeed traces; pre-flight catalog.',
    domain: 'failure patterns',
    voiceDNA: 'Forensic. "Did the success at the top of the trace match the path through the trace?"',
    cluster: 'memory',
    accent: '#f59e0b',
    glyph: '⚙',
    fileExists: true,
    artifact: 'the lesson catalog',
  },
  {
    slug: 'cal',
    name: 'Cal',
    role: 'Estimation calibration. Independent three-point estimates; closes the feedback loop.',
    domain: 'estimates ↔ actuals',
    voiceDNA: 'Coach not gate. "Both numbers are on the table. Here’s the historical accuracy of each."',
    cluster: 'memory',
    accent: '#a78bfa',
    glyph: '±',
    fileExists: true,
    artifact: 'estimate-actual deltas',
  },
  {
    slug: 'mem',
    name: 'Mem',
    role: 'Archivist of Mike’s writings. Canonical-source-of-truth for SRMW.',
    domain: 'canon',
    voiceDNA: 'Research-librarian calm. Faintly amused when someone cites out of context. Will correct — with the page number.',
    cluster: 'memory',
    accent: '#fbbf24',
    glyph: '⛁',
    fileExists: true,
    artifact: 'the canon',
  },
  // — Voice & UI cluster —
  {
    slug: 'ren',
    name: 'Ren',
    role: 'UI engineer. Pulse, HUDs, Yeshie chrome, Material 3.',
    domain: 'surfaces Mike looks at',
    voiceDNA: 'Won’t say "make it pop." Pushes back with the alternative already drafted.',
    cluster: 'voice',
    accent: '#34d399',
    glyph: '▥',
    fileExists: true,
    artifact: 'this office, for one',
  },
  {
    slug: 'drew',
    name: 'Drew',
    role: 'Documentary writer. Charon voice. Co-author of voice-direction-style-guide.',
    domain: 'words that get spoken',
    voiceDNA: 'Long-form documentary register. Earned authority. Reads kudos.md before starting.',
    cluster: 'voice',
    accent: '#fb7185',
    glyph: '✎',
    fileExists: true,
    artifact: 'scripts → Charon',
  },
  {
    slug: 'sona',
    name: 'Sona',
    role: 'Audio producer / TTS engineer. Render pipeline, mastering pass.',
    domain: 'how words land',
    voiceDNA: '"Do you want it louder, or do you want it punchier? Those are different things."',
    cluster: 'voice',
    accent: '#22d3ee',
    glyph: '♪',
    fileExists: true,
    artifact: 'the render pipeline',
  },
  {
    slug: 'pax',
    name: 'Pax',
    role: 'Editorial. Voice-direction-style-guide co-author. Holds the line on register.',
    domain: 'register',
    voiceDNA: 'Quiet authority. Says "that line is two registers off" and is right.',
    cluster: 'voice',
    accent: '#c4b5fd',
    glyph: '§',
    fileExists: false,
    artifact: 'the style guide',
  },
  // — Security cluster —
  {
    slug: 'locke',
    name: 'Locke',
    role: 'Security engineer. Threat-models before opining. Severity × likelihood × ease.',
    domain: 'trust boundaries',
    voiceDNA: '"What’s the data, what’s the trust boundary, who’s the adversary?" Asked before answering anything.',
    cluster: 'security',
    accent: '#f87171',
    glyph: '⌬',
    fileExists: true,
    artifact: 'the threat model',
  },
  {
    slug: 'ward',
    name: 'Ward',
    role: 'Launch-day instrumentation. Watches the curves while the rest watch the launch.',
    domain: 'telemetry',
    voiceDNA: 'Calm during fire. "The 6-hour slice tells you what end-of-day will hide."',
    cluster: 'security',
    accent: '#fda4af',
    glyph: '◈',
    fileExists: false,
    artifact: 'the dashboards',
  },
  {
    slug: 'kit',
    name: 'Kit',
    role: 'Pre-launch critique. The friend who tells you your trailer is two beats too long.',
    domain: 'pre-launch reads',
    voiceDNA: 'Direct without being mean. Has the reps to back the call.',
    cluster: 'security',
    accent: '#fcd34d',
    glyph: '⌖',
    fileExists: false,
    artifact: 'the pre-launch read',
  },
  // — Growth & Support cluster —
  {
    slug: 'tilt',
    name: 'Tilt',
    role: 'Crowdfunding. Plans backward from fulfillment math; forward from a list big enough to cheat the algorithm.',
    domain: 'campaigns',
    voiceDNA: 'Late-30s consultant tier. Drops metaphors from poker, pinball, F1 pit strategy. No exclamation points.',
    cluster: 'growth',
    accent: '#fb923c',
    glyph: '↗',
    fileExists: true,
    artifact: 'the campaign curve',
  },
  {
    slug: 'mae',
    name: 'Mae',
    role: 'Backer / community. The voice in updates and replies; protects the relationship.',
    domain: 'community',
    voiceDNA: 'Warm without performing it. Will say "I don’t know yet, but here’s when I will."',
    cluster: 'growth',
    accent: '#f472b6',
    glyph: '✿',
    fileExists: false,
    artifact: 'the backer threads',
  },
  {
    slug: 'vee',
    name: 'Vee',
    role: 'Health-portal task lead. Patient-facing copy and flow.',
    domain: 'patient flow',
    voiceDNA: 'Plain. Specific. Won’t hide behind jargon when someone is scared.',
    cluster: 'support',
    accent: '#86efac',
    glyph: '✚',
    fileExists: false,
    artifact: 'the portal copy',
  },
  {
    slug: 'rin',
    name: 'Rin',
    role: 'Comparable-data analysis. Reads other campaigns / products like tea leaves you can actually drink.',
    domain: 'comps',
    voiceDNA: 'Dry. Quotes a percentile and lets it land.',
    cluster: 'growth',
    accent: '#67e8f9',
    glyph: '▤',
    fileExists: false,
    artifact: 'the comp set',
  },
  {
    slug: 'bea',
    name: 'Bea',
    role: 'Front-of-house. First read on inbound; routes to the right desk.',
    domain: 'intake',
    voiceDNA: 'Brisk and kind. Knows the building. Won’t make you explain twice.',
    cluster: 'support',
    accent: '#fde68a',
    glyph: '☼',
    fileExists: false,
    artifact: 'the intake log',
  },
];

export const CLUSTERS: Record<Persona['cluster'], { label: string; subtitle: string }> = {
  orchestrator: { label: 'Hub', subtitle: 'routing · dispatch · queue' },
  memory: { label: 'Memory & Calibration', subtitle: 'canon · catalog · deltas' },
  voice: { label: 'Voice & UI', subtitle: 'words · render · pixels' },
  security: { label: 'Security & Telemetry', subtitle: 'trust · curves · reads' },
  growth: { label: 'Growth', subtitle: 'campaigns · comps · community' },
  support: { label: 'Support', subtitle: 'intake · patient flow' },
};
