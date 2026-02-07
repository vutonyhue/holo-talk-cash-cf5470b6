
# Kế hoạch: Hoàn thiện SSE Realtime Thống nhất cho FunChat

## Tổng quan hiện trạng

### ✅ Đã hoàn thành (SSE đã sẵn sàng)
- **useMessageStream.tsx** - SSE hook với auto-reconnect, exponential backoff
- **useMessages.tsx** - Đã tích hợp SSE cho messages
- **useTypingIndicator.tsx** - Đã dùng API, nhận data từ SSE
- **useReactions.tsx** - Đã dùng API (chưa realtime từ SSE)
- **useReadReceipts.tsx** - Đã dùng API (chưa realtime từ SSE)
- **Cloudflare Worker** - SSE endpoint `/v1/conversations/:id/stream` hoạt động

### ⚠️ Còn sử dụng Supabase Realtime
- **useCallSignaling.tsx** - Dùng `supabase.channel('call-signaling')` cho call sessions
- **ChatWindow.tsx** - Một số thao tác trực tiếp Supabase (mute, delete, forward)

### ❌ Thiếu
- Unified event types
- SSE connection status UI
- ErrorBoundary cho graceful fallback
- Reactions & Read Receipts qua SSE

---

## Kế hoạch thực hiện

### Phase 1: Tạo Event Types Thống nhất

**File mới: `src/realtime/events.ts`**

```typescript
// SSE Event Types
export type SSEEventType = 
  | 'message:new'
  | 'message:update'
  | 'message:delete'
  | 'typing'
  | 'reaction:added'
  | 'reaction:removed'
  | 'read_receipt'
  | 'ping'
  | 'connected'
  | 'close';

export interface SSEMessage {
  event: SSEEventType;
  data: unknown;
  timestamp: number;
}

export interface MessageEvent {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
  sender?: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

export interface TypingEvent {
  user_id: string;
  user_name: string;
  timestamp: number;
}

export interface ReactionEvent {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface ReadReceiptEvent {
  message_id: string;
  user_id: string;
  read_at: string;
}
```

---

### Phase 2: Nâng cấp useSSE Hook

**Cập nhật: `src/hooks/useMessageStream.tsx` → `src/realtime/useSSE.ts`**

Thay đổi chính:
1. Thêm event types cho reactions và read receipts
2. Expose connection status
3. Thêm event emitter pattern

```typescript
// Key changes
interface UseSSEOptions {
  onMessage?: (message: MessageEvent) => void;
  onMessageUpdate?: (message: MessageEvent) => void;
  onTyping?: (users: TypingEvent[]) => void;
  onReactionAdded?: (reaction: ReactionEvent) => void;
  onReactionRemoved?: (reaction: ReactionEvent) => void;
  onReadReceipt?: (receipt: ReadReceiptEvent) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

// Return connection status for UI
return {
  isConnected,
  isReconnecting,
  reconnect,
  disconnect,
  connectionStatus: isConnected ? 'connected' : isReconnecting ? 'reconnecting' : 'offline',
};
```

---

### Phase 3: Cập nhật Cloudflare Worker SSE Endpoint

**Cập nhật: `cloudflare-worker/src/index.ts`**

Thêm polling cho reactions và read_receipts vào SSE stream:

```typescript
// Inside poll() function, after messages polling:

// Poll reactions
const reactionsRes = await fetch(
  `${env.SUPABASE_URL}/rest/v1/message_reactions?message_id=in.(${messageIds})&order=created_at.desc&limit=20`,
  { headers: { ... } }
);
if (reactionsRes.ok) {
  const reactions = await reactionsRes.json();
  // Send new reactions
  for (const reaction of reactions) {
    if (isNewReaction(reaction)) {
      await writer.write(encoder.encode(
        `event: reaction:added\ndata: ${JSON.stringify(reaction)}\n\n`
      ));
    }
  }
}

// Poll read receipts
const receiptsRes = await fetch(
  `${env.SUPABASE_URL}/rest/v1/message_read_receipts?message_id=in.(${messageIds})&order=read_at.desc&limit=20`,
  { headers: { ... } }
);
if (receiptsRes.ok) {
  const receipts = await receiptsRes.json();
  for (const receipt of receipts) {
    if (isNewReceipt(receipt)) {
      await writer.write(encoder.encode(
        `event: read_receipt\ndata: ${JSON.stringify(receipt)}\n\n`
      ));
    }
  }
}
```

---

### Phase 4: Thêm Connection Status UI

**File mới: `src/components/chat/ConnectionStatus.tsx`**

```typescript
interface ConnectionStatusProps {
  status: 'connected' | 'reconnecting' | 'offline';
}

export function ConnectionStatus({ status }: ConnectionStatusProps) {
  if (status === 'connected') return null;
  
  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium",
      status === 'reconnecting' 
        ? "bg-yellow-500/10 text-yellow-600" 
        : "bg-destructive/10 text-destructive"
    )}>
      {status === 'reconnecting' ? (
        <>
          <Loader2 className="w-3 h-3 animate-spin" />
          Đang kết nối lại...
        </>
      ) : (
        <>
          <WifiOff className="w-3 h-3" />
          Mất kết nối
        </>
      )}
    </div>
  );
}
```

**Tích hợp vào ChatWindow.tsx:**
- Hiển thị badge trong header khi không phải 'connected'
- Không block UI, chỉ thông báo

---

### Phase 5: ErrorBoundary & Graceful Fallback

**File mới: `src/components/ErrorBoundary.tsx`**

