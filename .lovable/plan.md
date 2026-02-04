
# Đánh giá toàn diện dự án FunChat

## A. Tổng quan kiến trúc hiện tại

```text
Frontend (Vite/React)
         │
         ▼
Cloudflare Worker (API Gateway)
         │
         ├──► Supabase Edge Functions (api-chat, api-users, api-calls, ...)
         │
         └──► Supabase Database + RLS
```

**Nhận xét**: Kiến trúc tốt, nhưng quá trình refactor sang API Gateway chưa hoàn thiện.

---

## B. Vấn đề đã phát hiện

### 1. LỖI CHÍNH: Endpoint findDirectConversation chưa được triển khai

**Console log hiển thị**:
```text
GET /v1/conversations/direct/5066bf54-0e43-4200-bd9e-0d53d5b89c1a → 404 (Conversation not found)
TypeError: Cannot read properties of undefined (reading 'map')
```

**Nguyên nhân**:
- Frontend gọi `api.conversations.findDirectConversation(otherUserId)` 
- Route `/v1/conversations/direct/:userId` chưa tồn tại trong Worker routing
- Edge Function `api-chat` cũng chưa xử lý route này
- Kết quả: trả về 404, gây lỗi `undefined.map()` trong useConversations

### 2. API Response Format không nhất quán

**Vấn đề**:
- `api-chat` trả `{ ok: true, data: [...] }` với data là array trực tiếp
- Frontend `useConversations` expect `response.data.conversations`
- Gây lỗi `undefined.map()` khi parse

### 3. Video Call - Vẫn dùng Supabase trực tiếp

**File Chat.tsx (line 190-225)**:
```typescript
const { data: existingConv } = await supabase
  .from('conversations')
  .select('...')
  .eq('is_group', false)
  ...
```
- Vẫn truy cập Supabase trực tiếp thay vì qua Worker API
- Vi phạm kiến trúc API Gateway đã thiết kế

### 4. useCallSignaling dùng Supabase trực tiếp

- Gọi `supabase.from('call_sessions').insert/update/...`
- Gọi `supabase.from('messages').insert(...)` để gửi tin nhắn cuộc gọi
- Chưa route qua `api.calls` module

### 5. Realtime Subscriptions

- useMessages vẫn dùng `supabase.channel()` (Supabase Realtime)
- Chưa migrate sang SSE endpoint đã tạo
- Có thể hoạt động nhưng không nhất quán với kiến trúc mới

---

## C. Database Schema (Đánh giá tốt)

### Tables hiện có:
| Table | Mô tả | Trạng thái |
|-------|-------|------------|
| profiles | Thông tin user | OK |
| conversations | Cuộc trò chuyện | OK |
| conversation_members | Thành viên | OK |
| messages | Tin nhắn | OK |
| message_reactions | Emoji reactions | OK |
| message_reads | Đã đọc | OK |
| call_sessions | Phiên gọi | OK |
| call_participants | Người tham gia | OK |
| api_keys | API keys cho SDK | OK |
| webhooks | Webhook configs | OK |

**Nhận xét**: Schema thiết kế tốt, có đủ các bảng cần thiết.

---

## D. Kế hoạch sửa chữa

### Phase 1: Fix lỗi nghiêm trọng (Không mở được conversation)

#### 1.1. Thêm route findDirectConversation vào Edge Function

**File**: `supabase/functions/api-chat/index.ts`

Thêm route mới để xử lý:
- `GET /api-chat/conversations/direct/:userId`
- Tìm conversation 1-1 giữa current user và target user
- Trả về conversation nếu tồn tại, null nếu không

#### 1.2. Cập nhật Worker routing

**File**: `cloudflare-worker/src/index.ts`

Route `/v1/conversations/direct/:userId` cần được map sang `/api-chat/conversations/direct/:userId`

#### 1.3. Fix API response format

**File**: `supabase/functions/api-chat/index.ts`

