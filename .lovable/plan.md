
## Mục tiêu
Sửa lỗi `Edge function returned 401: {"error":"Invalid token"}` ở `supabase/functions/get-referral-code/index.ts` để:
- Không còn 401 sai (khi user đã đăng nhập hợp lệ)
- Có log/diagnostic rõ ràng nếu token thật sự sai/expired
- Đồng bộ cách verify JWT giống các function đang hoạt động (ví dụ `api-keys`)

---

## Chẩn đoán nhanh (vì sao đang 401 “Invalid token”)
Hiện `get-referral-code` đang:
1) Đọc `Authorization` header
2) Tách token bằng `authHeader.replace('Bearer ', '')` (case-sensitive)
3) Tạo client bằng `SUPABASE_ANON_KEY` nhưng lại gọi `supabaseAuth.auth.getUser(token)` với token đã tách

Các điểm dễ gây lỗi:
- **Token parsing không robust**: nếu header là `bearer <token>` (lowercase) hoặc có extra spaces, `replace('Bearer ', '')` không cắt đúng → token truyền vào `getUser(token)` bị sai → 401.
- **Không cần parse token**: Supabase JS v2 có pattern chuẩn là set `global.headers.Authorization` và gọi `auth.getUser()` **không truyền token**, giống như `supabase/functions/api-keys/index.ts` đang làm.
- Nếu môi trường thiếu `SUPABASE_ANON_KEY` (hoặc đọc sai), request đến Auth API sẽ fail; hiện code dùng `?? ''` nên lỗi sẽ “mơ hồ” và bị quy về “Invalid token”.

---

## Việc sẽ làm (code changes)

### 1) Sửa `get-referral-code` theo pattern chuẩn (không parse token)
**File:** `supabase/functions/get-referral-code/index.ts`

Thay đổi chính:
- Lấy env theo kiểu “bắt buộc có”, giống `api-keys`:
  - `const supabaseUrl = Deno.env.get('SUPABASE_URL')!;`
  - `const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;`
- Tạo `supabaseAuth` bằng anon key + Authorization header:
  - `createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader }}})`
- Verify user bằng:
  - `const { data: { user }, error } = await supabaseAuth.auth.getUser();`  (không truyền token)
- Nếu lỗi: log chi tiết `authError?.message` + `authError?.status` (không log token), trả 401.

Lý do: tránh mọi sai lệch do parsing, và đúng chuẩn Supabase.

---

### 2) Sửa luôn `use-referral-code` (đang dùng service role để verify JWT — rất dễ fail tương tự)
**File:** `supabase/functions/use-referral-code/index.ts`

Hiện tại function này vẫn làm:
- `createClient(..., SERVICE_ROLE_KEY)` rồi `supabase.auth.getUser(token)`  
Cách này rất “dễ hỏng” và không đúng pattern an toàn.

Sửa tương tự:
- Dùng **anon client** để `auth.getUser()` xác thực JWT từ header
- Dùng **service role client** chỉ cho thao tác DB (insert/update)

Kết quả: cả “lấy code” và “dùng code” đều ổn định.

---

### 3) Nâng chất lượng debug (để lần sau không bị “lineno 0” mơ hồ)
Trong cả 2 functions:
- Khi auth fail, log:
  - `Auth error message/status/name`
  - Có/không có Authorization header
  - Không bao giờ log token
- Trả response JSON có cấu trúc rõ hơn (vẫn giữ 401) ví dụ:
  - `{ error: "Invalid token", detail: "JWT expired" }` (detail chỉ khi có, không chứa thông tin nhạy cảm)

---

## Kiểm thử sau khi sửa (end-to-end)
1) Đăng nhập user trên preview
2) Mở trang Rewards/Referral (nơi gọi `useReferral().getReferralCode()`)
3) Quan sát:
   - Không còn 401
   - Referral code hiện ra bình thường
4) Thử “Use referral code” (nếu UI có):
   - Không còn 401 “Invalid token”
5) Nếu vẫn lỗi:
   - Mở Supabase Dashboard → Edge Function logs để xem `authError` chi tiết (sẽ có log mới)

---

## Tiêu chí hoàn thành
- `get-referral-code` không còn trả 401 khi user đăng nhập hợp lệ
- `use-referral-code` cũng không còn 401 do auth verify sai
- Log hiển thị rõ nguyên nhân khi token thật sự invalid/expired/missing header

---

## Files sẽ chỉnh
- `supabase/functions/get-referral-code/index.ts`
- `supabase/functions/use-referral-code/index.ts`
