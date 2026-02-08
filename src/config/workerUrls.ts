// Centralized Cloudflare Worker URLs.
//
// Uses fallback URLs if environment variables are missing,
// allowing the app to run while logging warnings.
// Supports different URLs for Preview vs Published environments.

function getViteEnv(
  key: "VITE_API_BASE_URL" | "VITE_AGORA_TOKEN_WORKER_URL",
  fallback: string
): string {
  const value = import.meta.env[key];
  if (!value) {
    console.warn(
      `[config] ⚠️ Missing ${key}. Using fallback for current environment.`
    );
    return fallback;
  }
  return value;
}

// Detect environment based on hostname
const isProduction = typeof window !== 'undefined' && 
  window.location.hostname === 'holo-talk-cash.lovable.app';

// API Gateway URLs - different for Preview vs Published
const API_GATEWAY_PROD = "https://funchat-api-gateway-prod.lequangvu2210-hue.workers.dev";
const API_GATEWAY_DEV = "https://funchat-api-gateway.lequangvu2210-hue.workers.dev";

export const API_BASE_URL = getViteEnv(
  "VITE_API_BASE_URL",
  isProduction ? API_GATEWAY_PROD : API_GATEWAY_DEV
);

export const AGORA_TOKEN_WORKER_URL = getViteEnv(
  "VITE_AGORA_TOKEN_WORKER_URL",
  "https://agora-token-worker.lequangvu2210-hue.workers.dev"
);

// Debug log in development
if (import.meta.env.DEV) {
  console.log('[config] Environment:', isProduction ? 'PRODUCTION' : 'PREVIEW');
  console.log('[config] API_BASE_URL:', API_BASE_URL);
}
