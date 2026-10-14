# Ma trận case: Music Room v2

> Mô hình nghiệp vụ (R-xx, trạng thái, I-xx, thông điệp, nhãn): [`docs/requirements/2026-10-14-music-room-v2-yeu-cau.md`](../requirements/2026-10-14-music-room-v2-yeu-cau.md)
> Trạng thái đo được ghi ở cột cuối: `[chưa đo]`, `[đã đo, ngày, Đạt/Lỗi]`, hoặc `[chỉ kiểm được ở server/thiết bị: cách kiểm]`.
> Ưu tiên: **P1** gây mất hoặc sai dữ liệu, hoặc chặn nghiệp vụ · **P2** có cách vòng · **P3** chỉ ảnh hưởng hiển thị.

## 0. Kỹ thuật và lý do chọn

| Viết tắt | Kỹ thuật | Lý do dùng trong tính năng này |
|---|---|---|
| EP | Phân vùng tương đương | Dữ liệu nhập (link, tên, mã, từ khóa) có nhiều dạng hợp lệ và không hợp lệ; mỗi lớp chỉ cần một đại diện |
| BVA | Phân tích giá trị biên | Có nhiều giới hạn số: độ dài, số bài, ngưỡng phiếu, thời lượng, số lần sai PIN, thời hạn lease |
| DT | Bảng quyết định | Tạo phòng (có hay không mật khẩu cài đặt), thêm bài (nhúng được, thời lượng, livestream, nguồn tra cứu) |
| ST | Chuyển trạng thái | `QueueItem`, `PlaybackState`, `Member` và lease có các chuyển trạng thái bị cấm cần chặn |
| UC | Kịch bản sử dụng | Các luồng chính: tạo phòng, vào phòng, thêm bài, phát, tìm kiếm, máy phát |
| PM | Ma trận quyền | 7 vai trò × 18 thao tác; trước đây là lỗ hổng 🔴 (giả danh) |
| INV | Kiểm tra bất biến và đối soát | Thứ tự và số liệu phải khớp giữa máy thành viên, máy phát và server |
| PW | Tổ hợp cặp (pairwise) | Trình duyệt × vai trò × cấu hình (có key, playlist dự phòng) × mạng |
| EG | Đoán lỗi | Mọi rủi ro trong danh sách bắt buộc: thu hồi quyền, gửi trùng, đồng thời, mất mạng, dữ liệu xấu, múi giờ, đa ngôn ngữ, tích hợp lỗi, bảo mật |
| REG | Hồi quy | Các tính năng cũ (chat, reaction, DJ, TTS, nhật ký) dùng chung gateway và state |

**Nơi kiểm chứng**, các mã viết tắt:
- `U:<file>`: unit test (Jest ở server, Vitest ở client).
- `I:<file>`: integration test ở server (Testcontainers Postgres + `socket.io-client`).
- `E:<file>`: E2E bằng Playwright.
- `M`: thử tay trên giao diện (Browser pane hoặc thiết bị thật).

---

## 1. Tạo phòng và vào phòng

| ID | Kỹ thuật | Quy tắc / Trạng thái | Vai trò | Điều kiện trước & dữ liệu | Bước thao tác | Kết quả mong đợi | Kiểm chứng | Ưu tiên | Trạng thái |
|---|---|---|---|---|---|---|---|---|---|
| TC-001 | UC (luồng chính) | R-01, R-02, R-06 | Khách | Instance không đặt `SETUP_PASSWORD` | `/` → tab `Tạo phòng` → `Tên của bạn` = "An", `Tên phòng` = "Dev tầng 3", `Mã PIN quản trị` = "1234" → bấm `Tạo phòng` | Chuyển tới `/r/XXXXXX`; header hiện "Dev tầng 3" và mã 6 ký tự; tab Mọi người có "An (bạn)" với nhãn `Quản trị` | I:rooms.e2e · E:create-join | P1 | [đã đo, 2026-10-14, Đạt — E2E, I-server] |
| TC-002 | DT (cột 2) | R-01 | Khách | `SETUP_PASSWORD=s3cret` | Như TC-001, thêm `Mật khẩu cài đặt` = "s3cret" | Tạo phòng thành công | I:rooms.e2e | P1 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-003 | DT (cột 3) | R-01 | Khách | `SETUP_PASSWORD=s3cret` | `Mật khẩu cài đặt` = "sai" → `Tạo phòng` | Thông báo: "Mật khẩu cài đặt không đúng. Hãy hỏi người quản lý máy chủ."; không có phòng nào được tạo (DB `Room` count không đổi) | I:rooms.e2e | P1 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-004 | DT (cột 4) | R-01 | Khách | `SETUP_PASSWORD` đã đặt | Để trống `Mật khẩu cài đặt` | Nút `Tạo phòng` bị vô hiệu; dưới ô hiện "Nhập mật khẩu cài đặt do người quản lý máy chủ cung cấp" | M | P2 | [đã đo, 2026-10-14, Đạt — M/Playwright trên bản Docker production có SETUP_PASSWORD (cổng 8088)] |
| TC-005 | DT (cột 5) | R-01 | Khách | Không đặt `SETUP_PASSWORD` | Gửi `room:create` có kèm `setupPassword: "x"` | Tạo phòng thành công, trường này bị bỏ qua; ô mật khẩu không hiện trên giao diện | I:rooms.e2e | P3 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-006 | BVA | R-03 | Khách | — | `Tên phòng` = "   " / "A" / 50 ký tự / 51 ký tự (gửi thẳng lên server) | Rỗng: nút vô hiệu. 1 và 50 ký tự: tạo được. 51 ký tự: `VALIDATION` "Dữ liệu chưa hợp lệ. Hãy kiểm tra lại rồi thử lại." | U:contracts.spec · I:rooms.e2e | P2 | [đã đo, 2026-10-14, Đạt — E2E, U-server] |
| TC-007 | BVA + EP | R-04 | Khách | — | PIN = "123" / "1234" / "12345678" / "123456789" / "12a4" / "１２３４" (số toàn chiều rộng) | "1234" và "12345678" hợp lệ; các giá trị còn lại: nút vô hiệu kèm gợi ý "PIN gồm 4–8 chữ số", gửi thẳng lên server thì nhận `VALIDATION` | U:contracts.spec | P2 | [đã đo, 2026-10-14, Đạt — E2E, U-server] |
| TC-008 | INV + BVA | R-02 | — | Sinh 10.000 mã | Gọi `generateRoomCode()` | Mọi mã dài đúng 6 ký tự, chỉ dùng ký tự trong bảng chữ, không có `0 O 1 I` | U:room-code.spec | P2 | [đã đo, 2026-10-14, Đạt — U-server] |
| TC-009 | EG (trùng) | R-02 | — | Bộ sinh số trả về mã đã tồn tại 2 lần liên tiếp | `room:create` | Thử lại và tạo được mã mới; sau 5 lần trùng liên tiếp thì trả `INTERNAL` | U:rooms.service.spec | P2 | [đã đo, 2026-10-14, Đạt — U-server] |
| TC-010 | BVA | R-43 | Khách | Cùng một IP | Gửi 20 rồi 21 lần `room:create` trong 60 giây | Lần 1–20 được xử lý; lần 21 nhận "Bạn thao tác hơi nhanh. Hãy thử lại sau {n} giây." | I:ratelimit.e2e | P2 | [đã đo, 2026-10-14, Đạt — I-server, U-server] |
| TC-011 | UC | R-02, R-06 | Khách | Phòng K7M2QX tồn tại | `/` → `Vào phòng` → `Mã phòng` = "K7M2QX", `Tên của bạn` = "Bình" → `Vào phòng` | Vào phòng; mọi người thấy "Bình" trong tab Mọi người; nhật ký có "Bình đã vào phòng" | I:rooms.e2e · E:create-join | P1 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-012 | EP | R-02 | Khách | Phòng K7M2QX | `Mã phòng` = " k7m2qx " | Vào được phòng K7M2QX | U:contracts.spec · I:rooms.e2e | P2 | [đã đo, 2026-10-14, Đạt — I-server, U-server] |
| TC-013 | EP | R-02 | Khách | Không có phòng ZZZZZZ | `Mã phòng` = "ZZZZZZ" → `Vào phòng` | "Không tìm thấy phòng. Hãy kiểm tra lại mã phòng." | I:rooms.e2e | P2 | [đã đo, 2026-10-14, Đạt — E2E, I-server] |
| TC-014 | BVA | R-02 | Khách | — | `Mã phòng` = 5 ký tự / có ký tự `0` | Nút `Vào phòng` vô hiệu kèm gợi ý "Mã phòng gồm 6 ký tự" | M | P3 | [đã đo, 2026-10-14, Đạt — E2E] |
| TC-015 | UC (luồng thay thế) | R-06 | Khách | Phòng K7M2QX tên "Dev tầng 3" | Mở `/r/K7M2QX` khi chưa có token | Hiện hộp thoại "Vào phòng Dev tầng 3", ô `Tên của bạn`, nút `Vào phòng` | E:create-join | P1 | [đã đo, 2026-10-14, Đạt — E2E] |
| TC-016 | EP | R-05, I-10 | Khách | Phòng đã có "An" | Vào phòng với tên "an" / " AN " | "Tên này đã có người dùng trong phòng. Hãy chọn tên khác." | I:rooms.e2e | P1 | [đã đo, 2026-10-14, Đạt — E2E, I-server] |
| TC-017 | EP (đa ngôn ngữ) | R-05 | Khách | Phòng đã có "Đức" (NFC) | Vào phòng với "đức" (NFD, gõ từ IME) / "Duc" | "đức": `NAME_TAKEN`; "Duc": vào được (không bỏ dấu khi so tên) | U:names.spec · I:rooms.e2e | P2 | [đã đo, 2026-10-14, Đạt — I-server, U-server] |
| TC-018 | BVA | R-05 | Khách | — | Tên = "" / "A" / 30 ký tự / 31 ký tự | Rỗng: nút vô hiệu; 1 và 30 ký tự: được; 31 ký tự: `VALIDATION` (giao diện giới hạn `maxLength=30`) | U:contracts.spec | P2 | [đã đo, 2026-10-14, Đạt — U-server] |
| TC-019 | EG (dữ liệu xấu, bảo mật) | R-05, R-42 | Khách | — | Tên = "An\u0000​" / "<script>alert(1)</script>" | Ký tự điều khiển và ký tự zero-width bị loại → "An"; thẻ script hiện nguyên dạng chữ, không chạy | U:names.spec · E:security | P1 | [đã đo, 2026-10-14, Đạt — E2E, U-server] |
| TC-020 | ST (Online→Offline→Online) | R-06, R-07 | Thành viên | "An" đã ❤️ một bài và bỏ phiếu bỏ qua | Tải lại trang `/r/K7M2QX` | Không hiện hộp thoại vào phòng; vẫn là "An (bạn)"; ❤️ và phiếu giữ nguyên; không tạo thành viên mới | I:rooms.e2e · E:reload | P1 | [đã đo, 2026-10-14, Đạt — E2E, I-server] |
| TC-021 | EG (token sai hoặc hết hạn) | R-06 | Thành viên | Token bị sửa chữ ký, hoặc hết hạn (đồng hồ giả +31 ngày) | Mở `/r/K7M2QX` | "Phiên của bạn đã hết hạn. Hãy nhập tên để vào lại phòng." và hiện hộp thoại vào phòng | I:auth.e2e | P1 | [đã đo, 2026-10-14, Đạt — I-server, U-server] |
| TC-022 | EG (lưu trữ bị chặn) | R-06 | Khách | Trình duyệt chặn `localStorage` | Vào phòng rồi tải lại trang | Vào được; tải lại thì phải nhập tên lần nữa; không có lỗi trắng trang | U:session-store.test | P2 | [đã đo, 2026-10-14, Đạt — U-client] |
| TC-023 | ST | R-07 | Thành viên | "An" mở 2 tab | Đóng 1 tab; sau đó đóng cả tab còn lại | Còn 1 tab: "An" vẫn online. Đóng cả hai: chấm của "An" chuyển xám ở máy người khác nhưng "An" vẫn trong danh sách | I:presence.e2e | P2 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-024 | ST (Đã rời) | R-11 | Thành viên | "An" có 2 bài đang chờ, ❤️ bài của Bình, đã bỏ phiếu bỏ qua | Header → `Rời phòng` | Về trang chủ; 2 bài vẫn trong hàng chờ; ❤️ và phiếu bị gỡ; nhật ký có "An đã rời phòng"; token cũ dùng lại thì nhận `UNAUTHENTICATED` | I:rooms.e2e | P1 | [đã đo, 2026-10-14, Đạt — E2E, I-server] |
| TC-025 | ST | R-11, I-10 | Khách | "An" vừa rời phòng | Người khác vào phòng với tên "An" | Vào được (tên đã được giải phóng) | I:rooms.e2e | P2 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-026 | UC (ngoại lệ) | R-12 | — | Phòng không còn ai online trong 2 giờ | Mở lại `/r/K7M2QX` | Phòng vẫn còn, hàng chờ và chat giữ nguyên | I:persistence.e2e | P1 | [đã đo, 2026-10-14, Đạt — I-server] |

