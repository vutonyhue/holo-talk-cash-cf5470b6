

# Cập nhật Worker URLs mới

## Thông tin URLs

| Service | URL mới |
|---------|---------|
| API Gateway | `https://funchat-api-gateway.lequangvu2210-hue.workers.dev` |
| Agora Token Worker | `https://agora-token-worker.lequangvu2210-hue.workers.dev` |

---

## Thay đổi cần thực hiện

### File: `src/config/workerUrls.ts`

Cập nhật fallback URLs với URLs mới của con:

```typescript
// Fallback URLs - updated with new worker URLs
export const API_BASE_URL = getViteEnv(
  "VITE_API_BASE_URL",
  "https://funchat-api-gateway.lequangvu2210-hue.workers.dev"
);

export const AGORA_TOKEN_WORKER_URL = getViteEnv(
  "VITE_AGORA_TOKEN_WORKER_URL",
  "https://agora-token-worker.lequangvu2210-hue.workers.dev"
);
```

---

## Tóm tắt

| File | Thay đổi |
|------|----------|
| `src/config/workerUrls.ts` | Cập nhật 2 fallback URLs với subdomain `lequangvu2210-hue` |

Sau khi cập nhật xong, app sẽ kết nối đến Workers mới của con!

