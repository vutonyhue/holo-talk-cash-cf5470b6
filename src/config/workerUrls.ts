// Centralized Cloudflare Worker URLs.
//
// We intentionally do not keep hard-coded workers.dev fallbacks here.
// If these are missing, the app should fail fast instead of silently
// calling the wrong worker (e.g. an old subdomain).

function requireViteEnv(key: "VITE_API_BASE_URL" | "VITE_AGORA_TOKEN_WORKER_URL"): string {
  const value = import.meta.env[key];
  if (!value) {
    throw new Error(
      `[config] Missing ${key}. Set it in root .env (local) or hosting env vars (prod).`
    );
  }
  return value;
}

export const API_BASE_URL = requireViteEnv("VITE_API_BASE_URL");
export const AGORA_TOKEN_WORKER_URL = requireViteEnv("VITE_AGORA_TOKEN_WORKER_URL");