## 2. Quyền quản trị, mời ra, thu hồi

| ID | Kỹ thuật | Quy tắc / Trạng thái | Vai trò | Điều kiện trước & dữ liệu | Bước thao tác | Kết quả mong đợi | Kiểm chứng | Ưu tiên | Trạng thái |
|---|---|---|---|---|---|---|---|---|---|
| TC-030 | UC | R-08 | Thành viên | PIN phòng là 1234 | Tab `Mọi người` → `Nhận quyền quản trị` → nhập "1234" → `Xác nhận` | Nhãn `Quản trị` xuất hiện cạnh tên; mục `Cài đặt phòng` hiện ra | I:auth.e2e | P1 | [đã đo, 2026-10-14, Đạt — E2E, I-server] |
| TC-031 | BVA (lần 1–4) | R-08 | Thành viên | — | Nhập "0000" | "Mã PIN không đúng. Bạn còn 4 lần thử." (lần 2 còn 3, … lần 4 còn 1) | I:auth.e2e | P2 | [đã đo, 2026-10-14, Đạt — E2E, U-server] |
| TC-032 | BVA (lần 5–6) | R-08 | Thành viên | Đã sai 4 lần | Sai lần thứ 5; sau đó nhập đúng "1234" | Lần 5: "Bạn đã nhập sai PIN quá nhiều lần. Hãy thử lại sau 15 phút."; nhập đúng ngay sau đó vẫn bị khóa | I:auth.e2e | P1 | [đã đo, 2026-10-14, Đạt — I-server, U-server] |
| TC-033 | BVA (hết khóa) | R-08 | Thành viên | Bị khóa lúc t=0 | Nhập đúng lúc t=14:59, rồi lúc t=15:01 | 14:59 vẫn khóa; 15:01 thành công | U:pin-guard.spec | P2 | [đã đo, 2026-10-14, Đạt — U-server] |
| TC-034 | EG (bảo mật, giả danh) | R-09, R-42 | Thành viên | Biết `memberId` của admin từ snapshot | Gửi `permission:set` có kèm trường `requesterId: <adminId>` | `VALIDATION` (trường thừa); không có quyền nào thay đổi | I:permissions.e2e | P1 | [đã đo, 2026-10-14, Đạt — I-server, U-server] |
| TC-035 | ST (Bị mời ra) | R-10 | Admin → Thành viên | "Bình" có 2 bài, 1 ❤️ và 1 phiếu | Admin: menu của "Bình" → `Mời ra khỏi phòng` → `Mời ra` | Máy Bình hiện "Bạn đã được mời ra khỏi phòng." rồi về hộp thoại vào phòng; 2 bài của Bình chuyển `REMOVED`; ❤️ và phiếu bị gỡ; token cũ nhận `UNAUTHENTICATED` | I:permissions.e2e | P1 | [đã đo, 2026-10-14, Đạt — E2E, I-server] |
| TC-036 | ST (cấm) | R-13 | Admin | — | Gửi `member:kick` với chính mình / `permission:set{role:USER}` với chính mình | Cả hai trả `FORBIDDEN`; giao diện không hiện các nút này cho chính mình | I:permissions.e2e | P2 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-037 | ST (cấm) | R-13 | Admin | Có thiết bị phát | `permission:set{memberId: device, role: ADMIN}` | `FORBIDDEN` | I:permissions.e2e | P2 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-038 | INV | R-14 | Admin | "An" đang có `canPlay` | `Đặt làm máy phát` cho "Bình" | Chỉ Bình có nhãn `Máy phát`; máy của An dừng phát và hiện thông điệp `player_replaced` | I:player.e2e | P1 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-039 | EG (bị thu hồi quyền giữa chừng) | R-13, R-26 | Người điều khiển | Giao diện đang hiện `Bỏ qua ngay` | Admin bỏ quyền điều khiển; Bình bấm `Bỏ qua ngay` trước khi giao diện cập nhật | "Bạn không có quyền làm việc này. Hãy nhờ quản trị viên cấp quyền."; bài không bị bỏ qua; nút biến mất sau khi nhận `room:update` | I:permissions.e2e | P1 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-040 | EG (bị thu hồi quyền giữa chừng) | R-13 | Admin bị hạ quyền | Đang mở `Cài đặt phòng` | Admin khác hạ quyền; người này bấm `Lưu cài đặt` | `FORBIDDEN`; cấu hình không đổi | I:permissions.e2e | P2 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-041 | ST | R-10 | Khách | "Bình" vừa bị mời ra | Vào lại với tên "Bình" | Vào được như thành viên mới (không có quyền cũ) | I:permissions.e2e | P3 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-042 | UC | R-13 | Admin | — | Lần lượt `Cấp quyền điều khiển`, `Cấp quyền DJ`, `Cấp quyền quản trị` cho Bình | Nhãn tương ứng hiện ngay ở mọi máy; nhật ký có ghi từng thay đổi | I:permissions.e2e | P2 | [đã đo, 2026-10-14, Đạt — I-server] |

### 2.1 Ma trận quyền: vai trò × thao tác (PM)

Ký hiệu: ✅ thành công · F = `FORBIDDEN` · U = `UNAUTHENTICATED` · S = `STALE_ITEM` (khi trạng thái không cho phép).
Cột "Khách" là socket không có token; cột "Đã rời/bị mời" là socket dùng token đã bị thu hồi.

