
interface Config {
  artistName: string;
  backendUrl: string;
  socketUrl: string;
}

const config: Config = {
  artistName: "The Virtual Troubadour",
  // Backend configuration - use environment variables for production
  backendUrl: import.meta.env.VITE_BACKEND_URL || 'https://frontrow-tvu6.onrender.com',
  socketUrl: import.meta.env.VITE_SOCKET_URL || 'https://frontrow-tvu6.onrender.com',
};

export default config;