Thống nhất response format:
- GET /conversations trả `{ ok: true, data: { conversations: [...], total: N } }`
- GET /conversations/:id/messages trả `{ ok: true, data: { messages: [...] } }`

---

### Phase 2: Fix Video Call

#### 2.1. Refactor Chat.tsx

Thay thế Supabase trực tiếp bằng API calls:
```typescript
// Thay:
const { data } = await supabase.from('conversations').select(...)

// Bằng:
const response = await api.conversations.findDirectConversation(userId)
const response = await api.conversations.create({ member_ids: [...] })
```

#### 2.2. Refactor useCallSignaling

Chuyển sang dùng `api.calls` module:
```typescript
// Thay:
await supabase.from('call_sessions').insert(...)

// Bằng:
await api.calls.start({ conversation_id, call_type })
await api.calls.accept(callId)
await api.calls.reject(callId)
await api.calls.end(callId)
```

#### 2.3. Thêm endpoint vào api-calls Edge Function

Bổ sung các routes còn thiếu trong `supabase/functions/api-calls/index.ts`:
- `POST /api-calls` - Start call
- `PATCH /api-calls/:id` - Update status
- `GET /api-calls/:id` - Get call info
- `GET /api-calls/history` - Call history

---

### Phase 3: Thống nhất Realtime

#### 3.1. Migrate useMessages sang SSE

Thay Supabase channel subscription bằng useMessageStream hook đã tạo

#### 3.2. Migrate useTypingIndicator

Dùng `api.conversations.sendTyping()` thay vì Supabase broadcast

---

## E. Gợi ý nâng cấp chuyên nghiệp

### 1. Error Handling thống nhất
- Tạo error boundary component
- Retry logic với exponential backoff
- Offline indicator và queue messages

### 2. Performance
- Implement message pagination (infinite scroll)
- Image lazy loading
- Virtual scrolling cho conversation list lớn

### 3. UX Improvements
- Message delivery status (sent/delivered/read)
- Typing indicators hiển thị mượt hơn
- Skeleton loading states

### 4. Call Quality
- Network quality indicator
- Auto-reconnect khi mất kết nối
- Call duration display realtime

### 5. Push Notifications
- Web Push cho tin nhắn mới
- Incoming call notifications

---

## F. Files cần chỉnh sửa

| File | Thay đổi |
|------|----------|
| `supabase/functions/api-chat/index.ts` | Thêm route direct conversation, fix response format |
| `cloudflare-worker/src/index.ts` | Thêm routing cho direct conversation |
| `src/hooks/useConversations.tsx` | Fix parse response |
| `src/pages/Chat.tsx` | Thay Supabase bằng API calls |
| `src/hooks/useCallSignaling.tsx` | Refactor dùng api.calls |
| `supabase/functions/api-calls/index.ts` | Bổ sung endpoints còn thiếu |
| `src/hooks/useMessages.tsx` | Migrate sang SSE (optional Phase 3) |

---

## G. Thứ tự triển khai

1. **Bước 1**: Fix endpoint findDirectConversation (Edge Function + Worker)
2. **Bước 2**: Fix response format trong api-chat
3. **Bước 3**: Cập nhật useConversations parse logic
4. **Bước 4**: Refactor Chat.tsx bỏ Supabase trực tiếp
5. **Bước 5**: Refactor useCallSignaling
6. **Bước 6**: Test toàn bộ flow: mở conversation, gửi tin nhắn, video call

---

## H. Tóm tắt

**Vấn đề chính**: Endpoint `/v1/conversations/direct/:userId` chưa được triển khai, gây lỗi 404 và crash UI khi mở conversation.

**Video call**: Vẫn hoạt động (Agora đã setup đúng) nhưng cần refactor để nhất quán với kiến trúc API Gateway.

**Database**: Thiết kế tốt, không cần thay đổi.

**Ưu tiên**: Fix lỗi mở conversation trước (Phase 1), sau đó clean up code (Phase 2-3).