| ID | Thao tác | Khách | Thành viên | Điều khiển | DJ | Admin | Thiết bị phát | Đã rời/bị mời | Kiểm chứng | Ưu tiên | Trạng thái |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PM-01 | `queue:add` | U | ✅ | ✅ | ✅ | ✅ | F | U | I:permissions.e2e | P1 [đã đo, 2026-10-14, Đạt — I-server] |
| PM-02 | `queue:remove` bài của mình | U | ✅ | ✅ | ✅ | ✅ | F | U | I:permissions.e2e | P1 [đã đo, 2026-10-14, Đạt — I-server] |
| PM-03 | `queue:remove` bài người khác | U | F | F | F | ✅ | F | U | I:permissions.e2e | P1 [đã đo, 2026-10-14, Đạt — I-server] |
| PM-04 | `queue:pin-next` | U | F | ✅ | F | ✅ | F | U | I:permissions.e2e | P2 [đã đo, 2026-10-14, Đạt — I-server] |
| PM-05 | `queue:heart` | U | ✅ | ✅ | ✅ | ✅ | F | U | I:permissions.e2e | P2 [đã đo, 2026-10-14, Đạt — I-server] |
| PM-06 | `queue:set-message` bài mình / bài người khác | U | ✅ / F | ✅ / F | ✅ / F | ✅ / F | F | U | I:permissions.e2e | P2 [đã đo, 2026-10-14, Đạt — I-server] |
| PM-07 | `queue:vote-skip` | U | ✅ | ✅ | ✅ | ✅ | F | U | I:permissions.e2e | P2 [đã đo, 2026-10-14, Đạt — I-server] |
| PM-08 | `playback:control` | U | F | ✅ | F | ✅ | F | U | I:permissions.e2e | P1 [đã đo, 2026-10-14, Đạt — I-server] |
| PM-09 | `player:report` (có lease / không có lease) | U | F | F | F | F | ✅ / F | U | I:player.e2e | P1 [đã đo, 2026-10-14, Đạt — I-server] |
| PM-10 | `permission:set` | U | F | F | F | ✅ | F | U | I:permissions.e2e | P1 [đã đo, 2026-10-14, Đạt — I-server] |
| PM-11 | `member:kick` | U | F | F | F | ✅ | F | U | I:permissions.e2e | P1 [đã đo, 2026-10-14, Đạt — I-server] |
| PM-12 | `room:settings` | U | F | F | F | ✅ | F | U | I:permissions.e2e | P1 [đã đo, 2026-10-14, Đạt — I-server] |
| PM-13 | `chat:send` | U | ✅ | ✅ | ✅ | ✅ | F | U | I:permissions.e2e | P2 [đã đo, 2026-10-14, Đạt — I-server] |
| PM-14 | `room:reaction` | U | ✅ | ✅ | ✅ | ✅ | F | U | I:permissions.e2e | P3 [đã đo, 2026-10-14, Đạt — I-server] |
| PM-15 | `dj:trigger` | U | F | F | ✅ | ✅ | F | U | I:permissions.e2e | P2 [đã đo, 2026-10-14, Đạt — I-server] |
| PM-16 | `search:query` | U | ✅ | ✅ | ✅ | ✅ | F | U | I:permissions.e2e | P2 [đã đo, 2026-10-14, Đạt — I-server] |
| PM-17 | `admin:claim` (PIN đúng) | U | ✅ | ✅ | ✅ | ✅ (không đổi gì) | F | U | I:permissions.e2e | P1 [đã đo, 2026-10-14, Đạt — I-server] |
| PM-18 | `room:join`, `room:create`, `room:peek`, `host:register` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | I:permissions.e2e | P1 [đã đo, 2026-10-14, Đạt — I-server] |

## 3. Thêm bài

| ID | Kỹ thuật | Quy tắc / Trạng thái | Vai trò | Điều kiện trước & dữ liệu | Bước thao tác | Kết quả mong đợi | Kiểm chứng | Ưu tiên | Trạng thái |
|---|---|---|---|---|---|---|---|---|---|
| TC-050 | UC + ST (IDLE→PLAYING) | R-19, R-15 | Thành viên | Phòng `IDLE`, có máy phát | Tab `Thêm bài` → dán `https://youtu.be/dQw4w9WgXcQ` → `Thêm vào hàng chờ` | "Đã thêm "Never Gonna Give You Up" vào hàng chờ"; bài phát ngay; máy phát nhận `player:command`; hàng chờ vẫn trống | I:queue.e2e · E:playback | P1 | [đã đo, 2026-10-14, Đạt — E2E, I-server] |
| TC-051 | UC | R-15 | Thành viên | Đang phát | Dán link khác → `Thêm vào hàng chờ` | Bài vào hàng chờ, có nhãn "{tên} · vòng 1"; bộ đếm tab tăng 1 | I:queue.e2e | P1 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-052 | EP (hợp lệ) | R-15 | — | — | `parseLink` với 11 dạng link: watch?v, youtu.be, shorts, music.youtube, m.youtube, `&t=42`, `&list=…`, `?si=…`, `/embed/`, `/live/`, id 11 ký tự đứng riêng | Cả 11 dạng đều trả đúng `videoId` | U:link-parser.spec | P1 | [đã đo, 2026-10-14, Đạt — U-server] |
| TC-053 | EP (không hợp lệ) | R-15 | Thành viên | — | Dán `https://www.youtube.com/playlist?list=PL…` / link kênh `/@abc` / `https://vimeo.com/1` / "dQw4w9WgXc" (10 ký tự) / `javascript:alert(1)` | "Không nhận ra link YouTube này. Hãy dán link dạng youtube.com/watch?v=… hoặc youtu.be/…" | U:link-parser.spec · I:queue.e2e | P2 | [đã đo, 2026-10-14, Đạt — I-server, U-server] |
| TC-054 | BVA | R-42 | Thành viên | — | Input dài 2048 / 2049 ký tự | 2048: được phân tích bình thường; 2049: `VALIDATION` | U:contracts.spec | P3 | [đã đo, 2026-10-14, Đạt — U-server] |
| TC-055 | BVA | R-16, I-04 | Thành viên | `maxQueuedPerMember=4`; Bình đang có 3 bài chờ và 1 bài đang phát | Thêm bài thứ 4; rồi thêm bài thứ 5 | Bài 4: thành công (bài đang phát không bị tính). Bài 5: "Bạn đã có 4 bài đang chờ. Hãy đợi bài của bạn phát rồi thêm tiếp." | I:queue.e2e | P1 | [đã đo, 2026-10-14, Đạt — E2E, I-server] |
| TC-056 | BVA | R-17 | Thành viên | `maxTrackDurationSec=600` | Thêm bài dài 599 / 600 / 601 giây | 599 và 600: được. 601: "Bài này dài 10:01, vượt giới hạn 10:00 của phòng. Hãy chọn bài ngắn hơn." | I:queue.e2e | P2 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-057 | BVA | R-17, R-47 | Thành viên | `maxTrackDurationSec=0` | Thêm bài dài 7200 giây | Được (0 nghĩa là không giới hạn) | I:queue.e2e | P3 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-058 | DT | R-17 | Thành viên | Data API trả `status.embeddable=false` | Thêm bài | "Video này không cho phát ngoài YouTube. Hãy chọn bản khác." | I:queue.e2e | P2 | [đã đo, 2026-10-14, Đạt — I-server, U-server] |
| TC-059 | DT | R-17 | Thành viên | Data API trả `items: []`; oEmbed trả 404 | Thêm bài | "Không tìm thấy video. Có thể video đã bị xóa hoặc để riêng tư." | U:youtube.provider.spec · I:queue.e2e | P2 | [đã đo, 2026-10-14, Đạt — I-server, U-server] |
| TC-060 | DT | R-17 | Thành viên | `liveBroadcastContent = live` hoặc `upcoming` | Thêm bài | "Không thể thêm video đang phát trực tiếp. Hãy chọn video thường." | U:youtube.provider.spec | P2 | [đã đo, 2026-10-14, Đạt — I-server, U-server] |
| TC-061 | DT (nguồn oEmbed) | R-17, R-36 | Thành viên | Không có `YOUTUBE_API_KEY` | Dán link hợp lệ | Thêm được; bài hiện "Không rõ thời lượng"; `durationSec = null` | I:queue.e2e | P2 | [đã đo, 2026-10-14, Đạt — I-server, U-server] |
| TC-062 | EG (gửi lặp) | R-15, I-06 | Thành viên | — | Bấm `Thêm vào hàng chờ` 2 lần thật nhanh | Nút bị vô hiệu trong lúc chờ phản hồi; hàng chờ chỉ tăng 1 bài | E:queue | P2 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-063 | EG (tích hợp chậm) | R-37 | Thành viên | `videos.list` timeout lần 1, thành công lần 2 | Thêm bài | Thêm thành công; log ghi 1 lần thử lại | U:youtube.provider.spec | P2 | [đã đo, 2026-10-14, Đạt — U-server] |
| TC-064 | EG (tích hợp lỗi) | R-37 | Thành viên | `videos.list` trả 503 cả hai lần; oEmbed cũng lỗi | Thêm bài | "Máy chủ đang gặp sự cố. Hãy thử lại sau ít phút."; không có bài nào được thêm | U:youtube.provider.spec | P2 | [đã đo, 2026-10-14, Đạt — U-server] |
| TC-065 | DT (hết quota) | R-36 | Thành viên | `videos.list` trả 403 `quotaExceeded` | Thêm bài | Chuyển sang oEmbed; thêm được với "Không rõ thời lượng" | U:youtube.provider.spec | P2 | [đã đo, 2026-10-14, Đạt — U-server] |
| TC-066 | EG (đồng thời) | R-19, I-01 | 2 thành viên | Phòng `IDLE` | An và Bình thêm bài trong cùng một khoảnh khắc (`Promise.all`) | Đúng 1 bài `PLAYING`, bài còn lại `QUEUED`; `version` tăng 2 | I:concurrency.e2e | P1 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-067 | EG (đa ngôn ngữ, dữ liệu lớn) | — | Thành viên | Tiêu đề có tiếng Việt và emoji, dài 300 ký tự | Xem hàng chờ | Hiển thị đúng dấu; tiêu đề dài bị cắt bằng "…" trên một dòng | M | P3 | [đã đo một phần, 2026-10-14 — E2E "no horizontal overflow" với tên dài; tiêu đề RTL/emoji ghép chưa đo: cần dữ liệu video thật] |

## 4. Thứ tự hàng chờ công bằng

