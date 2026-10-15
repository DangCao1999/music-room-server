# Admin PIN và vào lại đúng thành viên cũ

Ngày: 2026-10-15 · Contracts: `2026-10-15.3`

## Vấn đề

- Phiên của một người chỉ nằm trong `localStorage` của trình duyệt. Mất token (đổi trình
  duyệt, ẩn danh, trình duyệt trong app, đổi địa chỉ truy cập) thì server không nhận ra họ;
  tên vẫn bị thành viên cũ (offline) giữ nên vào lại báo `NAME_TAKEN`, phải đổi tên khác.
- Admin bấm "Rời phòng" thì mất quyền; nếu là admin duy nhất, phòng không còn ai quản trị.

## Quyết định

- Nhận diện người quay lại **theo tên** (IP không dùng được: cả văn phòng chung một IP công cộng).
- **PIN quản trị 4–8 chữ số, bắt buộc khi tạo phòng.** Ai biết PIN đều nhận được quyền admin.
- Trang máy phát `/host` vẫn không cần PIN.

## Server

- `Room.adminPinHash String?` (phòng cũ = null). Băm bằng `scrypt` của Node
  (`scrypt$<salt>$<hash>`, so sánh `timingSafeEqual`), không thêm thư viện.
- Chống dò: 5 lần sai trong 15 phút theo khoá `ip|roomId` → khoá 15 phút (`PIN_LOCKED {minutes}`);
  sai thì `PIN_INVALID {remaining}`. Các lần thử cùng khoá chạy tuần tự (`KeyedMutex`).
- `room:create { name, displayName, adminPin }`.
- `room:join { code, displayName, adminPin? }`:
  - tên chưa ai dùng → thành viên mới (như cũ);
  - tên thuộc thành viên **đang online** hoặc thiết bị máy phát → `NAME_TAKEN`;
  - tên thuộc thành viên **offline** (không phải thiết bị):
    - không phải admin → vào lại đúng thành viên đó (giữ màu, bài, tim). Tên không phải
      bằng chứng, nên quyền Điều khiển / DJ / Máy phát trở về mức của thành viên mới
      (`rightsReset: true`; nếu đang là máy phát của phòng thì bỏ luôn). Admin cấp lại,
      hoặc người đó nhận quyền bằng PIN. Log `user_rejoin`;
    - là admin, phòng chưa có PIN → `PIN_NOT_SET`;
    - là admin, thiếu `adminPin` → `PIN_REQUIRED`; sai → `PIN_INVALID`/`PIN_LOCKED`; đúng → vào lại.
  - Không tăng `tokenVersion`: trình duyệt cũ (nếu còn token) vẫn dùng được.
  - Kết quả thêm `rejoined: boolean` và `rightsReset: boolean`.
- `admin:claim { pin }`: thành viên (không phải thiết bị) nhập đúng PIN → `ADMIN` + `canControl`
  + `canDj`; log `admin_claim` "đã nhận quyền quản trị bằng mã PIN". Phòng chưa có PIN → `PIN_NOT_SET`.
- `room:set-pin { pin }`: chỉ admin; đặt hoặc đổi PIN; log `pin_change` "đã đổi mã PIN quản trị".
- Snapshot: `room.hasPin: boolean`.
- Lỗi mới: `PIN_REQUIRED`, `PIN_INVALID`, `PIN_LOCKED`, `PIN_NOT_SET`.
- Người đã "Rời phòng" / bị mời ra: tên đã được giải phóng → vào lại là thành viên mới (không đổi).

## Client

- Tạo phòng: ô "Mã PIN quản trị" (số, 4–8) kèm gợi ý.
- Vào phòng: gợi ý "Từng vào phòng này? Nhập đúng tên cũ để quay lại". Server trả `PIN_REQUIRED`
  → hiện ô PIN trong form và gửi lại.
- Mọi người (không phải admin, phòng có PIN): nút "Nhận quyền quản trị" → hộp thoại nhập PIN.
- Cài đặt phòng (admin): mục "Mã PIN quản trị" để đặt/đổi; nhắc đặt nếu phòng chưa có PIN.
- `localStorage`: lưu thêm tên theo phòng `mr:session:name:<CODE>` để form vào lại điền đúng tên cũ.

## Kiểm tra

Không có test tự động (theo yêu cầu). Lint + typecheck + build, rồi chạy Chrome headless trên dev:
tạo phòng có PIN; thành viên offline vào lại đúng người; admin offline vào lại bằng PIN; sai PIN
và bị khoá; nhận quyền bằng PIN; đổi PIN; tên đang online vẫn báo trùng.
