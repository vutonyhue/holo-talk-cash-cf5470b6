# FunChat API Gateway

A Cloudflare Worker that acts as an API Gateway for FunChat, providing API key verification, rate limiting, scope-based access control, and request routing to Supabase Edge Functions.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Manual Setup](#manual-setup)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Testing](#testing)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)
- [Security](#security)

## Overview

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│                 │     │  Cloudflare Worker   │     │                     │
│  Client App     │────▶│  (API Gateway)       │────▶│  Supabase Edge      │
│  + FunChat SDK  │     │                      │     │  Functions          │
│                 │◀────│  • API Key Verify    │◀────│                     │
└─────────────────┘     │  • Rate Limiting     │     └─────────────────────┘
                        │  • Scope Checking    │
                        │  • Origin Validation │
                        └──────────────────────┘
```

## Features

- **🔐 API Key Verification** - Validates API keys with SHA-256 hashing
- **⚡ KV Caching** - 5-minute cache for verified keys (reduces DB lookups)
- **🚦 Rate Limiting** - Configurable per-key rate limits with sliding window
- **🎯 Scope-Based Access** - Granular permission control per endpoint
- **🌐 Origin Validation** - Restrict API access to allowed domains
- **📊 Rate Limit Headers** - Standard headers for client-side handling
- **🔄 CORS Support** - Proper preflight handling for browser clients

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- [Cloudflare Account](https://dash.cloudflare.com/sign-up) (free tier works)
- Supabase project with FunChat backend deployed

## Quick Start

```bash
# 1. Navigate to the cloudflare-worker directory
cd cloudflare-worker

# 2. Install dependencies
npm install

# 3. Run interactive setup (handles everything automatically)
npm run setup
```

The setup script will:
1. Check prerequisites (Node.js, Wrangler)
2. Prompt for your Supabase service key
3. Create KV namespaces
4. Update configuration
5. Set secrets
6. Deploy the worker

## Manual Setup

If you prefer manual setup or the script fails:

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Login to Cloudflare

```bash
npx wrangler login
```

### Step 3: Create KV Namespaces

```bash
# Create API key cache namespace
npx wrangler kv:namespace create API_KEY_CACHE
# Note the ID from the output

# Create rate limit namespace
npx wrangler kv:namespace create RATE_LIMIT
# Note the ID from the output
```

### Step 4: Update wrangler.toml

Replace the placeholder IDs in `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "API_KEY_CACHE"
id = "YOUR_API_KEY_CACHE_ID"  # Replace with actual ID

[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "YOUR_RATE_LIMIT_ID"  # Replace with actual ID
```

### Step 5: Set Secrets

```bash
# Set Supabase URL
npx wrangler secret put SUPABASE_URL
# Enter: https://dgeadmmbkvcsgizsnbpi.supabase.co

# Set Supabase service role key
npx wrangler secret put SUPABASE_SERVICE_KEY
# Enter your service role key
```

### Step 6: Deploy

```bash
npm run deploy
```

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Supabase project URL | Yes (secret) |
| `SUPABASE_SERVICE_KEY` | Supabase service role key | Yes (secret) |
| `SUPABASE_FUNCTIONS_URL` | Edge functions URL | Yes (in wrangler.toml) |

### KV Namespaces

| Namespace | Purpose | TTL |
|-----------|---------|-----|
| `API_KEY_CACHE` | Caches verified API keys | 5 minutes |
| `RATE_LIMIT` | Stores rate limit counters | 1 hour |

### Endpoint Scopes

| Endpoint | GET | POST | PUT/PATCH | DELETE |
|----------|-----|------|-----------|--------|
| `/api-chat/*` | `chat:read` | `chat:write` | `chat:write` | `chat:write` |
| `/api-users/*` | `users:read` | `users:write` | `users:write` | - |
| `/api-calls/*` | `calls:read` | `calls:write` | `calls:write` | - |
| `/api-crypto/*` | `crypto:read` | `crypto:write` | - | - |
| `/api-webhooks/*` | `webhooks:read` | `webhooks:write` | `webhooks:write` | `webhooks:write` |

## Deployment

### Development

```bash
# Start local development server
npm run dev

# The worker will be available at http://localhost:8787
```

### Production

```bash
# Deploy to Cloudflare
npm run deploy

# Deploy to production environment
npm run deploy:production
```

### View Logs

```bash
# Stream live logs
npm run logs

# Or use wrangler directly
npx wrangler tail
```

## Testing

### Run Test Suite

```bash
# Test against local dev server
npm run dev
# In another terminal:
npm run test

# Test against deployed worker
WORKER_URL=https://your-worker.workers.dev npm run test

# Test with a valid API key
TEST_API_KEY=fc_live_xxx WORKER_URL=https://your-worker.workers.dev npm run test
```

### Manual Testing with cURL

```bash
# Health check
curl https://your-worker.workers.dev/health

# Test without API key (should return 401)
curl https://your-worker.workers.dev/api-chat/conversations

# Test with API key
curl https://your-worker.workers.dev/api-chat/conversations \
  -H "x-funchat-api-key: fc_live_your_key_here"
```

## API Reference

### Headers

**Request Headers:**
| Header | Description | Required |
|--------|-------------|----------|
| `x-funchat-api-key` | Your FunChat API key | Yes |
| `Content-Type` | `application/json` for POST/PUT | Conditional |
| `Origin` | Client origin (for CORS) | No |

**Response Headers:**
| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests per hour |
| `X-RateLimit-Remaining` | Remaining requests this hour |
| `X-RateLimit-Reset` | Unix timestamp when limit resets |

### Error Responses

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

| Code | Status | Description |
|------|--------|-------------|
| `UNAUTHORIZED` | 401 | Missing API key |
| `INVALID_API_KEY` | 401 | Invalid API key format or value |
| `API_KEY_INACTIVE` | 403 | API key has been deactivated |
| `API_KEY_EXPIRED` | 403 | API key has expired |
| `ORIGIN_NOT_ALLOWED` | 403 | Request origin not in allowlist |
| `INSUFFICIENT_SCOPE` | 403 | API key lacks required scope |
| `RATE_LIMITED` | 429 | Rate limit exceeded |

## Troubleshooting

### Common Issues

**"API key not found" after creating a key:**
- KV cache may be stale. Run `npm run kv:clear-cache`
- Verify the key exists in your Supabase `api_keys` table

**"Rate limit exceeded" immediately:**
- Check the `rate_limit` value for the API key in Supabase
- Verify the `RATE_LIMIT` KV namespace is configured correctly

**Worker returns 500 errors:**
- Check worker logs: `npm run logs`
- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` secrets are set
- Ensure Supabase edge functions are deployed

**CORS errors in browser:**
- Verify the origin is in the API key's `allowed_origins` array
- Check that preflight requests return proper CORS headers

### Debug Commands

```bash
# View live worker logs
npm run logs

# List cached API keys
npm run kv:list

# Clear API key cache
npm run kv:clear-cache

# Check wrangler configuration
npx wrangler whoami
```

## Security

### Best Practices

1. **Never expose your Service Role Key** - It has full database access
2. **Use allowed_origins** - Restrict API keys to specific domains
3. **Set appropriate scopes** - Only grant permissions that are needed
4. **Set expiration dates** - Rotate API keys regularly
5. **Monitor usage** - Check logs for unusual patterns

### API Key Format

```
fc_live_xxxxxxxxxxxxxxxxxxxxxxxxxx  - Production key
fc_test_xxxxxxxxxxxxxxxxxxxxxxxxxx  - Test/development key
```

- First 12 characters are the prefix (used for lookup)
- Full key is hashed with SHA-256 and a per-key salt
- Keys are verified against the hash in the database

### Rate Limiting

- Default: 1000 requests per hour per API key
- Configurable per key in the `api_keys` table
- Uses sliding window algorithm with KV storage
- Returns `429 Too Many Requests` when exceeded

---

## License

MIT License - See [LICENSE](LICENSE) for details.

## Support

- 📖 [FunChat Documentation](https://docs.funchat.io)
- 🐛 [Report Issues](https://github.com/funchat/api-gateway/issues)
- 💬 [Community Discord](https://discord.gg/funchat)