| ID | Kỹ thuật | Quy tắc / Bất biến | Vai trò | Điều kiện trước & dữ liệu | Bước thao tác | Kết quả mong đợi | Kiểm chứng | Ưu tiên | Trạng thái |
|---|---|---|---|---|---|---|---|---|---|
| TC-070 | UC (ví dụ trong spec) | R-18 | — | An thêm A1, A2, A3; sau đó Bình thêm B1; chưa ai có bài phát | `orderQueue` | A1, B1, A2, A3 | U:fair-queue.spec | P1 | [đã đo, 2026-10-14, Đạt — U-server] |
| TC-071 | UC (ví dụ trong spec) | R-18, R-33 | — | A1 vừa phát xong (`lastPlayedAt(An)` mới nhất); Chi thêm C1 | `orderQueue` | B1, C1, A2, A3 | U:fair-queue.spec | P1 | [đã đo, 2026-10-14, Đạt — U-server] |
| TC-072 | UC (ví dụ trong spec) | R-18 | — | Như TC-071, C1 có 2 ❤️ | `orderQueue` | C1, B1, A2, A3 | U:fair-queue.spec | P1 | [đã đo, 2026-10-14, Đạt — U-server] |
| TC-073 | DT | R-18, R-21 | — | X được ghim lúc t2, Y được ghim lúc t1 | `orderQueue` | Y, X, rồi các bài còn lại | U:fair-queue.spec | P1 | [đã đo, 2026-10-14, Đạt — U-server] |
| TC-074 | DT (tie-break) | R-18 | — | Cùng vòng, cùng số ❤️, cùng `lastPlayedAt=null` | `orderQueue` | Xếp theo `addedAt`; nếu `addedAt` cũng bằng nhau thì xếp theo `id` | U:fair-queue.spec | P2 | [đã đo, 2026-10-14, Đạt — U-server] |
| TC-075 | DT | R-18 | — | ❤️ chỉ có ở vòng 1, vòng 0 không có ❤️ | `orderQueue` | Mọi bài vòng 0 vẫn đứng trước bài vòng 1 (❤️ không vượt vòng) | U:fair-queue.spec | P1 | [đã đo, 2026-10-14, Đạt — U-server] |
| TC-076 | EP | R-18 | — | Hàng chờ rỗng; hoặc chỉ một người | `orderQueue` | Rỗng: `[]`. Một người: đúng thứ tự `addedAt` | U:fair-queue.spec | P3 | [đã đo, 2026-10-14, Đạt — U-server] |
| TC-077 | EG (hiệu năng) | R-18 | — | 50 người × 4 bài | `orderQueue` lặp 100 lần | Trung bình dưới 2 ms mỗi lần | U:fair-queue.spec | P3 | [đã đo, 2026-10-14, Đạt — U-server] |
| TC-078 | INV (đối soát giữa các màn hình) | I-05, I-11 | 2 thành viên + máy phát | Hàng chờ 5 bài | So sánh tab `Phòng` của 2 máy với "Tiếp theo" trên máy phát | Cùng thứ tự; bộ đếm trên tab bằng 5; máy phát hiện đúng 2 bài đầu | E:playback | P1 | [đã đo, 2026-10-14, Đạt — E2E, I-server] |
| TC-079 | UC | R-18 | Thành viên | — | Xem hàng chờ | Mỗi bài có dòng "{tên} · vòng {n}" (vòng đếm từ 1); bài ghim có nhãn "Ghim" | M | P3 | [đã đo, 2026-10-14, Đạt — E2E] |

## 5. Xóa bài, ghim, ❤️, lời chúc

| ID | Kỹ thuật | Quy tắc / Trạng thái | Vai trò | Điều kiện trước & dữ liệu | Bước thao tác | Kết quả mong đợi | Kiểm chứng | Ưu tiên | Trạng thái |
|---|---|---|---|---|---|---|---|---|---|
| TC-080 | ST (QUEUED→REMOVED) | R-20 | Thành viên | Bài X của mình đang `QUEUED` | `Xóa bài` trên X | X biến mất ở mọi máy; bộ đếm giảm 1; nhật ký ghi lại | I:queue.e2e | P1 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-081 | ST (cấm PLAYING→REMOVED) | R-20 | Admin | X đang `PLAYING` | Gửi `queue:remove` X | "Bài này vừa thay đổi. Danh sách đã được cập nhật."; X vẫn đang phát | I:queue.e2e | P2 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-082 | EG (gửi lặp) | R-20 | Thành viên | X vừa bị xóa | Gửi `queue:remove` X lần nữa | `STALE_ITEM` | I:queue.e2e | P3 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-083 | UC | R-21 | Người điều khiển | — | `Phát tiếp theo` trên Y | Y lên đầu hàng chờ, nhãn nút đổi thành `Bỏ ghim`; bấm `Bỏ ghim` thì Y về đúng vị trí theo thuật toán | I:queue.e2e | P2 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-084 | ST | R-22, I-03 | Thành viên | — | ❤️ A → ❤️ B → ❤️ B lần nữa | Sau bước 2: A mất tim, B có 1 tim. Sau bước 3: B có 0 tim | I:queue.e2e | P2 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-085 | ST (cấm) | R-22 | Thành viên | X đang `PLAYING` | ❤️ X | `STALE_ITEM` | I:queue.e2e | P3 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-086 | BVA | R-23 | Thành viên | Bài của mình đang `QUEUED` | `Gửi lời chúc` với 200 / 201 ký tự / chuỗi rỗng | 200: lưu được. 201: không gõ được (`maxLength`), gửi thẳng lên server thì `VALIDATION`. Rỗng: lời chúc bị xóa | U:contracts.spec · I:queue.e2e | P3 | [đã đo, 2026-10-14, Đạt — I-server, U-server] |
| TC-087 | EP | R-23 | Thành viên | — | `voicePreset` = "robot" | `VALIDATION` | U:contracts.spec | P3 | [đã đo, 2026-10-14, Đạt — U-server] |
| TC-088 | ST (cấm) | R-23 | Thành viên | Bài của mình đang `PLAYING` | Sửa lời chúc | `STALE_ITEM` | I:queue.e2e | P3 | [đã đo, 2026-10-14, Đạt — I-server] |

## 6. Phát nhạc, chuyển bài, bỏ phiếu

| ID | Kỹ thuật | Quy tắc / Trạng thái | Vai trò | Điều kiện trước & dữ liệu | Bước thao tác | Kết quả mong đợi | Kiểm chứng | Ưu tiên | Trạng thái |
|---|---|---|---|---|---|---|---|---|---|
| TC-090 | ST (PLAYING→PLAYED) | R-24, R-33 | Máy phát | X đang phát, Y đứng đầu hàng chờ | `player:report ended X` | X → `PLAYED`; Y → `PLAYING`; `lastPlayedAt` của người thêm Y được cập nhật; `version` +1 | I:playback.e2e | P1 | [đã đo, 2026-10-14, Đạt — E2E, I-server] |
| TC-091 | EG (gửi lặp) | R-24, I-06 | Máy phát | X đang phát | `ended X` gửi 2 lần | Lần 2 trả `STALE_ITEM`; Y không bị nhảy qua | I:playback.e2e | P1 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-092 | EG (đồng thời) | R-24, I-01 | Máy phát + 3 thành viên | Cần 2 phiếu, đã có 1 | Đồng thời: `ended X` và phiếu thứ 2 | Chỉ chuyển 1 bài; đúng 1 `PLAYING` | I:concurrency.e2e | P1 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-093 | BVA | R-25 | Thành viên | 5 người online (không tính thiết bị), ngưỡng 50% | 2 phiếu, rồi phiếu thứ 3 | Nút hiện `Bỏ qua (2/3)`, chưa bỏ qua; phiếu thứ 3 thì bỏ qua | U:skip-votes.spec · I:playback.e2e | P1 | [đã đo, 2026-10-14, Đạt — E2E, I-server, U-server] |
| TC-094 | BVA | R-25 | Thành viên | 4 online / 1 online | 2 phiếu / 1 phiếu | 4 online cần 2 phiếu thì bỏ qua; 1 online cần 1 phiếu thì bỏ qua | U:skip-votes.spec | P2 | [đã đo, 2026-10-14, Đạt — U-server] |
| TC-095 | BVA | R-25, R-47 | — | Ngưỡng 100%, 3 online | 2 phiếu, rồi 3 phiếu | Cần đủ 3 phiếu | U:skip-votes.spec | P2 | [đã đo, 2026-10-14, Đạt — U-server] |
| TC-096 | EG (gửi lặp) | R-25 | Thành viên | — | Bấm `Bỏ qua` 2 lần | Chỉ tính 1 phiếu | I:playback.e2e | P2 | [đã đo, 2026-10-14, Đạt — I-server, U-server] |
| TC-097 | INV + EG (mất mạng) | R-25, I-09 | Thành viên | 4 online, 1 người đã bỏ phiếu rồi tắt Wi-Fi | Xem nút | Nút hiện `Bỏ qua (0/2)` (3 online → cần ceil(1,5) = 2) | I:playback.e2e | P2 | [đã đo, 2026-10-14, Đạt — I-server, U-server] |
| TC-098 | ST | R-25 | — | 3 online, cần 2 phiếu, đã có 1 phiếu; một người chưa bỏ phiếu rời phòng | Người đó `Rời phòng` | Còn 2 online, cần 1 phiếu, đã đủ → bài tự bị bỏ qua | I:playback.e2e | P2 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-099 | UC | R-26 | Admin | Đang phát | `Bỏ qua ngay` | Bài hiện tại → `SKIPPED`; phát bài tiếp; nhật ký ghi "đã bỏ qua" | I:playback.e2e | P1 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-100 | ST (PLAYING↔PAUSED) | R-26, R-32 | Người điều khiển | Đang ở giây 30 | `Tạm dừng`, chờ 10 giây, rồi `Phát` | Trong lúc tạm dừng, vị trí giữ ở 30; bấm `Phát` thì tiếp tục từ 30 (sai lệch ≤ 1 giây) | I:playback.e2e | P1 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-101 | ST (cấm IDLE→PAUSED) | R-26 | Admin | Phòng `IDLE` | `playback:control pause` | `STALE_ITEM`; trạng thái vẫn `IDLE` | I:playback.e2e | P3 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-102 | BVA | R-26 | Admin | Bài dài 200 giây | seek -1 / 0 / 200 / 201; bài không rõ thời lượng: seek 5000 | -1 và 201: `VALIDATION`; 0 và 200: được; không rõ thời lượng: được | I:playback.e2e | P3 | [đã đo, 2026-10-14, Đạt — I-server, U-server] |
| TC-103 | EG (máy phát im lặng) | R-30 | — | Bài 30 giây, máy phát không gửi `ended` | Chờ (đồng hồ giả) | Tại giây 35, server tự chuyển bài; không chuyển trước giây 35 | U:playback.service.spec | P1 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-104 | DT | R-29 | Máy phát | — | `player:report error` với code 150 / 2 / 999 | 150 và 2: bài → `SKIPPED`, phát bài tiếp, nhật ký "bỏ qua vì video lỗi". 999: `VALIDATION` | I:playback.e2e | P1 | [đã đo, 2026-10-14, Đạt — E2E, I-server, U-server] |
| TC-105 | ST (PLAYING→PLAYING, dự phòng) | R-31 | — | Có playlist dự phòng 25 bài; 20 bài gần nhất đã phát | Hàng chờ trống, bài hiện tại kết thúc | Phát một bài **không** nằm trong 20 bài gần nhất; người thêm hiện "Playlist dự phòng" | U:fallback.spec · I:playback.e2e | P2 | [đã đo, 2026-10-14, Đạt — I-server, U-server] |
| TC-106 | ST (PLAYING→IDLE) | R-31 | — | Không có playlist dự phòng | Bài cuối kết thúc | `IDLE`; máy phát hiện "Đang chờ bài… Quét mã QR để thêm bài." | I:playback.e2e · E:playback | P1 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-107 | EG (tích hợp lỗi) | R-31 | — | URL playlist dự phòng lỗi hoặc playlist trống | Hàng chờ cạn | `IDLE` và log `warn`; không lặp vô hạn | U:fallback.spec | P2 | [đã đo, 2026-10-14, Đạt — I-server, U-server] |
| TC-108 | EG (ứng dụng bị tắt) | R-12, R-32 | — | Đang phát ở giây 40 | Khởi động lại container api | Trạng thái được khôi phục, hẹn giờ được tạo lại; máy phát kết nối lại và phát tiếp từ khoảng giây 40 + thời gian đã trôi | I:persistence.e2e | P1 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-109 | EG (lệch giờ, múi giờ) | R-50 | Thành viên | Đồng hồ máy khách lệch +5 phút, múi giờ UTC−5 | Xem thanh tiến độ và giờ của tin chat | Thanh tiến độ đúng (sai lệch ≤ 1 giây); giờ chat hiện theo giờ máy với định dạng `HH:mm` | U:time.test | P2 | [đã đo, 2026-10-14, Đạt — I-server, U-client] |

