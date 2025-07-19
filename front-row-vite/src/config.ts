
interface Config {
  artistName: string;
  backendUrl: string;
  socketUrl: string;
}

const config: Config = {
  artistName: "The Virtual Troubadour",
  // Backend configuration - uses environment variables with fallbacks
  backendUrl: import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001',
  socketUrl: import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001',
};

export default config;
