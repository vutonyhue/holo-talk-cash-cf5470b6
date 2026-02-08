
# Kế hoạch Fix: Cập nhật API Gateway URL + Sửa lỗi không tạo được cuộc trò chuyện

## Tóm tắt vấn đề

### 1. API Gateway URL cần cập nhật
- URL hiện tại (fallback): `https://funchat-api-gateway.lequangvu2210-hue.workers.dev`
- URL mới (prod): `https://funchat-api-gateway-prod.lequangvu2210-hue.workers.dev`
- Cần hỗ trợ URL khác nhau cho Preview và Published

### 2. Lỗi "Conversation not found" (đã xác định nguyên nhân gốc)

**Phát hiện quan trọng từ database:**
- User `a9bdd8f9-...` có 29 bản ghi trong `conversation_members`
- Các conversation được tạo thành công (có data trong DB)
- Nhưng API `GET /api-chat/conversations` trả về `conversations: [], total: 0`

**Nguyên nhân:** Edge Function `api-chat` sử dụng Supabase Service Role Key để query, nhưng **RLS vẫn đang filter dựa trên `auth.uid()`** vì query được thực hiện qua REST API với Service Key (không bypass RLS như trong SQL function).

**Bằng chứng:**
- Khi gọi trực tiếp Edge Function với header `x-funchat-user-id`, query vẫn dùng `userId` từ header nhưng RLS policy check `auth.uid()` = NULL (vì không có JWT context)
- Do đó `conversation_members.where(user_id = userId)` trả về empty

---

## Chi tiết các thay đổi

### Phần 1: Cập nhật API Gateway URL

**File:** `src/config/workerUrls.ts`

```typescript
// Sử dụng URL khác nhau cho từng môi trường
const isProduction = window.location.hostname === 'holo-talk-cash.lovable.app';

export const API_BASE_URL = getViteEnv(
  "VITE_API_BASE_URL",
  isProduction 
    ? "https://funchat-api-gateway-prod.lequangvu2210-hue.workers.dev"
    : "https://funchat-api-gateway.lequangvu2210-hue.workers.dev"
);
```

Hoặc đơn giản hóa bằng cách dùng prod URL làm fallback duy nhất nếu muốn thống nhất.

---

### Phần 2: Fix Backend - Edge Function api-chat

**Vấn đề:** Supabase client với Service Role Key qua REST API vẫn bị RLS filter khi policy dùng `auth.uid()`.

**Giải pháp:** Thêm `.rpc()` call hoặc sử dụng `.from().select()` với raw SQL bypass, hoặc đơn giản hơn: **đảm bảo query không phụ thuộc RLS**.

**File:** `supabase/functions/api-chat/index.ts`

**Thay đổi chính:**
1. Tạo Supabase client với Service Role Key và thêm header `Prefer: return=representation`
2. Sử dụng `supabaseAdmin` client thay vì client thông thường
3. Đảm bảo queries bypass RLS bằng cách:
   - Dùng service role client với `Authorization: Bearer <SERVICE_ROLE_KEY>`
   - Không dùng `.auth.getUser()` vì không cần JWT validation (đã validate ở Worker)

```typescript
// Thay đổi cách tạo client
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { 'Prefer': 'return=representation' } }
});
```

Với Service Role Key, RLS sẽ bị bypass hoàn toàn. Cần verify rằng client được khởi tạo đúng cách.

**Debug thêm:** Thêm logging để xem query có trả về data không:

```typescript
console.log('[api-chat] Fetching conversations for userId:', userId);
const { data: memberData, error: memberError } = await supabase
  .from('conversation_members')
  .select('conversation_id')
  .eq('user_id', userId);
console.log('[api-chat] memberData:', memberData, 'error:', memberError);
```

---

### Phần 3: Frontend fallback (đã có, cần cải thiện)

**File:** `src/pages/Chat.tsx`

Fallback đã được implement nhưng cũng bị lỗi vì gọi cùng API `GET /conversations/:id` cũng trả về 404.

**Cải thiện:** Khi tạo conversation thành công, lưu trực tiếp response vào state thay vì fetch lại:

```typescript
// Trong handleNewChat
const result = await createConversation(memberIds, name, isGroup);
if (result.data?.id) {
  // Inject conversation vào local state ngay lập tức
  // thay vì chờ fetchConversations()
  setFallbackConversation(result.data as Conversation);
  setSelectedConversationId(result.data.id);
}
```

---

## Files cần sửa

| File | Thay đổi |
|------|----------|
| `src/config/workerUrls.ts` | Cập nhật fallback URL sang prod, hỗ trợ env-based switching |
| `supabase/functions/api-chat/index.ts` | Thêm logging, verify Service Role bypass RLS |
| `src/pages/Chat.tsx` | Inject conversation data ngay khi tạo thành công |
| `src/hooks/useConversations.tsx` | Trả về full conversation data từ create response |

---

## Luồng sau khi fix

1. User chọn người để chat → `createConversation()` gọi API
2. API `POST /v1/conversations` trả về `{ok:true, data:{id:"...", ...}}`
3. **NEW:** `createConversation` trả về full conversation object
4. **NEW:** `handleNewChat` inject conversation vào fallback state ngay lập tức
5. `selectedConversationId` được set → ChatWindow render ngay với fallback data
6. `fetchConversations()` chạy background, khi có data sẽ replace fallback

---

## Kiểm thử sau khi fix

1. Vào `/chat` trên cả Preview và Published
2. Bấm "+" → tìm user → chọn
3. Dialog đóng ngay, ChatWindow mở được
4. Có thể gửi tin nhắn
5. Reload trang → conversation xuất hiện trong list

---

## Kỹ thuật chi tiết

### Tại sao RLS vẫn filter dù dùng Service Role Key?

Supabase Service Role Key bypass RLS **chỉ khi** client được tạo đúng cách. Nếu có bất kỳ config nào làm client tạo session hoặc attach JWT, RLS sẽ apply.

**Verify bằng cách thêm log:**
```typescript
console.log('[api-chat] Using service role:', !!supabaseServiceKey);
console.log('[api-chat] Client auth:', await supabase.auth.getSession());
```

Nếu `getSession()` trả về session khác null → client đang dùng JWT context → RLS apply.

### Giải pháp triệt để

Tạo fresh client cho mỗi request:

```typescript
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});
```
