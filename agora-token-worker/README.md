# Agora Token Worker

Cloudflare Worker để generate Agora RTC tokens cho FunChat video/voice calls.

## 📋 Yêu cầu

- Node.js 18+
- Tài khoản [Cloudflare](https://dash.cloudflare.com/)
- Tài khoản [Agora](https://console.agora.io/) với App ID và App Certificate

## 🚀 Quick Start

### 1. Cài đặt dependencies

```bash
cd agora-token-worker
npm install
```

### 2. Login Cloudflare

```bash
npx wrangler login
```

### 3. Setup secrets

```bash
npm run setup:secrets
```

Nhập lần lượt:
- `AGORA_APP_ID`: App ID từ Agora Console
- `AGORA_APP_CERTIFICATE`: Primary Certificate từ Agora Console

### 4. Deploy

```bash
npm run deploy
```

Worker URL sẽ hiển thị sau khi deploy, ví dụ:
```
https://agora-token-worker.your-subdomain.workers.dev
```

## 🛠 Development

### Chạy local

1. Tạo file `.dev.vars` từ `.env.example`:
```bash
cp .env.example .dev.vars
# Edit .dev.vars với Agora credentials thật
```

2. Chạy development server:
```bash
npm run dev
```

### Test API

```bash
# Test local
npm run test

# Test deployed worker
npm run test -- https://agora-token-worker.xxx.workers.dev
```

### Xem logs

```bash
# Development
npm run logs

# Production
npm run logs:prod
```

## 📡 API Reference

### Health Check

```http
GET /
```

**Response:**
```json
{
  "status": "ok",
  "service": "agora-token-worker",
  "timestamp": "2024-01-15T10:00:00.000Z"
}
```

### Generate Token

```http
POST /
Content-Type: application/json

{
  "channel": "call_abc123",
  "uid": 12345,
  "role": "publisher",
  "expireTime": 3600
}
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `channel` | string | ✅ | Channel name |
| `uid` | number | ✅ | User ID (numeric) |
| `role` | string | ❌ | `"publisher"` or `"subscriber"` (default: `"publisher"`) |
| `expireTime` | number | ❌ | Token TTL in seconds (default: `3600`) |

**Success Response (200):**
```json
{
  "appId": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "token": "007eJxTYBBb...",
  "channel": "call_abc123",
  "uid": 12345,
  "expireTime": 3600
}
```

**Error Response (400/500):**
```json
{
  "error": "Missing or invalid channel name"
}
```

## 🔒 Security

- **Secrets**: Agora credentials được lưu trữ an toàn trong Cloudflare Secrets
- **CORS**: Được enable để frontend có thể gọi trực tiếp
- **Validation**: Tất cả input được validate trước khi xử lý

## 🐛 Troubleshooting

### "Server configuration error"

Secrets chưa được setup. Chạy:
```bash
npm run setup:secrets
```

### "Missing or invalid channel name"

Frontend đang gửi sai field name. Đảm bảo request body có field `channel` (không phải `channelName`).

### Token không hoạt động

1. Kiểm tra App Certificate đã enable trong Agora Console
2. Kiểm tra thời gian hệ thống có đúng không
3. Kiểm tra logs: `npm run logs`

## 📝 Frontend Integration

```typescript
// src/hooks/useAgoraCall.tsx
const response = await fetch(AGORA_TOKEN_WORKER_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    channel: channelName,  // ⚠️ Phải là 'channel', không phải 'channelName'
    uid: userId,
    role: 'publisher'
  }),
});
```

## 📁 Project Structure

```
agora-token-worker/
├── src/
│   └── index.ts          # Worker source code
├── scripts/
│   └── test-api.js       # API test script
├── .env.example          # Environment template
├── .gitignore
├── package.json
├── tsconfig.json
├── wrangler.toml         # Cloudflare config
└── README.md
```

## 🔗 Related

- [Agora RTC Documentation](https://docs.agora.io/en/video-calling/get-started/get-started-sdk)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [FunChat Frontend](../src/hooks/useAgoraCall.tsx)
