
# Kế hoạch Migrate useMessages sang SSE

## ✅ HOÀN THÀNH

**Mục tiêu**: Thay thế Supabase Realtime (`supabase.channel()` với `postgres_changes`) bằng Server-Sent Events (SSE) qua Cloudflare Worker để thống nhất kiến trúc realtime.

### Đã thực hiện:
1. ✅ Xóa toàn bộ `supabase.channel()` subscription
2. ✅ Tích hợp `useMessageStream` hook
3. ✅ Tạo `handleStreamMessage` callback với logic dedup và optimistic update
4. ✅ Export `isConnected`, `isReconnecting`, `reconnect` từ hook
5. ✅ Xóa import `supabase` không cần thiết

## Phân tích hiện trạng

### useMessages.tsx hiện tại (600 lines)
- **Lines 91-190**: Dùng `supabase.channel()` để subscribe postgres_changes
- **Xử lý INSERT**: Fetch sender profile, dedup, replace optimistic message
- **Xử lý UPDATE**: Update message trong state
- **Vấn đề**: Truy cập Supabase trực tiếp, vi phạm kiến trúc API Gateway

### useMessageStream.tsx đã có sẵn (181 lines)
- SSE connection với auto-reconnect (exponential backoff)
- Handle events: `connected`, `message`, `typing`, `close`
- Trạng thái: `isConnected`, `isReconnecting`

### Worker SSE endpoint đã sẵn sàng
- Route: `GET /v1/conversations/:id/stream?token=JWT`
- Polling DB mỗi 1 giây
- Gửi sender profile kèm message
- Heartbeat + typing indicators

## Kế hoạch thực hiện

### Bước 1: Cập nhật useMessages.tsx

**Thay đổi chính**:
1. Import `useMessageStream` hook
2. Tạo `handleStreamMessage` callback để xử lý message từ SSE
3. Xóa toàn bộ `supabase.channel()` subscription (lines 91-190)
4. Thêm useMessageStream với proper callbacks

```text
┌─────────────────────────────────────────────────────────────┐
│ useMessages.tsx (sau khi migrate)                           │
├─────────────────────────────────────────────────────────────┤
│ 1. Fetch initial messages via API                          │
│ 2. useMessageStream(conversationId, {                      │
│      onMessage: handleStreamMessage,                        │
│      onConnect: () => console.log('Connected'),            │
│      onError: (err) => toast.error(...)                    │
│    })                                                       │
│ 3. handleStreamMessage:                                     │
│    - Skip own messages (already via optimistic update)      │
│    - Skip duplicates                                        │
│    - Replace temp messages with real ones                   │
│    - Add new messages from others                           │
│ 4. Keep all send* functions unchanged                       │
└─────────────────────────────────────────────────────────────┘
```

### Bước 2: Cải thiện handleStreamMessage logic

```typescript
const handleStreamMessage = useCallback((streamMessage: Message & { sender?: Profile }) => {
  setMessages(prev => {
    // Case 1: Skip if already exists
    if (prev.some(m => m.id === streamMessage.id)) {
      return prev;
    }

    // Case 2: Own message - replace optimistic with real
    if (streamMessage.sender_id === user?.id) {
      const optimisticMatch = prev.find(m =>
        m._sending &&
        m.sender_id === streamMessage.sender_id &&
        m.content === streamMessage.content
      );
      
      if (optimisticMatch) {
        return prev.map(m =>
          m.id === optimisticMatch.id
            ? { ...streamMessage, _sending: false }
            : m
        );
      }
      // Already handled by API response, skip
      return prev;
    }

    // Case 3: Message from others - add to list
    return [...prev, streamMessage];
  });
}, [user?.id]);
```

### Bước 3: Thêm connection status feedback

- Hiển thị indicator khi đang reconnect
- Toast error khi mất kết nối quá lâu

### Bước 4: Loại bỏ Supabase import không cần thiết

Sau khi migrate xong, kiểm tra và loại bỏ:
```typescript
// XÓA:
import { supabase } from '@/integrations/supabase/client';

// Nếu còn dùng cho fetch profile fallback, có thể giữ hoặc chuyển sang API
```

## Chi tiết kỹ thuật

### Files cần sửa

| File | Thay đổi |
|------|----------|
| `src/hooks/useMessages.tsx` | Thay Supabase Realtime bằng useMessageStream |

### Code changes cụ thể

**Xóa (lines 91-190)**:
```typescript
// Xóa toàn bộ useEffect với supabase.channel()
useEffect(() => {
  if (!conversationId || !user) return;
  const channel = supabase.channel(`messages:${conversationId}`)...
  return () => supabase.removeChannel(channel);
}, [conversationId, user, userProfile]);
```

**Thêm mới**:
```typescript
import { useMessageStream } from './useMessageStream';

// Trong hook useMessages:
const handleStreamMessage = useCallback((streamMessage: StreamMessage) => {
  // Logic xử lý message từ SSE
}, [user?.id, userProfile]);

const { isConnected, isReconnecting, reconnect } = useMessageStream(
  conversationId,
  {
    onMessage: handleStreamMessage,
    onTyping: (users) => {
      // Optional: có thể expose typing users nếu cần
    },
    onConnect: () => {
      console.log('[useMessages] SSE connected');
    },
    onDisconnect: () => {
      console.log('[useMessages] SSE disconnected');
    },
    onError: (error) => {
      console.error('[useMessages] SSE error:', error);
    },
  }
);
```

### Return value mới

```typescript
return {
  messages,
  loading,
  sendMessage,
  sendCryptoMessage,
  sendImageMessage,
  sendVoiceMessage,
  deleteMessage,
  retryMessage,
  fetchMessages,
  // NEW: SSE connection status
  isConnected,
  isReconnecting,
  reconnect,
};
```

## Luồng dữ liệu sau khi migrate

```text
User A gửi tin nhắn
       │
       ▼
[Frontend] optimistic update → hiển thị ngay
       │
       ▼
[API] POST /v1/conversations/:id/messages
       │
       ▼
[Edge Function] Insert vào DB
       │
       ▼
[SSE Polling] Worker poll DB mỗi 1s
       │
       ├──► User A: skip (đã có từ optimistic)
       │
       └──► User B: receive qua SSE → add to state
```

## Lợi ích

1. **Thống nhất kiến trúc**: Mọi data flow qua API Gateway
2. **Không cần Supabase Realtime**: Giảm phụ thuộc, dễ scale
3. **Kiểm soát tốt hơn**: Rate limiting, logging tại Worker
4. **Đơn giản hơn**: Không cần quản lý Supabase channel subscriptions

## Rủi ro và mitigation

| Rủi ro | Giải pháp |
|--------|-----------|
| SSE polling chậm hơn Realtime | Poll interval 1s đã đủ nhanh cho chat |
| Worker CPU limit | SSE max 5 phút, auto-reconnect |
| Message bị miss khi reconnect | fetchMessages() load lại khi reconnect |
