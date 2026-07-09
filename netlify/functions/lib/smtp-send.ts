// Minimal dependency-free SMTP client — STARTTLS + AUTH LOGIN + single
// plain-text message send. Built instead of pulling in nodemailer so this
// function has no extra runtime dependency. Ported verbatim (logic-for-logic)
// from the canonical soma-feedback reference backend
// (`eric-talk/netlify/functions/lib/smtp-send.js`) — TS types added only,
// no behavior change. Keep any real fix upstream in the canonical copy too.
//
// Verified against smtp.gmail.com:587 (Gmail app-password auth) — the same
// transport claude-email-daemon uses server-side
// (second-brain/Resources/email-config.md). Only ever called from Netlify
// Function (server) context — credentials never reach the browser.

import * as tls from 'node:tls';
import * as net from 'node:net';
import type { Socket } from 'node:net';
import type { TLSSocket } from 'node:tls';

function b64(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64');
}

interface SmtpResponse {
  code: number;
  text: string;
}

// Reads one or more CRLF-terminated SMTP response lines (multi-line replies
// use "250-" continuation, final line uses "250 "). Resolves once a final
// line for the expected code family is seen.
function readResponse(socket: Socket | TLSSocket): Promise<SmtpResponse> {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      const lines = buf.split('\r\n').filter(Boolean);
      const last = lines[lines.length - 1];
      // Final line format: "NNN <text>" (space, not dash) or exactly one line.
      if (last && /^\d{3} /.test(last)) {
        cleanup();
        resolve({ code: parseInt(last.slice(0, 3), 10), text: buf });
      }
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    function cleanup() {
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
    }
    socket.on('data', onData);
    socket.on('error', onError);
  });
}

function writeLine(socket: Socket | TLSSocket, line: string) {
  socket.write(line + '\r\n');
}

export interface SendMailAttachment {
  filename: string;
  /** Raw attachment bytes. */
  content: Buffer;
  /** MIME type, e.g. 'application/pdf'. */
  contentType: string;
}

export interface SendMailArgs {
  host: string;
  port?: number;
  user: string;
  pass: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  /** Optional file attachments (added 2026-07-07 for the print-export
   *  "email as locked PDF" feature). When present, the message is sent as
   *  multipart/mixed with a text/plain first part + one part per
   *  attachment, base64-encoded. Absent -> exact prior plain-text-only
   *  behavior (feedback.ts / notify-build-queue.ts callers unaffected). */
  attachments?: SendMailAttachment[];
  /** Display name for the From header. Defaults to 'SOMA Feedback' to
   *  match every existing caller's prior hardcoded behavior exactly. */
  fromName?: string;
}

/**
 * sendMail({ host, port, user, pass, from, to, subject, text }) -> Promise<void>
 * STARTTLS flow (port 587). Throws on any non-2xx/3xx SMTP response.
 */
export async function sendMail({
  host,
  port = 587,
  user,
  pass,
  from,
  to,
  subject,
  text,
  attachments,
  fromName = 'SOMA Feedback',
}: SendMailArgs): Promise<void> {
  const socket = net.connect(port, host);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('error', reject);
  });

  let resp = await readResponse(socket); // 220 greeting
  assertCode(resp, 220, 'greeting');

  writeLine(socket, `EHLO soma-feedback`);
  resp = await readResponse(socket);
  assertCode(resp, 250, 'EHLO');

  writeLine(socket, 'STARTTLS');
  resp = await readResponse(socket);
  assertCode(resp, 220, 'STARTTLS');

  const secureSocket = await new Promise<TLSSocket>((resolve, reject) => {
    const s = tls.connect({ socket, servername: host }, () => resolve(s));
    s.once('error', reject);
  });

  writeLine(secureSocket, `EHLO soma-feedback`);
  resp = await readResponse(secureSocket);
  assertCode(resp, 250, 'EHLO (TLS)');

  writeLine(secureSocket, 'AUTH LOGIN');
  resp = await readResponse(secureSocket);
  assertCode(resp, 334, 'AUTH LOGIN prompt');

  writeLine(secureSocket, b64(user));
  resp = await readResponse(secureSocket);
  assertCode(resp, 334, 'username prompt');

  writeLine(secureSocket, b64(pass));
  resp = await readResponse(secureSocket);
  assertCode(resp, 235, 'auth result');

  writeLine(secureSocket, `MAIL FROM:<${from}>`);
  resp = await readResponse(secureSocket);
  assertCode(resp, 250, 'MAIL FROM');

  writeLine(secureSocket, `RCPT TO:<${to}>`);
  resp = await readResponse(secureSocket);
  assertCode(resp, 250, 'RCPT TO');

  writeLine(secureSocket, 'DATA');
  resp = await readResponse(secureSocket);
  assertCode(resp, 354, 'DATA');

  const stuffed = buildMimeMessage({ from, to, subject, text, attachments, fromName });

  writeLine(secureSocket, stuffed + '\r\n.');
  resp = await readResponse(secureSocket);
  assertCode(resp, 250, 'message accepted');

  writeLine(secureSocket, 'QUIT');
  try {
    await readResponse(secureSocket);
  } catch (_) {
    /* server may close immediately after QUIT ack — ignore */
  }
  secureSocket.end();
}