## 7. Máy phát và lease

| ID | Kỹ thuật | Quy tắc / Trạng thái | Vai trò | Điều kiện trước & dữ liệu | Bước thao tác | Kết quả mong đợi | Kiểm chứng | Ưu tiên | Trạng thái |
|---|---|---|---|---|---|---|---|---|---|
| TC-120 | UC | R-27 | Khách (máy phát) | PIN 1234 | Mở `/r/K7M2QX/host` → `Mã PIN quản trị` = "1234" → `Mở máy phát` | Hiện màn hình máy phát: QR, "Mã phòng: K7M2QX", "Tiếp theo"; tab Mọi người có thiết bị mang nhãn `Máy phát` | I:player.e2e · E:playback | P1 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-121 | EG | R-08, R-27 | Khách | — | Nhập PIN sai ở trang máy phát | "Mã PIN không đúng. Bạn còn 4 lần thử." (dùng chung bộ đếm với `admin:claim`) | I:player.e2e | P2 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-122 | ST (A→B) | R-27, I-07 | 2 máy phát | Máy A đang phát | Máy B mở `/host` và nhập PIN | A hiện "Máy phát đã được mở ở thiết bị khác. Trang này đã dừng phát." và nút `Phát ở máy này`; B phát tiếp đúng vị trí | I:player.e2e | P1 | [đã đo, 2026-10-14, Đạt — E2E, I-server, U-server] |
| TC-123 | BVA (lease) | R-27 | — | A giữ lease, ngừng gửi báo cáo | Đồng hồ giả: 19 giây, rồi 21 giây | 19 giây: vẫn giữ lease. 21 giây: hết hạn; máy thành viên hiện "Máy phát đang mất kết nối. Hàng chờ vẫn nhận bài mới." | U:lease.spec · I:player.e2e | P1 | [đã đo, 2026-10-14, Đạt — I-server, U-server] |
| TC-124 | EG (mất mạng) | R-32 | Máy phát | Mất mạng 30 giây trong lúc phát | Mạng trở lại | Máy phát tự đăng ký lại lease và phát tiếp đúng vị trí (sai lệch ≤ 2 giây); banner trên máy thành viên biến mất | I:player.e2e | P1 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-125 | PM (PM-09) | R-28 | Thành viên | Không giữ lease | Gửi `player:report ended` | `FORBIDDEN`; không chuyển bài | I:player.e2e | P1 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-126 | EG (nền tảng) | — | Máy phát | Trình duyệt chặn tự phát | Mở trang máy phát | Hiện nút `▶ Bắt đầu phát`; bấm vào thì nhạc phát và nút biến mất | M | P1 | [chỉ kiểm được ở thiết bị: cần loa thật + người nghe; đã kiểm phần hiển thị nút ▶ Bắt đầu phát (E2E) và tự bắt đầu khi trình duyệt đã có tương tác] |
| TC-127 | UC | R-34 | Máy phát + thành viên | Bài Y có lời chúc "Chúc mừng sinh nhật" | Y bắt đầu phát | Máy phát đọc lời chúc, nhạc giảm còn 20% trong lúc đọc rồi trở lại 100%; máy thành viên **không** phát tiếng | U:player-effects.test · M | P2 | [đã đo, 2026-10-14, Đạt — E2E] |
| TC-128 | UC | R-34, R-40 | DJ | — | Soundboard → "airhorn" | Máy phát phát âm thanh; máy thành viên chỉ hiện hiệu ứng | U:player-effects.test · M | P2 | [đã đo, 2026-10-14, Đạt — E2E] |
| TC-129 | UC (luồng thay thế) | R-14, R-27 | Thành viên có `canPlay` | Admin đã `Đặt làm máy phát` cho An | An đang mở tab `Phòng` | Trình phát YouTube hiện ngay trên máy An; An nhận lease | I:player.e2e | P2 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-130 | ST (thu hồi) | R-10, R-27 | Admin | Có thiết bị phát | `Mời ra khỏi phòng` thiết bị phát | Máy phát dừng và hiện "Bạn đã được mời ra khỏi phòng."; lease bị xóa; máy thành viên hiện banner chưa có máy phát | I:player.e2e | P2 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-131 | EG (pháp lý, nền tảng) | Chính sách YouTube | Máy phát | Màn hình 1280×720 | Đo kích thước iframe | ≥ 200×200 px và không bị che khuất | E:playback | P2 | [đã đo, 2026-10-14, Đạt — M: bản Docker production + YouTube thật, iframe 496×279 px] |

## 8. Tìm kiếm

| ID | Kỹ thuật | Quy tắc | Vai trò | Điều kiện trước & dữ liệu | Bước thao tác | Kết quả mong đợi | Kiểm chứng | Ưu tiên | Trạng thái |
|---|---|---|---|---|---|---|---|---|---|
| TC-140 | UC | R-35 | Thành viên | Có key | Tab `Thêm bài` → "lac troi" → `Tìm` → `Thêm` ở kết quả đầu | Tối đa 10 kết quả, mỗi kết quả có tiêu đề, kênh và thời lượng `m:ss`; thêm được | I:search.e2e | P1 | [đã đo, 2026-10-14, Đạt — I-server, U-server] |
| TC-141 | DT | R-35 | Thành viên | Không có key | Nhập từ khóa → `Tìm` | "Máy chủ chưa bật tìm kiếm. Hãy dán link YouTube để thêm bài."; dán link vẫn chạy | I:search.e2e | P1 | [đã đo, 2026-10-14, Đạt — I-server, U-server] |
| TC-142 | DT | R-35 | Thành viên | `search.list` trả 403 `quotaExceeded` | `Tìm` | "Hôm nay đã hết lượt tìm kiếm. Hãy dán link YouTube để thêm bài." | U:youtube.provider.spec | P2 | [đã đo, 2026-10-14, Đạt — U-server] |
| TC-143 | EP (đa ngôn ngữ) | R-35 | Thành viên | — | Tìm "Sơn Tùng", sau đó tìm "son  tung" | Lần 2 trúng cache, không gọi YouTube (bộ đếm `nock` = 1) | U:search.service.spec | P2 | [đã đo, 2026-10-14, Đạt — I-server, U-server] |
| TC-144 | BVA | R-35 | Thành viên | — | Từ khóa dài 0 / 1 / 100 / 101 ký tự | 0: nút vô hiệu; 1 và 100: được; 101: `VALIDATION` | U:contracts.spec | P3 | [đã đo, 2026-10-14, Đạt — U-server] |
| TC-145 | BVA | R-35 | Thành viên | — | 10 lượt tìm trong 1 giờ, rồi lượt thứ 11 | Lượt 11: "Bạn thao tác hơi nhanh. Hãy thử lại sau {n} giây." | I:search.e2e | P2 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-146 | EG (tích hợp chậm) | R-37 | Thành viên | `search.list` timeout 2 lần | `Tìm` | "Máy chủ đang gặp sự cố. Hãy thử lại sau ít phút." | U:youtube.provider.spec | P2 | [đã đo, 2026-10-14, Đạt — U-server] |
| TC-147 | EG (cấu hình sai) | R-36 | — | Key sai (400 `keyInvalid`) | `Tìm` / thêm bài bằng link | Tìm: `SEARCH_UNAVAILABLE` và log `error` "YOUTUBE_API_KEY không hợp lệ". Thêm bằng link: chuyển sang oEmbed | U:youtube.provider.spec | P2 | [đã đo, 2026-10-14, Đạt — U-server] |
| TC-148 | EP | R-35 | Thành viên | — | Dán link vào ô tìm kiếm | Nút đổi nhãn thành `Thêm vào hàng chờ`; không gọi `search.list` | M · U:add-input.test | P3 | [đã đo, 2026-10-14, Đạt — U-client] |
| TC-149 | BVA | R-35 | — | Cache tạo lúc t=0 | Tìm lại lúc 23:59 và lúc 24:01 | 23:59: trúng cache; 24:01: gọi YouTube lại | U:search.service.spec | P3 | [đã đo, 2026-10-14, Đạt — U-server] |
| TC-150 | EP | R-17 | — | `search.list` trả 1 video livestream và 1 video không cho nhúng | `Tìm` | Hai video đó bị lọc khỏi kết quả | U:youtube.provider.spec | P3 | [đã đo, 2026-10-14, Đạt — I-server] |

