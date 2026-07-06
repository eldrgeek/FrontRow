
interface Config {
  artistName: string;
  backendUrl: string;
  socketUrl: string;
  livekitUrl: string;
  tokenUrl: string;
}

function getBackendUrl(): string {
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL;
  }
  if (import.meta.env.DEV) {
    return 'http://localhost:3001';
  }
  return 'https://vpsmikewolf.duckdns.org:4001';
}

function getLivekitUrl(): string {
  if (import.meta.env.VITE_LIVEKIT_URL) {
    return import.meta.env.VITE_LIVEKIT_URL;
  }
  return 'wss://hootnet-zkp2l3aj.livekit.cloud';
}

function getTokenUrl(): string {
  if (import.meta.env.VITE_TOKEN_URL) {
    return import.meta.env.VITE_TOKEN_URL;
  }
  if (import.meta.env.DEV) {
    return `${getBackendUrl()}/api/livekit-token`;
  }
  return '/.netlify/functions/get-livekit-token';
}

const config: Config = {
  artistName: "The Virtual Troubadour",
  backendUrl: getBackendUrl(),
  socketUrl: getBackendUrl(),
  livekitUrl: getLivekitUrl(),
  tokenUrl: getTokenUrl(),
};

export default config;
