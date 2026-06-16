import { useState, useRef, useEffect } from 'react';
import type { Persona } from '../data/personas';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  persona: Persona;
  systemPrompt: string | null;
}

export function ChatPanel({ persona, systemPrompt }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const introText = `You're talking with ${persona.name}. Ask me about my role, my voice, or how I work. I can't take tasks — but I can introduce myself.`;

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');

    const next: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setLoading(true);

    try {
      const sp = systemPrompt
        ? systemPrompt
        : `You are ${persona.name}. ${persona.role} Your voice: ${persona.voiceDNA}`;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          systemPrompt: sp,
          history: messages,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        if (res.status === 429) {
          setMessages([...next, { role: 'assistant', content: 'Slow down — rate limit hit. Try again in a minute.' }]);
        } else {
          setMessages([...next, { role: 'assistant', content: err.error ?? 'Something went wrong.' }]);
        }
        return;
      }

      const data = await res.json() as { reply: string };
      setMessages([...next, { role: 'assistant', content: data.reply }]);
    } catch {
      setMessages([...next, { role: 'assistant', content: 'Could not reach the chat API. Check that Netlify Dev is running on port 8888.' }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="chat-panel" aria-label={`Chat with ${persona.name}`}>
      <div className="chat-intro">{introText}</div>
      {persona.voiceUrl && (
        <a
          className="chat-voice-link"
          href={persona.voiceUrl}
          target="_blank"
          rel="noreferrer"
          style={{ color: persona.accent, borderColor: persona.accent }}
        >
          Talk by voice →
        </a>
      )}
      <div className="chat-messages" role="log" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`chat-message chat-message-${m.role}`}>
            <span className="chat-message-who">{m.role === 'user' ? 'you' : persona.name}</span>
            <p className="chat-message-text">{m.content}</p>
          </div>
        ))}
        {loading && (
          <div className="chat-loading">
            <span className="chat-loading-dot" />
            <span className="chat-loading-dot" />
            <span className="chat-loading-dot" />
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="chat-input-row">
        <textarea
          className="chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Say something to ${persona.name}…`}
          rows={2}
          disabled={loading}
          aria-label={`Message to ${persona.name}`}
        />
        <button
          className="chat-send"
          onClick={send}
          disabled={loading || !input.trim()}
          style={{ ['--accent' as string]: persona.accent }}
          aria-label="Send"
        >
          ↑
        </button>
      </div>
    </div>
  );
}