## 9. Chat, reaction, DJ, nhật ký

| ID | Kỹ thuật | Quy tắc | Vai trò | Điều kiện trước & dữ liệu | Bước thao tác | Kết quả mong đợi | Kiểm chứng | Ưu tiên | Trạng thái |
|---|---|---|---|---|---|---|---|---|---|
| TC-160 | UC + REG | R-38 | Thành viên | — | Ô `Nhắn gì đó…` → "hello" → `Gửi` | Tin nhắn hiện ở mọi máy, tên người gửi là "An" (do server điền), giờ `HH:mm` | I:social.e2e | P2 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-161 | BVA | R-38 | Thành viên | — | Tin dài 0 / 500 / 501 ký tự | 0: nút vô hiệu; 500: gửi được; 501: không gõ được, gửi thẳng lên server thì `VALIDATION` | U:contracts.spec | P3 | [đã đo, 2026-10-14, Đạt — U-server] |
| TC-162 | BVA | R-38 | Thành viên | — | 5 tin trong 10 giây, rồi tin thứ 6 | Tin 6: thông báo `RATE_LIMITED` | I:social.e2e | P3 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-163 | EG (bảo mật) | R-38 | Thành viên | — | Gửi `<img src=x onerror=alert(1)>` | Hiện nguyên văn dạng chữ; không chạy script | E:security | P1 | [đã đo, 2026-10-14, Đạt — E2E, I-server] |
| TC-164 | BVA + ST | R-38 | Thành viên | Phòng đã có 200 tin | Gửi tin thứ 201, rồi tải lại trang | Thấy 200 tin gần nhất (tin cũ nhất bị bỏ) | I:social.e2e | P3 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-165 | EP | R-39 | Thành viên | — | Reaction "🔥" / "💩" | "🔥": hiệu ứng bay ở mọi máy; "💩": `VALIDATION` | I:social.e2e | P3 | [đã đo, 2026-10-14, Đạt — I-server, U-server] |
| TC-166 | BVA | R-39 | Thành viên | — | 11 reaction trong 10 giây | Lần 11 bị từ chối với `RATE_LIMITED` (không hiện toast, chỉ không bay) | I:social.e2e | P3 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-167 | BVA | R-40 | DJ | — | Bấm 2 lần cách nhau 1 giây; rồi lần nữa sau 1,6 giây | Lần 2 bị bỏ qua (không có âm thanh thứ hai); lần 3 phát | I:social.e2e | P3 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-168 | UC | R-47 | Thành viên mới | `allowGuestDj = true` | Vào phòng | Có nhãn `DJ` và thấy soundboard | I:social.e2e | P3 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-169 | UC + REG | R-41 | Thành viên | — | Header → `Nhật ký` | Thấy các sự kiện kèm giờ; tối đa 200 mục | I:social.e2e · M | P3 | [đã đo, 2026-10-14, Đạt — I-server] |

## 10. Cấu hình phòng

| ID | Kỹ thuật | Quy tắc | Vai trò | Điều kiện trước & dữ liệu | Bước thao tác | Kết quả mong đợi | Kiểm chứng | Ưu tiên | Trạng thái |
|---|---|---|---|---|---|---|---|---|---|
| TC-180 | UC + INV | R-47, I-09 | Admin | 4 online | `Cài đặt phòng` → `Tỉ lệ phiếu để bỏ qua (%)` = 75 → `Lưu cài đặt` | "Đã lưu cài đặt phòng"; nút bỏ qua ở mọi máy đổi thành `Bỏ qua (0/3)` | I:settings.e2e | P2 | [đã đo, 2026-10-14, Đạt — E2E, I-server] |
| TC-181 | BVA | R-47 | Admin | — | Tỉ lệ phiếu = 9 / 10 / 100 / 101 (%) | 10 và 100: được; 9 và 101: dưới ô hiện "Nhập từ 10 đến 100", server trả `VALIDATION` | U:contracts.spec | P3 | [đã đo, 2026-10-14, Đạt — U-client, U-server] |
| TC-182 | BVA | R-47 | Admin | — | Số bài tối đa mỗi người = 0 / 1 / 20 / 21 | 1 và 20: được; 0 và 21: không hợp lệ | U:contracts.spec | P3 | [đã đo, 2026-10-14, Đạt — U-server] |
| TC-183 | BVA + đơn vị | R-47 | Admin | — | Độ dài tối đa (phút) = 0 / 1 / 120 / 121 / 1,5 | 0 → 0 giây; 1 → 60 giây; 120 → 7200 giây; 121 và 1,5: không hợp lệ | U:settings-form.test · U:contracts.spec | P2 | [đã đo, 2026-10-14, Đạt — U-client, U-server] |
| TC-184 | EP | R-47 | Admin | — | Playlist dự phòng = link `watch?v=` / link `playlist?list=PL…` / để trống | `watch?v=`: không hợp lệ; `playlist`: được; trống: `null` | U:contracts.spec | P3 | [đã đo, 2026-10-14, Đạt — U-client, U-server] |
| TC-185 | INV | R-16, I-04 | Admin | Bình đang có 4 bài chờ | Đổi số bài tối đa thành 2 | 4 bài của Bình vẫn giữ nguyên; Bình thêm bài thì nhận `QUEUE_LIMIT` (2) | I:settings.e2e | P2 | [đã đo, 2026-10-14, Đạt — I-server] |

## 11. Hệ thống, kết nối, bảo mật

| ID | Kỹ thuật | Quy tắc / Bất biến | Vai trò | Điều kiện trước & dữ liệu | Bước thao tác | Kết quả mong đợi | Kiểm chứng | Ưu tiên | Trạng thái |
|---|---|---|---|---|---|---|---|---|---|
| TC-190 | DT | R-45 | — | Database bật / tắt | `GET /api/health` | Bật: 200 `{status:"ok",db:"up",…}`. Tắt: 503 `{db:"down"}` | I:health.e2e | P2 | [đã đo, 2026-10-14, Đạt — I-server, U-server] |
| TC-191 | EG (cấu hình sai) | R-46 | Người cài đặt | Thiếu `DATABASE_URL` / `PUBLIC_URL` = "abc" | Khởi động api | Thoát với mã khác 0, log ghi "Biến môi trường không hợp lệ: PUBLIC_URL (phải là URL http/https)" | U:env.spec | P1 | [đã đo, 2026-10-14, Đạt — U-server] |
| TC-192 | EG (lệch phiên bản) | R-44 | Thành viên | Server trả `contractsVersion` khác client | Mở phòng | Banner "Có phiên bản mới. Hãy tải lại trang." kèm nút `Tải lại` | U:version.test | P2 | [đã đo, 2026-10-14, Đạt — U-client (lib/version.test.ts)] |
| TC-193 | INV | R-49, I-02 | Thành viên | Nhận `room:update` v=5, rồi v=4 tới muộn | — | Bản v=4 bị bỏ qua; giao diện giữ v=5 | U:room-store.test | P1 | [đã đo, 2026-10-14, Đạt — U-client] |
| TC-194 | EG (dữ liệu quá lớn) | R-42 | Kẻ phá | — | Gửi gói tin 200 KB | Socket bị ngắt; server không bị crash | I:security.e2e | P2 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-195 | EG | R-42 | Thành viên | — | Gửi sự kiện tên lạ "foo:bar" / payload không phải object | Bị bỏ qua hoặc trả `VALIDATION`; server không bị crash | I:security.e2e | P2 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-196 | UC + REG | R-48 | Khách | Link cũ | Mở `/room/K7M2QX` | Chuyển hướng 308 sang `/r/K7M2QX` | E:create-join | P2 | [đã đo, 2026-10-14, Đạt — E2E] |
| TC-197 | INV (quyền riêng tư) | I-08 | — | Phòng có admin và thiết bị phát | Quét đệ quy snapshot và mọi sự kiện phát ra | Không có các khóa `token`, `adminPinHash`, `socketId`, `tokenVersion`, `ip` | I:security.e2e | P1 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-198 | EG (bảo mật) | R-42 | Trang web lạ | Origin `http://evil.test` | Kết nối socket | Bị từ chối (CORS hoặc origin không nằm trong `CORS_ORIGINS`) | I:security.e2e | P1 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-199 | UC (ngoại lệ) | R-12 | — | Phòng có hàng chờ, chat, quyền | Khởi động lại api | Mọi thứ được giữ nguyên | I:persistence.e2e | P1 | [đã đo, 2026-10-14, Đạt — I-server] |
| TC-200 | EG (mất mạng) | — | Thành viên | — | Tắt mạng 10 giây rồi bật lại | Banner "Đang kết nối lại…" hiện rồi biến mất; dữ liệu được đồng bộ theo snapshot mới | E:reconnect | P2 | [đã đo, 2026-10-14, Đạt — E2E] |
| TC-201 | EG (tích hợp chậm) | — | Thành viên | Server không gửi ack trong 8 giây | `Thêm vào hàng chờ` | "Không kết nối được máy chủ. Hãy kiểm tra mạng rồi thử lại."; nút được bật lại | U:socket-client.test | P2 | [đã đo, 2026-10-14, Đạt — U-client] |
| TC-202 | UC | Spec §13 | Người cài đặt | Máy sạch, có Docker | Làm theo `deploy/README.md`: điền `.env` → `docker compose up -d` → mở `http://localhost:8080` | Tạo phòng và phát được trong vòng dưới 15 phút | M (Docker cục bộ) | P1 | [đã đo, 2026-10-14, Đạt — M: docker compose build+up trên máy dev ~1,5 phút; health 200, WebSocket qua Caddy, thêm bài thật qua oEmbed, máy phát báo tiến độ] |

