
## Mục tiêu
1) Sửa lỗi build TypeScript để app chạy lại được ngay.  
2) Sau khi chạy được, đảm bảo “bấm vào tên bạn bè/người dùng” sẽ tạo (hoặc mở) cuộc trò chuyện và vào được màn chat.

---

## Tình trạng hiện tại (đã xác nhận qua lỗi build)
Build đang fail ở:

- `src/components/chat/NewChatDialog.tsx(84,38)`
- `src/components/chat/NewChatDialog.tsx(121,75)`

Lý do: prop `onCreate` đang được type là:

```ts
onCreate: (...) => Promise<CreateConversationResult | void>
```

=> Khi `result` có thể là `void`, TypeScript không cho phép truy cập `result.data` (vì `void` không có `data`), kể cả dùng optional chaining.

---

## Hướng xử lý (ưu tiên theo thứ tự)

### 1) Fix build errors trong `NewChatDialog.tsx` (bắt buộc)
**Mục tiêu:** Không còn union `void`, vì thực tế `handleNewChat` ở `Chat.tsx` luôn `return result`.

**Thay đổi đề xuất:**
- Trong `src/components/chat/NewChatDialog.tsx`:
  - Đổi type `onCreate` từ `Promise<CreateConversationResult | void>` ➜ `Promise<CreateConversationResult>`
  - (Tuỳ chọn tốt hơn) đổi `CreateConversationResult` để `data` là bắt buộc nhưng có thể `null`, giúp logic rõ ràng:
    ```ts
    interface CreateConversationResult {
      data: { id: string } | null;
      error: Error | null;
    }
    ```
  - Cập nhật đoạn xử lý `result` theo kiểu “guard” rõ ràng:
    - Nếu `result.error` => toast lỗi, không đóng dialog
    - Nếu có `result.data?.id` => đóng dialog + reset
    - Nếu không có id => toast lỗi, không đóng dialog

**Kết quả mong đợi:** Build pass, dialog “Tin nhắn mới” hoạt động lại.

---

### 2) Căn chỉnh return type ở `Chat.tsx` để khớp với `NewChatDialog`
**Mục tiêu:** `handleNewChat` luôn trả về đúng kiểu `CreateConversationResult`, không bao giờ `undefined`.

- File: `src/pages/Chat.tsx`
- Việc cần làm:
  - Bảo đảm `handleNewChat` luôn `return result` ở mọi nhánh (kể cả lỗi) và `result` có shape ổn định.
  - Nếu `createConversation(...)` có thể trả `{ error: ... }` mà không có `data`, thì chuẩn hoá về `{ data: null, error: Error }` (tối thiểu ở layer `handleNewChat`).

**Kết quả mong đợi:** `NewChatDialog` không còn phải phòng trường hợp `void`, giảm bug “bấm mà không phản hồi”.

---

### 3) (Nếu vẫn còn) Fix triệt để case “tạo được conversation nhưng không mở được khung chat”
Vì UI ở `Chat.tsx` chỉ render `ChatWindow` khi:
- `selectedConversationId` đã set **và**
- `conversations` list có chứa conversation đó

Nên nếu API list chưa kịp cập nhật (hoặc trả về rỗng), cảm giác người dùng sẽ là “bấm không ra chat”.

**Giải pháp chống “kẹt UI” (frontend fallback an toàn):**
- Trong `src/pages/Chat.tsx` thêm một state dạng `selectedConversationOverride`
- Khi `selectedConversationId` có giá trị nhưng `conversations.find(...)` không thấy:
  - Gọi `api.conversations.get(selectedConversationId)` để lấy conversation đầy đủ (có `members`)
  - Set vào `selectedConversationOverride`
- Render `ChatWindow` theo ưu tiên:
  1) `selectedConversation` từ danh sách
  2) `selectedConversationOverride` (fallback)

**Kết quả mong đợi:** Dù danh sách hội thoại chưa kịp refresh, người dùng vẫn vào chat được ngay sau khi tạo.

---

### 4) Kiểm thử end-to-end (bắt buộc, theo đúng luồng người dùng)
Sau khi fix build:

1. Vào `/chat` ➜ nhấn “Tin nhắn mới” ➜ chọn 1 user:
   - Dialog đóng
   - Màn chat mở được ngay (ChatWindow render)
2. Reload trang `/chat`:
   - Cuộc trò chuyện vừa tạo xuất hiện trong danh sách
3. Vào `/profile/:userId` của bạn bè ➜ nhấn “Nhắn tin”:
   - Điều hướng sang `/chat` và auto mở đúng conversation
4. Gửi 1 tin nhắn:
   - Tin nhắn gửi được, không bị lỗi membership/forbidden

---

## Files dự kiến sẽ chỉnh
1) `src/components/chat/NewChatDialog.tsx`  
- Sửa type `onCreate` (loại `void`) + guard logic để hết TS2339

2) `src/pages/Chat.tsx`  
- Chuẩn hoá return type của `handleNewChat`  
- (Tuỳ chọn nhưng rất nên) thêm fallback fetch conversation theo `selectedConversationId`

(Chỉ khi cần) 3) `src/hooks/useConversations.tsx`  
- Chuẩn hoá kiểu trả về của `createConversation` để thống nhất toàn app

---

## Tiêu chí hoàn thành
- Build không còn lỗi TS2339
- Bấm vào bạn bè tạo/mở được cuộc trò chuyện và vào được màn chat
- Không còn tình trạng “bấm nhưng không có gì xảy ra”