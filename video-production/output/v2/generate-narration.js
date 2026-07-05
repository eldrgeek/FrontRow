#!/usr/bin/env node
/**
 * Generate narration audio for each beat using OpenAI TTS API.
 * Voice: nova, Model: tts-1-hd
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

let API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
  try {
    const secretsPath = require('path').join(require('os').homedir(), 'Projects/CIE/secrets.yaml');
    const secrets = require('fs').readFileSync(secretsPath, 'utf-8');
    API_KEY = secrets.match(/OPENAI_API_KEY:\s*"([^"]+)"/)?.[1];
  } catch { /* fall through */ }
}
if (!API_KEY) { console.error('No OPENAI_API_KEY found. Set env var or add to ~/Projects/CIE/secrets.yaml'); process.exit(1); }
const AUDIO_DIR = path.join(__dirname, 'audio');

const beats = [
  { id: 'beat_01', text: 'A theater, waiting. Twelve seats arranged in a semicircle. Red curtains drawn. And backstage, a performer getting ready.' },
  { id: 'beat_02', text: 'The house manager arrives first — setting twelve seats, semicircle arrangement, and locking the configuration before doors open.' },
  { id: 'beat_03', text: 'Audience members join from anywhere — each claiming a seat, their photo appearing on a glowing cube in the 3D theater.' },
  { id: 'beat_04', text: 'Backstage, the performer checks camera and mic, types their stage name, and hits Go Live.' },
  { id: 'beat_05', text: 'The house manager opens the curtains — and the theater comes alive.' },
  { id: 'beat_06', text: 'The performer steps onto the stage. Every audience member sees them in real time, rendered right in the browser.' },
  { id: 'beat_07', text: 'Applause erupts — the reaction bar at the stage edge glows hotter with every clap.' },
  { id: 'beat_08', text: 'A spotlight snaps on. The performer takes a bow. The audience cheers.' },
  { id: 'beat_09', text: 'And the curtains close — show complete.' },
  { id: 'beat_10', text: 'FrontRow. Your stage, your audience, your browser. Take a seat.' },
];

async function generateTTS(beat) {
  const outPath = path.join(AUDIO_DIR, `${beat.id}.mp3`);

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'tts-1-hd',
      input: beat.text,
      voice: 'nova',
      response_format: 'mp3',
    });

    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/audio/speech',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      if (res.statusCode !== 200) {
        let err = '';
        res.on('data', d => err += d);
        res.on('end', () => reject(new Error(`TTS API error ${res.statusCode}: ${err}`)));
        return;
      }
      const file = fs.createWriteStream(outPath);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`✓ ${beat.id}: ${outPath}`);
        resolve(outPath);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });

  // Generate sequentially to avoid rate limits
  for (const beat of beats) {
    await generateTTS(beat);
  }

  // Get durations
  const manifest = {};
  for (const beat of beats) {
    const mp3Path = path.join(AUDIO_DIR, `${beat.id}.mp3`);
    try {
      const { execSync } = require('child_process');
      const dur = execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${mp3Path}"`, { encoding: 'utf-8' }).trim();
      manifest[beat.id] = { duration: parseFloat(dur), file: `${beat.id}.mp3` };
    } catch {
      manifest[beat.id] = { duration: 0, file: `${beat.id}.mp3` };
    }
  }

  fs.writeFileSync(path.join(AUDIO_DIR, 'MANIFEST.json'), JSON.stringify(manifest, null, 2));
  console.log('\nManifest:', JSON.stringify(manifest, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