## 12. Tổ hợp cặp (pairwise): nền tảng × cấu hình

Các yếu tố: Trình duyệt {Chrome desktop, Safari iOS, Chrome Android, Firefox desktop} × Vai trò {Thành viên, Admin, Máy phát} × Key YouTube {có, không} × Playlist dự phòng {có, không}. Phủ đủ mọi cặp giá trị bằng 8 dòng:

| ID | Trình duyệt | Vai trò | Key | Playlist dự phòng | Luồng kiểm | Trạng thái |
|---|---|---|---|---|---|---|
| PW-01 | Chrome desktop | Máy phát | có | có | Phát hết hàng chờ rồi sang dự phòng | [đã đo một phần, 2026-10-14 — máy phát Chrome desktop: E2E (player giả) + Docker (YouTube thật); key + playlist dự phòng: I-server TC-105 với YouTube giả lập. Chưa đo với key thật] |
| PW-02 | Chrome desktop | Thành viên | không | không | Thêm bằng link, phát hết thì IDLE | [đã đo, 2026-10-14, Đạt — Docker không key: thêm link thật qua oEmbed; giao diện desktop 1366px (ảnh chụp); IDLE: I-server TC-106] |
| PW-03 | Safari iOS | Thành viên | có | không | Tìm, thêm, ❤️, bỏ phiếu | [chỉ kiểm được ở thiết bị: cần iPhone thật, Playwright WebKit chỉ là xấp xỉ] |
| PW-04 | Safari iOS | Admin | không | có | Cài đặt phòng, mời ra | [chỉ kiểm được ở thiết bị: cần iPhone thật] |
| PW-05 | Chrome Android | Máy phát | không | không | Nút "Bắt đầu phát", khóa màn hình | [chỉ kiểm được ở thiết bị: cần điện thoại Android] |
| PW-06 | Chrome Android | Admin | có | có | Ghim bài, bỏ qua ngay | [chỉ kiểm được ở thiết bị] |
| PW-07 | Firefox desktop | Thành viên | có | có | Chat, reaction, nhật ký | [chưa đo — Playwright 1.64 cần Firefox build 1555 chưa có trên máy; chạy `npx playwright install firefox` rồi chạy E2E với project Firefox] |
| PW-08 | Firefox desktop | Máy phát | không | không | Phát, mất mạng, phát tiếp | [chưa đo — như PW-07] |

## 13. Hồi quy tính năng cũ (REG)

| ID | Tính năng cũ | Kiểm | Kiểm chứng | Ưu tiên | Trạng thái |
|---|---|---|---|---|---|
| REG-01 | Chat | TC-160 | I:social.e2e | P2 | [đã đo, 2026-10-14, Đạt — qua TC-160] |
| REG-02 | Reaction bay trên màn hình (`HeartCanvas`) | TC-165 | I:social.e2e · M | P3 | [đã đo, 2026-10-14, Đạt — qua TC-165] |
| REG-03 | Soundboard DJ và quyền DJ | TC-128, TC-167, PM-15 | I:social.e2e | P2 | [đã đo, 2026-10-14, Đạt — qua TC-128, TC-167, PM-15] |
| REG-04 | Lời chúc TTS và 6 kiểu giọng | TC-086, TC-127 | I:queue.e2e · M | P2 | [đã đo, 2026-10-14, Đạt — qua TC-086, TC-127] |
| REG-05 | Popup nhật ký hoạt động | TC-169 | M | P3 | [đã đo, 2026-10-14, Đạt — I-server (TC-169) + E2E (TC-104 mở Nhật ký)] |
| REG-06 | Nút chia sẻ (sao chép link) | Bấm `Chia sẻ` → "Đã sao chép link phòng"; link là `/r/CODE` | M | P3 | [đã đo, 2026-10-14, Đạt — M: nút Chia sẻ hiện "Đã sao chép link phòng" (Browser pane)] |
| REG-07 | Tên trùng bị từ chối | TC-016 | I:rooms.e2e | P2 | [đã đo, 2026-10-14, Đạt — qua TC-016] |
| REG-08 | Giới hạn 4 bài | TC-055 | I:queue.e2e | P2 | [đã đo, 2026-10-14, Đạt — qua TC-055] |
| REG-09 | Bỏ phiếu bỏ qua | TC-093 | I:playback.e2e | P1 | [đã đo, 2026-10-14, Đạt — qua TC-093] |
| REG-10 | Kéo thả đổi thứ tự (đã bỏ) | Không còn nút Lên/Xuống; có `Phát tiếp theo` thay thế | M | P3 | [đã đo, 2026-10-14, Đạt — E2E/ảnh chụp: không còn nút Lên/Xuống, có Phát tiếp theo] |

---

## 14. Bảng truy vết và độ phủ (trước khi viết code)

### 14.1 Quy tắc → case (✓ = đạt · ✗ = vi phạm)

| Quy tắc | Case đạt (✓) | Case vi phạm (✗) |
|---|---|---|
| R-01 | TC-001, TC-002, TC-005 | TC-003, TC-004 |
| R-02 | TC-008, TC-011, TC-012 | TC-013, TC-014, TC-009 |
| R-03 | TC-006 (1, 50) | TC-006 (rỗng, 51) |
| R-04 | TC-007 (4, 8) | TC-007 (3, 9, chữ, số toàn chiều rộng) |
| R-05 | TC-017 ("Duc"), TC-018 (1, 30), TC-019 | TC-016, TC-017 ("đức"), TC-018 (31) |
| R-06 | TC-020 | TC-021, TC-022 |
| R-07 | TC-023 | — (không có dạng vi phạm; trạng thái offline được kiểm ở TC-023) |
| R-08 | TC-030, TC-033 (15:01) | TC-031, TC-032, TC-033 (14:59) |
| R-09 | PM-01…PM-17 | TC-034 |
| R-10 | TC-035, TC-041 | TC-035 (dùng lại token cũ) |
| R-11 | TC-024, TC-025 | TC-024 (dùng lại token cũ) |
| R-12 | TC-026, TC-199 | — (vi phạm nghĩa là "phòng mất"; TC-026 và TC-199 kiểm điều ngược lại) |
| R-13 | TC-042 | TC-036, TC-037, TC-039, TC-040, PM-10…PM-12 |
| R-14 | TC-038, TC-129 | TC-038 (người cũ mất quyền) |
| R-15 | TC-050, TC-051, TC-052 | TC-053 |
| R-16 | TC-055 (bài 4), TC-185 | TC-055 (bài 5), TC-185 |
| R-17 | TC-056 (599, 600), TC-057, TC-061 | TC-056 (601), TC-058, TC-059, TC-060 |
| R-18 | TC-070…TC-077 | TC-075 (❤️ không được vượt vòng) |
| R-19 | TC-050, TC-066 | TC-066 (bài thứ hai không được phát cùng lúc) |
| R-20 | TC-080 | TC-081, TC-082, PM-03 |
| R-21 | TC-083, TC-073 | PM-04 |
| R-22 | TC-084 | TC-085, PM-05 (thiết bị) |
| R-23 | TC-086 (200, rỗng) | TC-086 (201), TC-087, TC-088, PM-06 |
| R-24 | TC-090 | TC-091, TC-092 |
| R-25 | TC-093, TC-094, TC-095, TC-098 | TC-093 (thiếu phiếu), TC-096, TC-097 |
| R-26 | TC-099, TC-100, TC-102 (0, 200) | TC-101, TC-102 (−1, 201), PM-08 |
| R-27 | TC-120, TC-122, TC-123 (19 giây) | TC-121, TC-123 (21 giây) |
| R-28 | TC-090 | TC-125, TC-091 |
| R-29 | TC-104 (150, 2) | TC-104 (999) |
| R-30 | TC-103 (35 giây) | TC-103 (không chuyển trước 35 giây) |
| R-31 | TC-105 | TC-106, TC-107 |
| R-32 | TC-100, TC-108, TC-124 | — (vi phạm nghĩa là "phát lại từ đầu"; các case trên kiểm điều ngược lại) |
| R-33 | TC-090, TC-071 | — (kiểm gián tiếp qua TC-071) |
| R-34 | TC-127, TC-128 | TC-127 (máy thành viên không có tiếng) |
| R-35 | TC-140, TC-143, TC-149 | TC-141, TC-142, TC-144, TC-145 |
| R-36 | TC-061, TC-065 | TC-147 |
| R-37 | TC-063 | TC-064, TC-146 |
| R-38 | TC-160, TC-164 | TC-161, TC-162, TC-163 |
| R-39 | TC-165 ("🔥") | TC-165 ("💩"), TC-166 |
| R-40 | TC-128, TC-167 | TC-167, PM-15 |
| R-41 | TC-169 | — (không có dạng vi phạm) |
| R-42 | TC-054 (2048) | TC-034, TC-054 (2049), TC-194, TC-195 |
| R-43 | TC-010 (1–20) | TC-010 (lần 21) |
| R-44 | — | TC-192 |
| R-45 | TC-190 (bật) | TC-190 (tắt) |
| R-46 | — | TC-191 |
| R-47 | TC-180…TC-184 (hợp lệ) | TC-181…TC-184 (không hợp lệ) |
| R-48 | TC-196 | — |
| R-49 | TC-193 (v=5) | TC-193 (v=4) |
| R-50 | TC-109 | — |

### 14.2 Chuyển trạng thái → case

