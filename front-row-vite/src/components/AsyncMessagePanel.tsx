import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Socket } from 'socket.io-client';

interface MessageReaction {
  emoji: string;
  author: string;
}

interface RoomMessage {
  id: string;
  author: string;
  contentType: 'text' | 'voice';
  textContent?: string;
  audioDataUrl?: string;
  createdAt: string;
  reactions: MessageReaction[];
}

interface AsyncMessagePanelProps {
  userName: string;
  socket: Socket | null;
  backendUrl: string;
}

const REACTION_EMOJIS = ['👍', '❤️', '🎉', '👏'];
const MAX_AUDIO_DATAURL_LENGTH = 1_400_000;

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 90,
  right: 24,
  width: 340,
  maxWidth: '92vw',
  maxHeight: '60vh',
  background: 'rgba(0,0,0,0.85)',
  border: '1px solid rgba(255,215,0,0.35)',
  borderRadius: 12,
  display: 'flex',
  flexDirection: 'column',
  color: 'white',
  fontFamily: 'sans-serif',
  zIndex: 9999,
  overflow: 'hidden',
  backdropFilter: 'blur(8px)',
};

const toggleBtnStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 24,
  right: 24,
  zIndex: 9999,
  background: 'rgba(0,0,0,0.85)',
  border: '1px solid rgba(255,215,0,0.5)',
  borderRadius: 30,
  color: '#ffd700',
  fontSize: 15,
  fontWeight: 700,
  padding: '12px 20px',
  cursor: 'pointer',
  backdropFilter: 'blur(8px)',
};

const badgeStyle: React.CSSProperties = {
  position: 'absolute',
  top: -6,
  right: -6,
  background: '#dc3545',
  color: 'white',
  borderRadius: '50%',
  minWidth: 20,
  height: 20,
  fontSize: 12,
  lineHeight: '20px',
  textAlign: 'center',
  padding: '0 4px',
};

const tabBtnStyle = (active: boolean): React.CSSProperties => ({
  flex: 1,
  padding: '8px 0',
  background: active ? 'rgba(255,215,0,0.18)' : 'transparent',
  border: 'none',
  borderBottom: active ? '2px solid #ffd700' : '2px solid transparent',
  color: active ? '#ffd700' : 'rgba(255,255,255,0.6)',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
});

const sendBtnStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '8px 18px',
  borderRadius: 6,
  border: 'none',
  background: disabled ? '#555' : '#2d7a2d',
  color: 'white',
  fontWeight: 700,
  fontSize: 13,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.6 : 1,
});

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function AsyncMessagePanel({ userName, socket, backendUrl }: AsyncMessagePanelProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [tab, setTab] = useState<'text' | 'voice'>('text');
  const [draftText, setDraftText] = useState('');
  const [recording, setRecording] = useState(false);
  const [audioPreview, setAudioPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const openRef = useRef(open);
  useEffect(() => { openRef.current = open; }, [open]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);

  // Initial fetch
  useEffect(() => {
    let cancelled = false;
    fetch(`${backendUrl}/api/messages`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        const list: RoomMessage[] = Array.isArray(data) ? data : (data.messages || []);
        setMessages(list);
      })
      .catch(err => console.error('AsyncMessagePanel: failed to fetch messages', err));
    return () => { cancelled = true; };
  }, [backendUrl]);

  // Live updates via socket
  useEffect(() => {
    if (!socket) return;

    const onNew = (msg: RoomMessage) => {
      setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
      if (!openRef.current) setUnread(prev => prev + 1);
    };
    const onUpdated = (msg: RoomMessage) => {
      setMessages(prev => prev.map(m => (m.id === msg.id ? msg : m)));
    };

    socket.on('message:new', onNew);
    socket.on('message:updated', onUpdated);
    return () => {
      socket.off('message:new', onNew);
      socket.off('message:updated', onUpdated);
    };
  }, [socket]);

  // Auto-scroll to newest when open / new messages
  useEffect(() => {
    if (open && timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [open, messages]);

  // Cleanup recording on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      recordStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const handleToggle = () => {
    setOpen(prev => {
      if (!prev) setUnread(0);
      return !prev;
    });
  };

  const postMessage = useCallback(async (body: Record<string, unknown>) => {
    setSending(true);
    try {
      const res = await fetch(`${backendUrl}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Send failed' }));
        alert(`Could not send message: ${(err as { error?: string }).error || res.statusText}`);
        return false;
      }
      return true;
    } catch (err) {
      console.error('AsyncMessagePanel: send failed', err);
      alert('Could not send message — server unreachable.');
      return false;
    } finally {
      setSending(false);
    }
  }, [backendUrl]);

  const handleSendText = async () => {
    const text = draftText.trim();
    if (!text) return;
    const ok = await postMessage({
      author: userName || 'Anonymous',
      contentType: 'text',
      textContent: text,
    });
    if (ok) setDraftText('');
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordStreamRef.current = stream;
      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          if (dataUrl.length > MAX_AUDIO_DATAURL_LENGTH) {
            alert('Recording too long — voice messages are limited to ~1MB. Try a shorter message.');
            setAudioPreview(null);
          } else {
            setAudioPreview(dataUrl);
          }
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(t => t.stop());
        recordStreamRef.current = null;
      };

      recorder.start();
      setAudioPreview(null);
      setRecording(true);
    } catch (err) {
      console.error('AsyncMessagePanel: mic access failed', err);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  };

  const handleSendVoice = async () => {
    if (!audioPreview) return;
    const ok = await postMessage({
      author: userName || 'Anonymous',
      contentType: 'voice',
      audioDataUrl: audioPreview,
    });
    if (ok) setAudioPreview(null);
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    try {
      await fetch(`${backendUrl}/api/messages/${messageId}/reaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji, author: userName || 'Anonymous' }),
      });
    } catch (err) {
      console.error('AsyncMessagePanel: reaction failed', err);
    }
  };

  const reactionCounts = (msg: RoomMessage): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (const r of msg.reactions || []) {
      counts[r.emoji] = (counts[r.emoji] || 0) + 1;
    }
    return counts;
  };

  return (
    <>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <button style={toggleBtnStyle} onClick={handleToggle} data-testid="messages-toggle">
          💬 Messages
          {unread > 0 && <span style={badgeStyle} data-testid="messages-unread">{unread}</span>}
        </button>
      </div>

      {open && (
        <div style={panelStyle} data-testid="messages-panel">
          <div style={{
            padding: '10px 14px',
            borderBottom: '1px solid rgba(255,255,255,0.12)',
            color: '#ffd700',
            fontWeight: 700,
            fontSize: 14,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span>💬 Room Messages</span>
            <button
              onClick={handleToggle}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 16 }}
            >
              ✕
            </button>
          </div>

          {/* Timeline */}
          <div
            ref={timelineRef}
            style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 120 }}
            data-testid="messages-timeline"
          >
            {messages.length === 0 && (
              <div style={{ opacity: 0.5, fontSize: 13, textAlign: 'center', marginTop: 20 }}>
                No messages yet. Leave one for the room!
              </div>
            )}
            {messages.map(msg => {
              const counts = reactionCounts(msg);
              return (
                <div
                  key={msg.id}
                  style={{
                    background: 'rgba(255,255,255,0.07)',
                    borderRadius: 8,
                    padding: '8px 10px',
                    fontSize: 13,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <strong style={{ color: '#ffd700' }}>{msg.author}</strong>
                    <span style={{ opacity: 0.5, fontSize: 11 }}>{formatTime(msg.createdAt)}</span>
                  </div>
                  {msg.contentType === 'text' ? (
                    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.textContent}</div>
                  ) : (
                    <audio controls src={msg.audioDataUrl} style={{ width: '100%', height: 32 }} />
                  )}
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    {REACTION_EMOJIS.map(emoji => (
                      <button
                        key={emoji}
                        onClick={() => handleReaction(msg.id, emoji)}
                        style={{
                          background: counts[emoji] ? 'rgba(255,215,0,0.18)' : 'rgba(255,255,255,0.08)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: 12,
                          color: 'white',
                          fontSize: 12,
                          padding: '2px 8px',
                          cursor: 'pointer',
                        }}
                      >
                        {emoji}{counts[emoji] ? ` ${counts[emoji]}` : ''}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Compose */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
            <div style={{ display: 'flex' }}>
              <button style={tabBtnStyle(tab === 'text')} onClick={() => setTab('text')}>✏️ Text</button>
              <button style={tabBtnStyle(tab === 'voice')} onClick={() => setTab('voice')}>🎤 Voice</button>
            </div>

            {tab === 'text' ? (
              <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea
                  value={draftText}
                  onChange={e => setDraftText(e.target.value)}
                  placeholder="Leave a message for the room..."
                  rows={2}
                  style={{
                    resize: 'none',
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 6,
                    color: 'white',
                    padding: '6px 8px',
                    fontSize: 13,
                    fontFamily: 'sans-serif',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    style={sendBtnStyle(sending || !draftText.trim())}
                    disabled={sending || !draftText.trim()}
                    onClick={handleSendText}
                  >
                    Send
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {!recording ? (
                    <button
                      style={{ ...sendBtnStyle(false), background: '#cc0000' }}
                      onClick={startRecording}
                    >
                      ⏺ Record
                    </button>
                  ) : (
                    <button
                      style={{ ...sendBtnStyle(false), background: '#8B4513' }}
                      onClick={stopRecording}
                    >
                      ⏹ Stop
                    </button>
                  )}
                  {recording && <span style={{ color: '#ff6666', fontSize: 12 }}>● Recording...</span>}
                </div>
                {audioPreview && (
                  <>
                    <audio controls src={audioPreview} style={{ width: '100%', height: 32 }} />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                      <button
                        style={{ ...sendBtnStyle(false), background: '#555' }}
                        onClick={() => setAudioPreview(null)}
                      >
                        Discard
                      </button>
                      <button
                        style={sendBtnStyle(sending)}
                        disabled={sending}
                        onClick={handleSendVoice}
                      >
                        Send
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default AsyncMessagePanel;
