
interface Config {
  artistName: string;
  backendUrl: string;
  socketUrl: string;
}

const config: Config = {
  artistName: "The Virtual Troubadour",
  // Backend configuration - use environment variables for production
  backendUrl: import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001',
  socketUrl: import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001',
};

export default config;
