#!/usr/bin/env node
// scripts/ticket-mail-worker.mjs: the Mac side of the Front Row box office
// (theater kit gap 3, 2026-11-05). Same shape as soma-zoom-presence's
// bin/offer-worker.js: the mail credential lives on Mike's Mac and nowhere
// else, so the Netlify box office queues letters and this worker sends them.
//
// It polls OUT to <site>/api/mail-work with its own token every 30 s, takes
// queued letters, opens each sealed ticket code with this Mac's private key,
// writes the letter itself from the fixed template in server/box-office.mjs,
// and sends it with ~/Projects/SOMA/tools/mail/send_from_claude.py as seat
// mail-courier, one message per recipient.
//
// It trusts the server for nothing it can check:
//   - There is one recipe: a ticket letter. The server sends fields (names,
//     titles, a time zone, times), never a subject or a body.
//   - Every field is re-checked here. The link's site must be on THIS Mac's
//     list (config.origins). Agent-read inboxes are refused.
//   - The ticket code must open with this Mac's key, bound to the letter id
//     and the address; a code sealed for one guest will not open for another.
//   - At most config.maxPerHour letters an hour (default 60), counted from the
//     sent log, so a restart does not reset it.
//   - It sends NOTHING until someone on this Mac runs `arm`. Unarmed, it only
//     checks in, so the box office shows "Mike's Mac is connected, mail is off".
//
//   node scripts/ticket-mail-worker.mjs keys      # make this Mac's key pair + token (once)
//   node scripts/ticket-mail-worker.mjs status    # what is set, armed or not, last sends
//   node scripts/ticket-mail-worker.mjs arm       # start sending (Mike's yes)
//   node scripts/ticket-mail-worker.mjs disarm    # stop sending
//   node scripts/ticket-mail-worker.mjs           # run (launchd plist: ops/launchd/, NOT installed)
//   node scripts/ticket-mail-worker.mjs once      # one poll, then exit
//
// Env: FRONTROW_SITE (default https://frontrowtheater.netlify.app),
// TICKET_MAIL_ENV_FILE (default .env.ticket-mail in the repo root: gitignored,
// mode 600, holds FRONTROW_MAIL_WORKER_TOKEN, FRONTROW_MAIL_PUBKEY,
// FRONTROW_MAIL_PRIVKEY), TICKET_MAIL_STATE_DIR (default state/ticket-mail),
// TICKET_MAIL_CMD (tests: replaces the python mail command),
// TICKET_MAIL_DRY_RUN=1 (log, send nothing, report "not sent").

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  composeLetter, unsealCode, generateMailKeys, cleanLine, isTimeZone, EMAIL_RE, NEVER_SEND, FROM_DISPLAY,
} from '../server/box-office.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = (process.env.FRONTROW_SITE || 'https://frontrowtheater.netlify.app').replace(/\/$/, '');
const ENV_FILE = process.env.TICKET_MAIL_ENV_FILE || path.join(ROOT, '.env.ticket-mail');
const STATE_DIR = process.env.TICKET_MAIL_STATE_DIR || path.join(ROOT, 'state', 'ticket-mail');
const CONFIG = path.join(STATE_DIR, 'config.json');
const SENT_LOG = path.join(STATE_DIR, 'sent.jsonl');
const HEARTBEAT = path.join(STATE_DIR, 'heartbeat.json');
const MAIL_SCRIPT = path.join(os.homedir(), 'Projects', 'SOMA', 'tools', 'mail', 'send_from_claude.py');
const PYTHON = '/opt/homebrew/bin/python3';
const POLL_MS = 30e3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = new Set(['audience', 'performer', 'crew', 'manager']);

const log = (...a) => console.log(new Date().toISOString(), '[ticket-mail]', ...a);

// ---------- config and secrets ----------
export function loadConfig() {
  let c = {};
  try { c = JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch { /* defaults */ }
  const origins = (Array.isArray(c.origins) ? c.origins : [SITE]).map((o) => String(o).replace(/\/$/, ''));
  return { armed: c.armed === true, origins, maxPerHour: Number.isInteger(c.maxPerHour) ? c.maxPerHour : 60 };
}
function saveConfig(c) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(CONFIG, JSON.stringify(c, null, 2) + '\n', { mode: 0o600 });
}

export function loadSecrets() {
  const out = {};
  try {
    const mode = fs.statSync(ENV_FILE).mode & 0o777;
    if (mode & 0o077) log(`${ENV_FILE} can be read by other users (mode ${mode.toString(8)}); run chmod 600 on it`);
    for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
      const m = /^(FRONTROW_MAIL_[A-Z_]+)=(.*)$/.exec(line.trim());
      if (m) out[m[1]] = m[2].trim();
    }
  } catch { /* none yet */ }
  return { token: out.FRONTROW_MAIL_WORKER_TOKEN || '', pub: out.FRONTROW_MAIL_PUBKEY || '', priv: out.FRONTROW_MAIL_PRIVKEY || '' };
}