/**
 * Builds the full RFC 5322 message (headers + body, dot-stuffed, ready to
 * follow a DATA command) as a plain string. Split out from sendMail() so
 * MIME construction (plain-text vs. multipart/mixed-with-attachments) is
 * unit-testable without a live SMTP socket.
 */
export function buildMimeMessage(args: {
  from: string;
  to: string;
  subject: string;
  text: string;
  attachments?: SendMailAttachment[];
  fromName?: string;
}): string {
  const { from, to, subject, text, attachments, fromName = 'SOMA Feedback' } = args;

  // Subjects/bodies here routinely carry non-ASCII (em dashes, curly quotes
  // from pasted feedback text). Sending raw UTF-8 bytes with no declared
  // Content-Transfer-Encoding produced malformed messages that Python's
  // `email` module (claude-email-daemon) could not decode ("unknown
  // encoding: unknown-8bit") — caught live during eric-talk's end-to-end
  // verification 2026-07-04. Fix: RFC 2047-encode the Subject header,
  // base64-encode the body with an explicit Content-Transfer-Encoding.
  // Base64 also sidesteps SMTP dot-stuffing entirely (no line can start
  // with a literal ".").
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
  const wrap76 = (b64Body: string) => b64Body.replace(/(.{76})/g, '$1\r\n');
  const bodyB64 = wrap76(Buffer.from(text, 'utf8').toString('base64'));

  let message: string;
  if (attachments && attachments.length > 0) {
    // multipart/mixed: text/plain body part first, then one part per
    // attachment. Boundary is random enough to never collide with base64
    // attachment content (which can't contain '--' followed by this exact
    // token by construction).
    const boundary = `soma-${Buffer.from(String(Date.now()) + Math.random()).toString('hex').slice(0, 24)}`;
    const parts = [
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      bodyB64,
      '',
    ];
    for (const att of attachments) {
      const attB64 = wrap76(att.content.toString('base64'));
      parts.push(
        `--${boundary}`,
        `Content-Type: ${att.contentType}; name="${att.filename}"`,
        `Content-Disposition: attachment; filename="${att.filename}"`,
        'Content-Transfer-Encoding: base64',
        '',
        attB64,
        '',
      );
    }
    parts.push(`--${boundary}--`, '');
    const headers = [
      `From: ${fromName} <${from}>`,
      `To: ${to}`,
      `Subject: ${encodedSubject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
    ].join('\r\n');
    message = headers + parts.join('\r\n');
  } else {
    const headers = [
      `From: ${fromName} <${from}>`,
      `To: ${to}`,
      `Subject: ${encodedSubject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=utf-8`,
      `Content-Transfer-Encoding: base64`,
      '',
    ].join('\r\n');
    message = headers + bodyB64;
  }

  // SMTP dot-stuffing: any line in the DATA body that starts with a
  // literal '.' must have that dot doubled, or the server (and some relays
  // in between) will treat a lone "." line as the end-of-data marker and
  // silently truncate the message. This never bit the plain-text-only
  // path because base64 body text can't start a line with '.' -- but the
  // MIME boundary lines above (`--boundary`, `--boundary--`) are plain
  // ASCII structural text, not base64, so they need the same protection
  // multipart mail always requires.
  return message.replace(/\r\n\./g, '\r\n..');
}

function assertCode(resp: SmtpResponse | undefined, expected: number, step: string) {
  if (!resp || Math.floor(resp.code / 100) !== Math.floor(expected / 100)) {
    throw new Error(`SMTP ${step} failed: ${resp && resp.text}`);
  }
}
