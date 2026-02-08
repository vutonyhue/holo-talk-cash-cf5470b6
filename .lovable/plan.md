
## Kế hoạch Fix: Chat Window không mở được sau khi tạo cuộc trò chuyện

### Nguyên nhân gốc rễ (đã xác định qua log)

**Timeline của lỗi:**
1. User bấm chọn người → `handleDirectChat()` gọi `onCreate()`
2. API `POST /v1/conversations` → trả về `{ok:true, data:{id:"..."}}`  ✅
3. `handleNewChat()` nhận được `result.data.id` → `setSelectedConversationId(id)` ✅
4. `fetchConversations()` được gọi
5. API `GET /v1/conversations` → **trả về `{conversations:[], total:0}`** ❌
6. `conversations` state = rỗng
7. `selectedConversation = conversations.find(c => c.id === selectedConversationId)` = **null**
8. UI check `if (selectedConversation)` = false → **không render ChatWindow**
9. Dialog đóng nhưng user thấy màn hình welcome, không phải chat

**Bằng chứng từ log:**
```
Response Body: {"ok":true,"data":{"conversations":[],"total":0}}
```

### Giải pháp: Fallback fetch conversation by ID

Khi `selectedConversationId` có giá trị nhưng không tìm thấy trong `conversations` list, **frontend sẽ tự fetch conversation đó bằng ID** và sử dụng làm fallback.

---

### Chi tiết thay đổi

#### 1. `src/pages/Chat.tsx` - Thêm fallback conversation state và logic

**Thêm state mới:**
```typescript
const [fallbackConversation, setFallbackConversation] = useState<Conversation | null>(null);
```

**Thêm useEffect để fetch fallback:**
```typescript
useEffect(() => {
  // Nếu có selectedConversationId nhưng không tìm thấy trong list
  if (selectedConversationId && !conversations.find(c => c.id === selectedConversationId)) {
    // Fetch conversation by ID as fallback
    api.conversations.get(selectedConversationId).then(response => {
      if (response.ok && response.data) {
        setFallbackConversation(response.data as Conversation);
      }
    });
  } else {
    setFallbackConversation(null);
  }
}, [selectedConversationId, conversations]);
```

**Cập nhật logic derive `selectedConversation`:**
```typescript
// Ưu tiên từ list, fallback từ fetch trực tiếp
const selectedConversation = selectedConversationId 
  ? conversations.find(c => c.id === selectedConversationId) || fallbackConversation
  : null;
```

---

#### 2. Cải thiện UX: Loading state khi đang fetch fallback

Thêm loading indicator nếu:
- `selectedConversationId` có giá trị
- `selectedConversation` chưa có (đang fetch)

```typescript
const [fetchingFallback, setFetchingFallback] = useState(false);

// Trong useEffect fetch fallback:
setFetchingFallback(true);
try {
  const response = await api.conversations.get(selectedConversationId);
  // ...
} finally {
  setFetchingFallback(false);
}
```

Trong `renderMainView()`:
```typescript
if (selectedConversationId && !selectedConversation && fetchingFallback) {
  return <LoadingSpinner message="Đang tải cuộc trò chuyện..." />;
}
```

---

### Luồng sau khi fix

1. User bấm chọn người → tạo conversation thành công
2. `selectedConversationId` được set
3. `fetchConversations()` trả về rỗng (bug backend)
4. **NEW:** useEffect phát hiện `selectedConversationId` không có trong list
5. **NEW:** Gọi `api.conversations.get(id)` để lấy chi tiết
6. **NEW:** Set `fallbackConversation`
7. `selectedConversation = fallbackConversation` → có giá trị
8. `ChatWindow` được render ✅

---

### Files thay đổi

| File | Thay đổi |
|------|----------|
| `src/pages/Chat.tsx` | Thêm fallback state, useEffect fetch by ID, cập nhật derive logic |

---

### Lợi ích của giải pháp

1. **Không phụ thuộc backend fix** - Frontend tự xử lý edge case
2. **Backward compatible** - Nếu backend trả về đúng, fallback không cần dùng
3. **UX tốt hơn** - User không bị stuck ở màn hình welcome
4. **Dễ debug** - Log rõ ràng khi nào dùng fallback

---

### Kiểm thử sau khi fix

1. Vào `/chat` → bấm "+" → chọn user
2. Dialog đóng
3. **ChatWindow mở được** (dù conversations list rỗng)
4. Có thể gửi tin nhắn
5. Reload trang → conversation xuất hiện trong list (nếu backend đã fix)
