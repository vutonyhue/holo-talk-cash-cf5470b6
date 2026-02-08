

# Hướng dẫn Deploy Cloudflare Workers từ đầu

## Tổng quan

Dự án FunChat có **2 Cloudflare Workers** riêng biệt:

| Worker | Mục đích | Thư mục |
|--------|----------|---------|
| **API Gateway** | Xác thực API keys, rate limiting, proxy requests đến Supabase Edge Functions | `cloudflare-worker/` |
| **Agora Token Worker** | Generate RTC tokens cho video/voice calls | `agora-token-worker/` |

---

## Yêu cầu trước khi bắt đầu

1. **Node.js 18+** - Cài đặt từ [nodejs.org](https://nodejs.org/)
2. **Tài khoản Cloudflare** - Đăng ký miễn phí tại [dash.cloudflare.com](https://dash.cloudflare.com/sign-up)
3. **Tài khoản Agora** - Đăng ký tại [console.agora.io](https://console.agora.io/) (cho video calls)

---

## PHẦN 1: Deploy API Gateway

### Bước 1: Mở Terminal và vào thư mục

```bash
cd cloudflare-worker
```

### Bước 2: Cài đặt dependencies

```bash
npm install
```

### Bước 3: Đăng nhập Cloudflare

```bash
npx wrangler login
```
- Trình duyệt sẽ mở trang đăng nhập Cloudflare
- Đăng nhập và cho phép Wrangler truy cập

### Bước 4: Tạo KV Namespaces (Lưu trữ cache)

```bash
# Tạo namespace cho cache API keys
npx wrangler kv:namespace create API_KEY_CACHE

# Tạo namespace cho rate limiting
npx wrangler kv:namespace create RATE_LIMIT

# Tạo namespace cho JWKS cache (xác thực JWT)
npx wrangler kv:namespace create JWKS_CACHE

# Tạo namespace cho typing state (đang gõ)
npx wrangler kv:namespace create TYPING_STATE
```

**⚠️ QUAN TRỌNG**: Ghi lại các **ID** từ output của mỗi lệnh. Ví dụ:
```
⛅️ wrangler 3.22.4
🌀 Creating namespace with title "funchat-api-gateway-API_KEY_CACHE"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
{ binding = "API_KEY_CACHE", id = "abc123def456..." }
```

### Bước 5: Cập nhật wrangler.toml

Mở file `wrangler.toml` và thay thế các ID:

```toml
[[kv_namespaces]]
binding = "API_KEY_CACHE"
id = "YOUR_API_KEY_CACHE_ID"  # ← Thay bằng ID bước 4

[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "YOUR_RATE_LIMIT_ID"  # ← Thay bằng ID bước 4

[[kv_namespaces]]
binding = "JWKS_CACHE"
id = "YOUR_JWKS_CACHE_ID"  # ← Thay bằng ID bước 4

[[kv_namespaces]]
binding = "TYPING_STATE"
id = "YOUR_TYPING_STATE_ID"  # ← Thay bằng ID bước 4
```

### Bước 6: Cài đặt Secrets

```bash
# Cài đặt Supabase URL
npx wrangler secret put SUPABASE_URL
# Khi được hỏi, nhập: https://dgeadmmbkvcsgizsnbpi.supabase.co

# Cài đặt Supabase Service Key
npx wrangler secret put SUPABASE_SERVICE_KEY
# Khi được hỏi, nhập service role key của con (lấy từ Supabase Dashboard → Settings → API)

# Cài đặt JWT Secret (để xác thực user tokens)
npx wrangler secret put SUPABASE_JWT_SECRET
# Khi được hỏi, nhập JWT secret của con (lấy từ Supabase Dashboard → Settings → API → JWT Settings)
```

### Bước 7: Deploy Worker

```bash
npm run deploy
```

**Output thành công:**
```
Uploaded funchat-api-gateway (2.5 sec)
Published funchat-api-gateway (1.2 sec)
  https://funchat-api-gateway.YOUR-SUBDOMAIN.workers.dev
```

**Ghi lại URL này!** Đây là API Gateway URL của con.

### Bước 8: Kiểm tra

```bash
# Health check
curl https://funchat-api-gateway.YOUR-SUBDOMAIN.workers.dev/health
```

---

## PHẦN 2: Deploy Agora Token Worker

### Bước 1: Lấy Agora Credentials

1. Đăng nhập [console.agora.io](https://console.agora.io/)
2. Tạo Project mới hoặc chọn Project có sẵn
3. Vào **Project Settings**:
   - Copy **App ID**
   - Enable **App Certificate** và copy **Primary Certificate**

### Bước 2: Mở Terminal và vào thư mục

```bash
cd agora-token-worker
```

### Bước 3: Cài đặt dependencies

```bash
npm install
```

### Bước 4: Cài đặt Secrets

```bash
# Cài đặt Agora App ID
npx wrangler secret put AGORA_APP_ID
# Khi được hỏi, nhập App ID từ Agora Console

# Cài đặt Agora App Certificate
npx wrangler secret put AGORA_APP_CERTIFICATE
# Khi được hỏi, nhập Primary Certificate từ Agora Console
```

### Bước 5: Deploy Worker

```bash
npm run deploy
```

**Output thành công:**
```
Uploaded agora-token-worker (1.8 sec)
Published agora-token-worker (0.9 sec)
  https://agora-token-worker.YOUR-SUBDOMAIN.workers.dev
```

**Ghi lại URL này!** Đây là Agora Token Worker URL của con.

### Bước 6: Kiểm tra

```bash
# Health check
curl https://agora-token-worker.YOUR-SUBDOMAIN.workers.dev/
```

---

## PHẦN 3: Cập nhật Frontend để sử dụng Workers

Sau khi deploy xong, con cần cập nhật URLs trong frontend:

### 3.1. Cập nhật API Gateway URL

Thêm vào file `.env`:
```
VITE_API_BASE_URL=https://funchat-api-gateway.YOUR-SUBDOMAIN.workers.dev
```

**Hoặc** nếu không dùng env, URLs mặc định trong code hiện tại là:
- `src/lib/api/index.ts` line 25
- `src/realtime/useSSE.ts` line 18
- `src/lib/api/modules/ai.ts` line 8

### 3.2. Cập nhật Agora Token Worker URL

File `src/hooks/useAgoraCall.tsx` line 11:
```typescript
const AGORA_TOKEN_WORKER_URL = 'https://agora-token-worker.YOUR-SUBDOMAIN.workers.dev';
```

---

## PHẦN 4: Các lệnh hữu ích

### API Gateway

```bash
cd cloudflare-worker

# Xem logs realtime
npm run logs

# Chạy local để test
npm run dev

# Xem danh sách API keys đã cache
npm run kv:list

# Xóa cache API keys
npm run kv:clear-cache
```

### Agora Token Worker

```bash
cd agora-token-worker

# Xem logs realtime
npm run logs

# Chạy local để test
npm run dev

# Test API
npm run test
```

---

## Troubleshooting

### Lỗi "wrangler: command not found"

```bash
npm install -g wrangler
# Hoặc dùng npx wrangler thay cho wrangler
```

### Lỗi "Not logged in"

```bash
npx wrangler login
```

### Lỗi "KV namespace not found"

Kiểm tra lại các ID trong `wrangler.toml` có khớp với output từ bước tạo KV namespaces không.

### Lỗi "Server configuration error" (Agora)

Secrets chưa được set. Chạy lại:
```bash
npm run setup:secrets
```

### API Gateway trả về 500 errors

1. Kiểm tra secrets đã được set đúng chưa:
```bash
npx wrangler secret list
```

2. Xem logs:
```bash
npm run logs
```

---

## Tóm tắt URLs sau khi deploy

| Service | URL Pattern |
|---------|-------------|
| API Gateway | `https://funchat-api-gateway.YOUR-SUBDOMAIN.workers.dev` |
| Agora Token | `https://agora-token-worker.YOUR-SUBDOMAIN.workers.dev` |

Thay `YOUR-SUBDOMAIN` bằng subdomain Cloudflare của con (thường là tên account).

---

## Chi phí

- **Cloudflare Workers**: Free tier = 100,000 requests/ngày
- **KV Storage**: Free tier = 100,000 reads/ngày, 1,000 writes/ngày
- Đủ cho ứng dụng vừa và nhỏ!

