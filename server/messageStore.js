// File-backed message store for the async message drop feature.
// Persists to server/data/messages.json so messages survive restarts.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'messages.json');

const MAX_MESSAGES = 100;
const MAX_AUDIO_DATAURL_LENGTH = 1_400_000; // ~1MB of binary audio encoded as base64
const MAX_TEXT_LENGTH = 2000;
const MAX_AUTHOR_LENGTH = 60;

let messages = null; // lazy-loaded cache

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadMessages() {
  ensureDataDir();
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      messages = Array.isArray(parsed) ? parsed : [];
    } else {
      messages = [];
    }
  } catch (err) {
    console.error('messageStore: failed to load messages.json, starting empty:', err.message);
    messages = [];
  }
  return messages;
}

function ensureLoaded() {
  if (messages === null) loadMessages();
}

function persist() {
  ensureDataDir();
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(messages, null, 2), 'utf8');
  } catch (err) {
    console.error('messageStore: failed to persist messages.json:', err.message);
  }
}

function getAllMessages() {
  ensureLoaded();
  return messages;
}

function saveMessage({ author, contentType, textContent, audioDataUrl } = {}) {
  ensureLoaded();

  if (typeof author !== 'string' || !author.trim()) {
    throw new Error('author is required');
  }
  if (contentType !== 'text' && contentType !== 'voice') {
    throw new Error("contentType must be 'text' or 'voice'");
  }

  const msg = {
    id: crypto.randomUUID(),
    author: author.trim().slice(0, MAX_AUTHOR_LENGTH),
    contentType,
    textContent: '',
    audioDataUrl: '',
    createdAt: new Date().toISOString(),
    reactions: [],
  };

  if (contentType === 'text') {
    if (typeof textContent !== 'string' || !textContent.trim()) {
      throw new Error('textContent is required for text messages');
    }
    msg.textContent = textContent.trim().slice(0, MAX_TEXT_LENGTH);
  } else {
    if (typeof audioDataUrl !== 'string' || !audioDataUrl.startsWith('data:audio')) {
      throw new Error('audioDataUrl (data:audio/... base64) is required for voice messages');
    }
    if (audioDataUrl.length > MAX_AUDIO_DATAURL_LENGTH) {
      throw new Error('audioDataUrl exceeds 1MB limit');
    }
    msg.audioDataUrl = audioDataUrl;
  }

  messages.push(msg);
  if (messages.length > MAX_MESSAGES) {
    messages = messages.slice(messages.length - MAX_MESSAGES);
  }
  persist();
  return msg;
}

function addReaction(messageId, emoji, author) {
  ensureLoaded();
  const msg = messages.find(m => m.id === messageId);
  if (!msg) return null;
  if (typeof emoji !== 'string' || !emoji.trim()) return null;

  if (!Array.isArray(msg.reactions)) msg.reactions = [];
  msg.reactions.push({
    emoji: emoji.trim().slice(0, 8),
    author: (typeof author === 'string' && author.trim()) ? author.trim().slice(0, MAX_AUTHOR_LENGTH) : 'anonymous',
  });
  persist();
  return msg;
}

module.exports = { loadMessages, saveMessage, addReaction, getAllMessages };