| Đối tượng | Chuyển hợp lệ đã phủ | Chuyển bị cấm đã phủ |
|---|---|---|
| QueueItem | mới→QUEUED (TC-051), mới→PLAYING (TC-050), QUEUED→PLAYING (TC-090), QUEUED→REMOVED (TC-080, TC-035), PLAYING→PLAYED (TC-090), PLAYING→SKIPPED (TC-093, TC-099, TC-104) | PLAYING→REMOVED (TC-081), REMOVED→* (TC-082), PLAYING→❤️ hoặc lời chúc (TC-085, TC-088), PLAYED→PLAYING (TC-091) |
| PlaybackState | IDLE→PLAYING (TC-050), PLAYING→PLAYING (TC-090, TC-105), PLAYING→IDLE (TC-106), PLAYING↔PAUSED (TC-100), PAUSED→IDLE (TC-099 khi hàng chờ trống) | IDLE→PAUSED (TC-101) |
| Member | mới→Online (TC-001, TC-011), Online↔Offline (TC-023, TC-020), Online→Đã rời (TC-024), →Bị mời ra (TC-035) | Đã rời→Online bằng token cũ (TC-024), Bị mời ra→Online bằng token cũ (TC-035), tự hạ quyền (TC-036) |
| Lease | Không có→Giữ (TC-120), Giữ A→Giữ B (TC-122), Giữ→Hết hạn (TC-123), Hết hạn→Giữ (TC-124), Giữ→Không có (TC-130) | Báo cáo khi không giữ lease (TC-125) |

### 14.3 Bất biến → case

| Bất biến | Case |
|---|---|
| I-01 | TC-066, TC-092, TC-090 |
| I-02 | TC-090, TC-193 |
| I-03 | TC-084 |
| I-04 | TC-055, TC-185 |
| I-05 | TC-078 |
| I-06 | TC-062, TC-091 |
| I-07 | TC-122 |
| I-08 | TC-197 |
| I-09 | TC-097, TC-180 |
| I-10 | TC-016, TC-025 |
| I-11 | TC-078 |

### 14.4 Danh sách rủi ro bắt buộc (đoán lỗi) → case

| Rủi ro | Case |
|---|---|
| Quyền bị từ chối hoặc thu hồi giữa chừng | TC-039, TC-040, TC-035, TC-130 |
| Thao tác lặp hoặc gửi lại | TC-062, TC-082, TC-091, TC-096 |
| Nhiều tiến trình hoặc thiết bị cùng lúc | TC-066, TC-092, TC-122, TC-023 |
| Mất mạng hoặc ứng dụng bị tắt giữa chừng | TC-097, TC-108, TC-124, TC-200, TC-201 |
| Dữ liệu thiếu, trùng, sai định dạng hoặc quá lớn | TC-016, TC-019, TC-053, TC-054, TC-194, TC-195 |
| Đơn vị và làm tròn | TC-056 (hiển thị m:ss), TC-097 (ceil), TC-183 (phút sang giây) |
| Ngày giờ, múi giờ, đổi giờ | TC-033, TC-109, TC-149. Việt Nam không đổi giờ theo mùa; server lưu UTC; hẹn giờ dựa trên khoảng thời gian chứ không dựa trên giờ địa phương, nên đổi giờ (DST) không ảnh hưởng |
| Đa ngôn ngữ | TC-017, TC-067, TC-143 |
| Phiên bản cũ / mới của nền tảng | TC-192, TC-196, PW-03…PW-08 |
| Tích hợp bên ngoài lỗi hoặc chậm | TC-059, TC-063, TC-064, TC-065, TC-107, TC-142, TC-146, TC-147 |
| Bảo mật và quyền riêng tư | TC-019, TC-034, TC-163, TC-194, TC-197, TC-198, toàn bộ PM |

### 14.5 Tổng hợp độ phủ (trước khi viết code)

| Tiêu chí | Số case | Lỗ hổng |
|---|---|---|
| Quy tắc R-01…R-50 | 50/50 quy tắc có case. R-07, R-12, R-32, R-33, R-41, R-48, R-50 không có case "vi phạm" vì quy tắc mô tả một bảo đảm chứ không mô tả dữ liệu nhập; case đạt đã kiểm điều ngược lại | 0 |
| Chuyển trạng thái | 19 chuyển hợp lệ và 9 chuyển bị cấm | 0 |
| Biên (dưới / đúng / trên) | 18 nhóm biên | 0 |
| Cột bảng quyết định | Tạo phòng 4 cột, thêm bài 6 cột, lỗi phát 3 cột, health 2 cột | 0 |
| Ô vai trò × thao tác | 18 thao tác × 7 vai trò = 126 ô (PM-01…PM-18) | 0 |
| Bất biến | 11/11 | 0 |
| Danh sách rủi ro bắt buộc | 11/11 nhóm | 0 |
| Tổng số case | 136 case TC, 18 dòng PM, 8 dòng PW, 10 dòng REG | — |

**Những phần chưa đo được trong môi trường hiện tại (lý do):**
- PW-03…PW-06 cần iPhone hoặc điện thoại Android thật.
- TC-126 (trình duyệt chặn tự phát) và TC-127/TC-128 (âm thanh thật) cần loa và tai người nghe. Playwright chỉ kiểm được rằng hàm đã được gọi.
- Phát YouTube thật liên tục 1 giờ (tiêu chí thành công số 5 trong spec) cần máy thật.


---

## 15. Kết quả đo (2026-10-14)

| Bộ test | Số test | Đạt | Lỗi |
|---|---|---|---|
| Unit server (Jest) | 132 | 132 | 0 |
| Integration server (Jest + Testcontainers Postgres) | 106 | 106 | 0 |
| Unit client (Vitest) | 42 | 42 | 0 |
| E2E (Playwright, Chrome giả lập Pixel 7 + desktop) | 22 | 22 (chạy lặp 2 lần: 36/36) | 0 |
| Thử trên Docker production (Caddy + YouTube thật, oEmbed) | 6 kiểm tra | 6 | 0 |

| Tiêu chí | Kết quả |
|---|---|
| Case TC | 148 dòng: **146 đạt** (tự động hoặc đo tay), 1 đạt một phần, 1 chỉ kiểm được trên thiết bị thật |
| Ma trận quyền | 18/18 dòng, tức 126/126 ô, đạt (I:permissions.e2e) |
| Pairwise | 1 đạt, 1 đạt một phần, 4 cần thiết bị thật, 2 cần cài Firefox cho Playwright |
| Hồi quy tính năng cũ | 10/10 đạt |

## 16. Lỗi tìm được và đã sửa

| # | Lỗi | Phát hiện bởi | Mức | Case hồi quy |
|---|---|---|---|---|
| B-01 | Test cũ của server hỏng (`uuid@13` chỉ hỗ trợ ESM) | Chạy baseline | P2 | Toàn bộ unit test |
| B-02 | **Ai cũng giả danh admin được** (server tin id do client gửi), CORS `*` | Đọc code `develop` | P1 | TC-034, PM-01…PM-18 |
| B-03 | Restart hoặc phòng trống là mất toàn bộ dữ liệu | Đọc code `develop` | P1 | TC-026, TC-108, TC-199 |
| B-04 | Cache tìm kiếm lưu cả kết quả rỗng nên "kẹt" rỗng 24 giờ | Integration test | P2 | misc.e2e "empty results" |
| B-05 | Máy phát rảnh mất lease sau 20 giây và báo "mất kết nối" sai | Thử tay trên Browser pane | P1 | TC-123 heartbeat |
| B-06 | Màn hình phòng crash: `scrollIntoView()` (Chromium mới) trả về Promise trong `useEffect` | Thử tay trên Browser pane | P1 | E2E "no console errors" |
| B-07 | Banner chứa URL dài và lưới thiếu `grid-cols-1` làm trang rộng hơn màn hình điện thoại, khiến các nút bấm lệch | E2E | P2 | E2E "no horizontal overflow" |
| B-08 | Mất mạng 45 giây mới hiện "Đang kết nối lại…" | E2E | P2 | TC-200 |
| B-09 | Người bị mời ra không thấy thông báo hay hộp thoại vào lại | E2E | P1 | TC-035 (E2E) |
| B-10 | Hydration mismatch: `window.location` dùng trong lúc render (trang máy phát, banner) | Ảnh chụp E2E ("1 Issue") | P3 | E2E "no console errors" |
| B-11 | Image production sẽ crash: `dotenv` và Prisma CLI nằm trong devDependencies | Viết Dockerfile | P1 | TC-202 |
| B-12 | Teardown Testcontainers hỏng do `nock` vá `http` dùng chung | Integration test | P3 | Bộ integration |
| B-13 | **Khóa PIN bị vượt qua bằng hàng trăm lần đoán song song**; `admin:claim` không giới hạn tần suất | Review độc lập | P1 | auth.service.spec (20 lần song song → khóa) |
| B-14 | Lease hết hạn khi socket vẫn kết nối thì loa im lặng vĩnh viễn | Review độc lập | P1 | playback.e2e "review P1-2" |
| B-15 | Thứ tự hiển thị khác thứ tự phát khi có người rời phòng (vi phạm I-05) | Review độc lập | P2 | playback.e2e "review P2-3" |
| B-16 | Người tên "Máy phát" làm hỏng việc đăng ký máy phát | Review độc lập | P2 | playback.e2e "review P2-4" |
| B-17 | Máy phát chạy lại lệnh cũ mỗi khi có `room:update` (tua tới, phát lại một đoạn đầu bài) | Review độc lập | P2 | Sửa logic, kiểm qua TC-090/TC-122 E2E |
| B-18 | Bị thu hồi quyền phát nhưng không dừng, nên hai máy phát cùng lúc | Review độc lập | P2 | audio.spec "review P2-6" |
| B-19 | Âm lượng có thể kẹt ở 20% khi TTS không kết thúc | Review độc lập | P2 | audio.spec "review P2-7" |
| B-20 | Người đã đủ hạn mức vẫn tiêu quota YouTube khi thêm bài; `room:peek` không giới hạn | Review độc lập | P3 | queue.e2e "review P3-8" |
| B-21 | Broadcast lỗi sau commit làm bỏ qua các hiệu ứng phụ; RateLimiter tăng mãi; `playerMemberId` cũ không được xóa | Review độc lập | P3 | permissions.e2e TC-038 (mở rộng) |