```typescript
class ErrorBoundary extends React.Component<Props, State> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8">
          <AlertTriangle className="w-16 h-16 text-destructive mb-4" />
          <h2 className="text-xl font-bold mb-2">Đã xảy ra lỗi</h2>
          <p className="text-muted-foreground mb-4">
            Ứng dụng gặp sự cố. Vui lòng thử lại.
          </p>
          <Button onClick={() => window.location.reload()}>
            Tải lại trang
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

**Wrap App.tsx:**
```typescript
<ErrorBoundary>
  <BrowserRouter>
    <Routes>...</Routes>
  </BrowserRouter>
</ErrorBoundary>
```

---

### Phase 6: Migrate useCallSignaling (Tùy chọn)

**Lựa chọn cho Call Signaling:**

| Option | Ưu điểm | Nhược điểm |
|--------|---------|------------|
| **A: Giữ Supabase Realtime** | Latency thấp nhất (~50ms), Đã hoạt động | Không thống nhất kiến trúc |
| **B: Migrate sang SSE riêng** | Thống nhất kiến trúc | Latency cao hơn (~1s), Phức tạp |
| **C: WebSocket qua Worker** | Latency tốt, Thống nhất | Cần Durable Objects |

**Đề xuất: Giữ Option A (Supabase Realtime cho calls)**
- Call signaling cần latency thấp (< 100ms)
- SSE polling 1s không phù hợp cho "ringing" experience
- Đây là use case hợp lệ cho Supabase Realtime

---

### Phase 7: Refactor Remaining Direct Supabase Calls

**ChatWindow.tsx - Lines 152-169, 392-431:**

Thay thế:
```typescript
// OLD
const { data } = await supabase.from('conversation_members')...

// NEW  
const response = await api.conversations.getMuteStatus(conversation.id);
```

Cần thêm API endpoints:
- `api.conversations.getMuteStatus()`
- `api.conversations.setMuteStatus()`
- `api.conversations.leave()` (thay cho delete member)
- `api.messages.forward()`

---

## Files cần tạo/sửa

### Files mới (4 files):
1. `src/realtime/events.ts` - Event type definitions
2. `src/realtime/useSSE.ts` - Enhanced SSE hook (refactor từ useMessageStream)
3. `src/components/chat/ConnectionStatus.tsx` - Connection badge
4. `src/components/ErrorBoundary.tsx` - Error fallback

### Files cần sửa (5 files):
1. `cloudflare-worker/src/index.ts` - Thêm reactions/receipts vào SSE
2. `src/hooks/useReactions.tsx` - Subscribe SSE events
3. `src/hooks/useReadReceipts.tsx` - Subscribe SSE events
4. `src/components/chat/ChatWindow.tsx` - Thêm ConnectionStatus, migrate direct Supabase
5. `src/App.tsx` - Wrap với ErrorBoundary

### Files có thể xóa (1 file):
1. `src/hooks/useMessageStream.tsx` - Merge vào useSSE.ts

---

## Luồng dữ liệu sau khi hoàn thành

```text
User Action (typing/send/react/read)
        │
        ▼
[API Gateway] POST /v1/... 
        │
        ▼
[Edge Function] Write to DB
        │
        ▼
[SSE Polling - 1s interval]
        │
        ├─► event: message:new
        ├─► event: typing  
        ├─► event: reaction:added
        └─► event: read_receipt
                │
                ▼
[useSSE Hook] Dispatch to handlers
        │
        ├─► useMessages → setMessages()
        ├─► useTypingIndicator → setTypingUsers()
        ├─► useReactions → updateReactionsFromStream()
        └─► useReadReceipts → updateReadReceiptsFromStream()
```

---

## Token Security cho SSE

Hiện tại đã implement an toàn:

```typescript
// Token passed as query param (EventSource không hỗ trợ headers)
const url = `${API_BASE_URL}/v1/conversations/${id}/stream?token=${encodeURIComponent(accessToken)}`;

// Worker validates token before streaming
const authResult = await verifyAuthHeader(`Bearer ${token}`, env);
if (!authResult) {
  return errorResponse('UNAUTHORIZED', ...);
}

// Verify user is member of conversation
const memberCheck = await fetch(...);
if (members.length === 0) {
  return errorResponse('FORBIDDEN', 'Not a member', 403, ...);
}
```

**Đã có:**
- Token validation
- Conversation membership check
- 5-minute max connection (auto-reconnect)

---

## Ước lượng công việc

| Phase | Độ phức tạp | Ước lượng |
|-------|-------------|-----------|
| 1. Event Types | Thấp | 15 phút |
| 2. useSSE Hook | Trung bình | 30 phút |
| 3. Worker SSE Update | Trung bình | 45 phút |
| 4. Connection Status UI | Thấp | 20 phút |
| 5. ErrorBoundary | Thấp | 15 phút |
| 6. Call Signaling | Giữ nguyên | 0 phút |
| 7. Migrate ChatWindow | Trung bình | 30 phút |

**Tổng: ~2.5 giờ**

---

## Rủi ro & Mitigation

| Rủi ro | Mitigation |
|--------|------------|
| SSE fail → white screen | ErrorBoundary + graceful UI fallback |
| Missing events khi reconnect | fetchMessages/fetchReactions khi reconnect |
| Polling tốn tài nguyên | Chỉ poll khi có active connection, cleanup đúng |
| Token expire trong SSE | Auto-reconnect với fresh token |

---

## Kết quả mong đợi

1. **Không còn supabase.channel() cho chat** (chỉ giữ cho calls)
2. **UI không bị white-screen** khi SSE fail
3. **Connection status badge** hiển thị trạng thái
4. **Reactions & Read Receipts** cập nhật realtime qua SSE
5. **Chat send, emoji, image upload** vẫn hoạt động bình thường
