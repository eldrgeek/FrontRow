// The post-show chat, behind a small interface so the backend can change
// (frontrow-server today; SOMA Rooms when the venue moves there, Phase 4).
import type { Socket } from 'socket.io-client';

export interface ChatLine {
  name: string;
  text: string;
  at: number;
  mine?: boolean;
}

export interface ChatChannel {
  /** Calls back with the history first, then each new line. Returns unsubscribe. */
  subscribe(onLine: (line: ChatLine) => void): () => void;
  send(name: string, text: string): void;
}

export const CHAT_MAX = 280;

/** frontrow-server: 'postshow:chat' out and in, 'postshow:history' on join. */
export function socketChat(socket: Socket | null): ChatChannel {
  return {
    subscribe(onLine) {
      if (!socket) return () => undefined;
      const own = socket.id;
      const take = (l: ChatLine & { from?: string }) =>
        onLine({ name: String(l.name), text: String(l.text), at: Number(l.at) || Date.now(), mine: !!own && l.from === own });
      const hist = (lines: (ChatLine & { from?: string })[]) => Array.isArray(lines) && lines.forEach(take);
      socket.on('postshow:chat', take);
      socket.on('postshow:history', hist);
      socket.emit('postshow:history');
      return () => {
        socket.off('postshow:chat', take);
        socket.off('postshow:history', hist);
      };
    },
    send(name, text) {
      socket?.emit('postshow:chat', { name, text: text.slice(0, CHAT_MAX) });
    },
  };
}
