// Centralized Cloudflare Worker URLs.
//
// Uses fallback URLs if environment variables are missing,
// allowing the app to run while logging warnings.

function getViteEnv(
  key: "VITE_API_BASE_URL" | "VITE_AGORA_TOKEN_WORKER_URL",
  fallback: string
): string {
  const value = import.meta.env[key];
  if (!value) {
    console.error(
      `[config] ⚠️ Missing ${key}. Using fallback. ` +
      `Set it in root .env (local) or hosting env vars (prod).`
    );
    return fallback;
  }
  return value;
}

// Fallback URLs - updated with new worker URLs
export const API_BASE_URL = getViteEnv(
  "VITE_API_BASE_URL",
  "https://funchat-api-gateway.lequangvu2210-hue.workers.dev"
);

export const AGORA_TOKEN_WORKER_URL = getViteEnv(
  "VITE_AGORA_TOKEN_WORKER_URL",
  "https://agora-token-worker.lequangvu2210-hue.workers.dev"
);
