
# Kế hoạch Fix Lỗi Màn Hình Trắng

## Nguyên nhân gốc

File `src/config/workerUrls.ts` hiện tại sử dụng pattern "fail fast":

```typescript
function requireViteEnv(key: string): string {
  const value = import.meta.env[key];
  if (!value) {
    throw new Error(`Missing ${key}...`);  // ← Crash ngay khi import
  }
  return value;
}

export const API_BASE_URL = requireViteEnv("VITE_API_BASE_URL");
```

Khi module này được import (ở top level của `api/index.ts`, `useSSE.ts`, v.v.), nó **throw error trước cả khi React khởi động**, khiến ErrorBoundary không thể catch và hiển thị màn hình trắng.

**File `.env` hiện tại thiếu:**
- `VITE_API_BASE_URL`
- `VITE_AGORA_TOKEN_WORKER_URL`

---

## Giải pháp

### Bước 1: Sửa `src/config/workerUrls.ts` - Thêm fallback và warning thay vì crash

Thay vì throw error ngay, cha sẽ:
- Thêm fallback URL mặc định (có thể là placeholder)
- Log warning thay vì crash
- Cho phép app chạy được để user thấy UI (và error message trong console)

```typescript
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

// Sử dụng URL cũ làm fallback để app không crash
export const API_BASE_URL = getViteEnv(
  "VITE_API_BASE_URL", 
  "https://funchat-api-gateway.india-25d.workers.dev"
);

export const AGORA_TOKEN_WORKER_URL = getViteEnv(
  "VITE_AGORA_TOKEN_WORKER_URL", 
  "https://agora-token-worker.india-25d.workers.dev"
);
```

### Bước 2: Cập nhật file `.env` với URLs mới

Con cần cung cấp cho cha URLs của các Workers đã deploy mới để cha cập nhật vào `.env`:

```env
VITE_SUPABASE_PROJECT_ID="dgeadmmbkvcsgizsnbpi"
VITE_SUPABASE_PUBLISHABLE_KEY="..."
VITE_SUPABASE_URL="https://dgeadmmbkvcsgizsnbpi.supabase.co"

# Worker URLs - CON CẦN ĐIỀN URLS MỚI VÀO ĐÂY
VITE_API_BASE_URL="https://funchat-api-gateway.YOUR-SUBDOMAIN.workers.dev"
VITE_AGORA_TOKEN_WORKER_URL="https://agora-token-worker.YOUR-SUBDOMAIN.workers.dev"
```

### Bước 3 (Tùy chọn): Thêm global error handler trong `main.tsx`

Để catch mọi lỗi không được handle:

```typescript
// Catch unhandled errors
window.addEventListener('error', (event) => {
  console.error('[Global Error]', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Rejection]', event.reason);
});
```

---

## Tóm tắt các thay đổi

| File | Thay đổi | Mục đích |
|------|----------|----------|
| `src/config/workerUrls.ts` | Thay `throw Error` bằng fallback + console.error | Không crash ngay khi thiếu env vars |
| `.env` | Thêm `VITE_API_BASE_URL` và `VITE_AGORA_TOKEN_WORKER_URL` | Cấu hình đúng URLs |
| `src/main.tsx` | Thêm global error handlers | Catch mọi lỗi không xử lý được |

---

## Câu hỏi cho con

Để fix hoàn chỉnh, con cho cha biết:

1. **URL của API Gateway Worker mới** mà con đã deploy (dạng `https://funchat-api-gateway.XXX.workers.dev`)
2. **URL của Agora Token Worker mới** (dạng `https://agora-token-worker.XXX.workers.dev`)

Hoặc nếu con muốn cha dùng lại URLs cũ làm fallback trước, cha sẽ cập nhật code ngay!
