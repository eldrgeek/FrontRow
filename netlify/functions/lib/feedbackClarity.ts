// Clarity check via the Anthropic Messages API — ported from Playmaker's
// lib/feedbackClarity.ts (itself from soma-feedback-svc's lib/clarity.js) so
// FrontRow's own widget intake function can run the same clarify-or-accept
// classification without a cross-service call to the VPS. Cheap model per
// _estate/MODEL-ROUTING.md ("mechanical work" tier).

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You are a triage assistant for FrontRow's feedback widget. A user submitted feedback (possibly across several turns of a short clarifying conversation). Decide if the feedback is clear and actionable enough to file as a work item, or too ambiguous (vague, missing what/where, contradictory) to act on without one more question.

Respond with ONLY a JSON object, no prose, no markdown fences:
{"status": "clarify" | "accepted", "question": "<one focused clarifying question, only if status=clarify, else empty string>", "title": "<a short 6-10 word title for the item, only if status=accepted, else empty string>"}

Rules:
- Default to "accepted" unless the message is genuinely too vague to act on (e.g. just "this is broken" with no context, or "make it better").
- If conversation history already contains a clarifying answer, weigh the WHOLE conversation, not just the latest turn — err toward accepted once the user has answered a follow-up.
- Never invent facts not present in the conversation.`;

export interface ClarityTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClarityResult {
  status: 'clarify' | 'accepted';
  question: string;
  title: string;
}

export async function checkClarity(
  text: string,
  conversation: ClarityTurn[] = [],
): Promise<ClarityResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const turns = conversation
    .filter((t) => t && typeof t.content === 'string')
    .map((t) => ({
      role: t.role === 'assistant' ? 'assistant' : 'user',
      content: t.content.slice(0, 4000),
    }));
  turns.push({ role: 'user', content: text.slice(0, 4000) });

  const resp = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: turns,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Anthropic API ${resp.status}: ${errText.slice(0, 300)}`);
  }

  const data: any = await resp.json();
  const raw = (data.content || []).map((b: any) => b.text || '').join('').trim();

  let parsed: any;
  try {
    const cleaned = raw.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Anthropic response not valid JSON: ${raw.slice(0, 200)}`);
  }

  const status = parsed.status === 'clarify' ? 'clarify' : 'accepted';
  return {
    status,
    question: status === 'clarify' ? String(parsed.question || '').slice(0, 500) : '',
    title: status === 'accepted' ? String(parsed.title || '').slice(0, 100) : '',
  };
}
