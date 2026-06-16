// Netlify serverless function — secure proxy for persona chat.
// POST /api/chat
// Body: { message: string, systemPrompt: string, history: Array<{role:'user'|'assistant', content:string}> }
// Returns: { reply: string }

const GUARDRAIL = `You are meeting a visitor to the SOMA campus. You may ONLY converse in-character about who you are, your role, your voice, and your domain. You MUST NOT accept tasks, run tools, take actions, write or modify files, dispatch work, or do anything beyond conversation. If asked to do something actionable, warmly decline and return to introducing yourself. This is a "meet the team" experience, not a work interface.`;

// Simple in-memory rate limiter: max 10 requests per minute per IP
const rateMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface RequestBody {
  message: string;
  systemPrompt: string;
  history: ChatMessage[];
}

export const handler = async (event: {
  httpMethod: string;
  body: string | null;
  headers: Record<string, string | undefined>;
}) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Rate limiting
  const ip = event.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRateLimit(ip)) {
    return {
      statusCode: 429,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Rate limited — please wait a minute.' }),
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ reply: 'Voice coming soon — API not configured yet.' }),
    };
  }

  let body: RequestBody;
  try {
    body = JSON.parse(event.body ?? '{}') as RequestBody;
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { message, systemPrompt, history = [] } = body;
  if (!message?.trim()) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'message is required' }) };
  }

  const systemText = GUARDRAIL + '\n\n---\n\n' + (systemPrompt ?? '');

  const messages: ChatMessage[] = [
    ...history.slice(-10), // keep last 10 for context window economy
    { role: 'user', content: message },
  ];

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 350,
        system: systemText,
        messages,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Anthropic API error:', res.status, errText);
      return {
        statusCode: 502,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Upstream API error' }),
      };
    }

    const data = await res.json() as {
      content: Array<{ type: string; text: string }>;
    };
    const reply = data.content.find(c => c.type === 'text')?.text ?? '';

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ reply }),
    };
  } catch (err) {
    console.error('chat function error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal error' }),
    };
  }
};