// ---------- the checks (exported for the selftest) ----------
export function sentInLastHour(nowMs = Date.now()) {
  let n = 0;
  try {
    for (const line of fs.readFileSync(SENT_LOG, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { const r = JSON.parse(line); if (r.ok && nowMs - Date.parse(r.ts) < 3600e3) n += 1; } catch { /* skip */ }
    }
  } catch { /* no log yet */ }
  return n;
}

/** -> {ok:true, to, subject, body} or {ok:false, error}. Never logs the code. */
export function checkJob(job, cfg, secrets, nowMs = Date.now()) {
  if (!job || typeof job !== 'object') return { ok: false, error: 'not a letter' };
  if (!UUID.test(String(job.id || ''))) return { ok: false, error: 'bad letter id' };
  const to = String(job.email || '');
  if (!EMAIL_RE.test(to) || to.length > 120) return { ok: false, error: 'bad address' };
  if (NEVER_SEND.has(to)) return { ok: false, error: `${to} is an inbox an automated agent reads; never mailed` };
  const name = job.name == null ? null : String(job.name);
  if (name !== null && (cleanLine(name, 80) !== name || !name)) return { ok: false, error: 'bad name' };
  const p = job.payload || {};
  for (const k of ['theater', 'show']) {
    if (typeof p[k] !== 'string' || !p[k] || cleanLine(p[k], 80) !== p[k]) return { ok: false, error: `bad ${k}` };
  }
  if (!isTimeZone(p.tz)) return { ok: false, error: 'bad time zone' };
  if (!cfg.origins.includes(p.origin)) return { ok: false, error: `site ${p.origin} is not on this Mac's list` };
  const from = Date.parse(p.validFrom);
  const until = Date.parse(p.validUntil);
  if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from) return { ok: false, error: 'bad ticket window' };
  if (until <= nowMs) return { ok: false, error: 'the ticket window has closed' };
  if (!Number.isInteger(p.maxDevices) || p.maxDevices < 1 || p.maxDevices > 1000) return { ok: false, error: 'bad device count' };
  if (!ROLES.has(p.role)) return { ok: false, error: 'bad role' };
  if (p.seat !== null && p.seat !== undefined && !/^seat-\d{1,2}$/.test(p.seat)) return { ok: false, error: 'bad seat' };
  if (!secrets.pub || !secrets.priv) return { ok: false, error: 'this Mac has no ticket mail key (run: keys)' };
  const code = unsealCode(job.sealed, secrets.pub, secrets.priv, job.id, to);
  if (!code) return { ok: false, error: 'the ticket code did not open with this Mac\'s key for this guest' };
  if (sentInLastHour(nowMs) + 1 > cfg.maxPerHour) return { ok: false, error: `more than ${cfg.maxPerHour} letters this hour; not sent`, later: true };
  const letter = composeLetter(p, name, code);
  if (/[\u0000-\u001f\u007f\u0085\u2028\u2029]/.test(letter.subject) || letter.subject.length > 200) return { ok: false, error: 'bad subject' };
  return { ok: true, to, subject: letter.subject, body: letter.body };
}

export function sendOne(to, subject, body) {
  if (process.env.TICKET_MAIL_DRY_RUN === '1') {
    log(`DRY RUN: would send "${subject}" to ${to}`);
    return Promise.resolve({ ok: false, error: 'dry run on Mike\'s Mac; not sent' });
  }
  if (!process.env.TICKET_MAIL_CMD && !fs.existsSync(PYTHON)) return Promise.resolve({ ok: false, error: `${PYTHON} is missing on this Mac` });
  return new Promise((resolve) => {
    const tmp = path.join(os.tmpdir(), `ticket-mail-${process.pid}-${crypto.randomBytes(6).toString('hex')}.txt`);
    fs.writeFileSync(tmp, body, { mode: 0o600 });
    const cmd = process.env.TICKET_MAIL_CMD ? process.env.TICKET_MAIL_CMD.split(' ') : [PYTHON, MAIL_SCRIPT];
    // One argv element per flag=value, so no value can be read as a flag.
    const args = cmd.slice(1).concat([`--to=${to}`, `--subject=${subject}`, `--body-file=${tmp}`, `--from-display=${FROM_DISPLAY}`]);
    // mail-courier is the one seat allowed to mail people outside the estate.
    const child = spawn(cmd[0], args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ESTATE_SEAT: 'mail-courier' } });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, 60e3);
    // The body holds the ticket link: the temp file goes as soon as the send ends.
    const done = (ok, error) => { clearTimeout(timer); try { fs.unlinkSync(tmp); } catch { /* gone */ } resolve({ ok, error }); };
    child.on('error', (e) => done(false, e.message));
    child.on('close', (code) => done(code === 0, code === 0 ? '' : (out.trim().split('\n').pop() || `exit ${code}`).slice(0, 200)));
  });
}

