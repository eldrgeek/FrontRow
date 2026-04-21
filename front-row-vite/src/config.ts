
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
  return 'wss://vpsmikewolf.duckdns.org';
}

const config: Config = {
  artistName: "The Virtual Troubadour",
  backendUrl: getBackendUrl(),
  socketUrl: getBackendUrl(),
  livekitUrl: getLivekitUrl(),
  tokenUrl: '/.netlify/functions/get-livekit-token',
};

export default config;
