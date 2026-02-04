# FunChat - Trạng thái triển khai

## ✅ Đã hoàn thành

### Phase 1: Fix Conversations
- [x] Thêm route `/conversations/direct/:userId` vào `api-chat` Edge Function
- [x] Fix response format: trả về `{ conversations: [...], total: N }`
- [x] Cập nhật `useConversations.tsx` để handle cả 2 format response

### Phase 2: Fix Video Call  
- [x] Refactor `Chat.tsx` - thay Supabase trực tiếp bằng `api.conversations`
- [x] Refactor `useCallSignaling.tsx` - dùng `api.calls` module
- [x] Cập nhật `api-calls` Edge Function với các routes:
  - POST `/api-calls` - Start call
  - PATCH `/api-calls/:id` - Update status (accept/reject/end)
  - GET `/api-calls/:id` - Get call info
  - GET `/api-calls/history` - Call history
  - POST `/api-calls/:id/message` - Send call message

### API Architecture
```
Frontend (React)
     │
     ▼
Cloudflare Worker (API Gateway)
     │  - JWT verification
     │  - Rate limiting
     │  - Route mapping
     ▼
Supabase Edge Functions
     │  - api-chat
     │  - api-calls
     │  - api-users
     ▼
Supabase Database (+ RLS)
```

## 🔄 Còn lại (Optional)

### Phase 3: Migrate Realtime
- [ ] Migrate `useMessages` sang SSE (hook `useMessageStream` đã có sẵn)
- [ ] Migrate `useTypingIndicator` sang API (endpoint đã có sẵn)

### Gợi ý nâng cấp
- Infinite scroll pagination
- Message delivery status
- Web Push notifications
- Offline queue messages