// ---------- talking to the box office ----------
async function api(method, q, body, token) {
  const url = `${SITE}/api/mail-work${q ? `?${new URLSearchParams(q)}` : ''}`;
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20e3),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${j.error || ''}`.trim());
  return j;
}

export async function pollOnce() {
  const cfg = loadConfig();
  const secrets = loadSecrets();
  if (!secrets.token) { log(`no worker token in ${ENV_FILE} (run: keys)`); return { checkedIn: false }; }
  const host = os.hostname().replace(/\.local$/, '');
  const { jobs } = await api('GET', { armed: cfg.armed ? '1' : '0', limit: '5', host }, null, secrets.token);
  beat({ connected: true, armed: cfg.armed });
  let sent = 0;
  for (const job of jobs || []) {
    const chk = checkJob(job, cfg, secrets);
    let r;
    if (!chk.ok) {
      log(`REFUSED ${job && job.id}: ${chk.error}`);
      r = { ok: false, error: chk.error };
    } else {
      r = await sendOne(chk.to, chk.subject, chk.body);
      fs.mkdirSync(STATE_DIR, { recursive: true });
      fs.appendFileSync(SENT_LOG, JSON.stringify({ ts: new Date().toISOString(), id: job.id, to: chk.to, ok: r.ok, error: r.error || undefined }) + '\n', { mode: 0o600 });
      if (r.ok) sent += 1;
    }
    await api('POST', null, { id: job.id, ok: r.ok, error: r.error || '' }, secrets.token)
      .catch((e) => log(`could not report ${job.id}: ${e.message}`));
  }
  if (jobs && jobs.length) log(`${sent} of ${jobs.length} letters sent`);
  return { checkedIn: true, jobs: (jobs || []).length, sent };
}

function beat(extra) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(HEARTBEAT, JSON.stringify({ ts: new Date().toISOString(), site: SITE, pid: process.pid, ...extra }) + '\n');
  } catch { /* best effort */ }
}

async function run() {
  log(`polling ${SITE}/api/mail-work every ${POLL_MS / 1000}s; mail is ${loadConfig().armed ? 'ON' : 'OFF (run: arm)'}`);
  for (;;) {
    try { await pollOnce(); } catch (e) { beat({ connected: false, error: e.message }); log('poll failed:', e.message); }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

// ---------- CLI ----------
function cli(argv) {
  const [cmd] = argv;
  if (cmd === 'keys') {
    const have = loadSecrets();
    if (have.priv) {
      console.log(`${ENV_FILE} already holds a key. Its public half (set as FRONTROW_MAIL_PUBKEY on Netlify):\n${have.pub}`);
      return 0;
    }
    const k = generateMailKeys();
    const token = crypto.randomBytes(32).toString('hex');
    writeSecretFile(ENV_FILE, `FRONTROW_MAIL_WORKER_TOKEN=${token}\nFRONTROW_MAIL_PUBKEY=${k.publicKey}\nFRONTROW_MAIL_PRIVKEY=${k.privateKey}\n`);
    console.log(`Wrote ${ENV_FILE} (mode 600).`);
    console.log('Set these two on the Netlify site (Site settings > Environment variables); the private key never leaves this Mac:');
    console.log(`  FRONTROW_MAIL_PUBKEY=${k.publicKey}`);
    console.log(`  FRONTROW_MAIL_WORKER_TOKEN=<the value in ${path.basename(ENV_FILE)}>`);
    return 0;
  }
  if (cmd === 'arm' || cmd === 'disarm') {
    const c = loadConfig();
    c.armed = cmd === 'arm';
    saveConfig(c);
    console.log(`Ticket mail is now ${c.armed ? 'ON: queued letters will be sent' : 'OFF: letters wait in the queue'}.`);
    return 0;
  }
  if (cmd === 'status') {
    const s = loadSecrets();
    let hb = null;
    try { hb = JSON.parse(fs.readFileSync(HEARTBEAT, 'utf8')); } catch { /* none */ }
    console.log(JSON.stringify({
      site: SITE, config: loadConfig(), keyFile: ENV_FILE, hasToken: !!s.token, hasKey: !!s.priv,
      publicKey: s.pub || null, sentLastHour: sentInLastHour(), heartbeat: hb,
    }, null, 2));
    return 0;
  }
  return null;
}

// 'wx': never overwrite a key that is already there.
function writeSecretFile(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fd = fs.openSync(file, 'wx', 0o600);
  fs.writeSync(fd, text);
  fs.closeSync(fd);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const code = cli(process.argv.slice(2));
  if (code !== null) process.exit(code);
  else if (process.argv[2] === 'once') pollOnce().then((r) => { console.log(JSON.stringify(r)); process.exit(0); }, (e) => { log(e.message); process.exit(1); });
  else run();
}
