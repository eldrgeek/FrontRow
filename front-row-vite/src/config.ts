
interface Config {
  artistName: string;
  backendUrl: string;
  socketUrl: string;
}

// Helper function to get the appropriate backend URL
function getBackendUrl(): string {
  // If environment variables are explicitly set, use them
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL;
  }
  
  // Development environment
  if (import.meta.env.DEV) {
    return 'http://localhost:3001';
  }
  
  // Check if this is a Netlify deploy preview
  const hostname = window.location.hostname;
  if (hostname.includes('deploy-preview-') && hostname.includes('--frontrowtheater.netlify.app')) {
    // Extract PR number from Netlify preview URL
    const prMatch = hostname.match(/deploy-preview-(\d+)/);
    if (prMatch) {
      const prNumber = prMatch[1];
      return `https://frontrow-pr-${prNumber}.onrender.com`;
    }
  }
  
  // Production fallback
  return 'https://frontrow-tvu6.onrender.com';
}

const config: Config = {
  artistName: "The Virtual Troubadour",
  // Backend configuration - dynamically determined
  backendUrl: getBackendUrl(),
  socketUrl: getBackendUrl(),
};

export default config;
