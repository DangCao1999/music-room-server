# Tìm bài chính xác hơn, tốn ít lượt YouTube hơn

Ngày: 2026-10-17 · Server (chính) + client (nhỏ) · Contracts: có thể đổi nhỏ (xem dưới) · Migration: có thể (cột / chỉ mục tìm kiếm)

## Vì sao

Người dùng gõ "người lạ ơi" để tìm bài "Người Lạ Ơi" nhưng nhận toàn "Làm Người Luôn Yêu Em",
"LẠI LÀ DG HOUSE"… Bài đúng chỉ hiện khi bấm "Tìm trên YouTube".

Nguyên nhân (code hiện tại, `src/music/search.service.ts`):
- Câu tìm bị bỏ dấu, tách chữ (`nguoi`, `la`, `oi`); kho bài trả về bài có **đủ các mẩu chữ ở bất kỳ
  đâu**, kể cả giữa một chữ khác: `la` khớp "**là**m", `oi` khớp "ngư**ời**".
- Kết quả xếp theo **bài lưu gần nhất**, không theo mức khớp.
- Kho có ≥ 3 bài là dừng, **không** hỏi YouTube — nên kết quả sai chặn luôn kết quả đúng.
- Kho được giữ chặt vì API YouTube chỉ cho ~10.000 điểm/ngày: một lượt `search.list` tốn **100 điểm**
  (~100 lượt tìm/ngày cho cả app), trong khi `videos.list` (chi tiết video) chỉ tốn **1 điểm**.

## Mục tiêu

- Bài người dùng gõ đúng tên phải lên **đầu danh sách** (đúng ý "chính xác xíu").
- Tốn **ít lượt tìm YouTube** nhất có thể, nhưng không để kho bài làm sai kết quả.
- Có thêm nguồn tìm YouTube **không tốn quota API** (InnerTube), dùng chung với API chính thức.

## Không làm

- Không tìm theo lời bài hát, không tìm theo giọng hát / ngân nga.
- Không gợi ý tự động khi đang gõ (autocomplete) — để sau.
- Không đổi luồng dán link YouTube / link playlist (giữ nguyên).
- Không đổi thời hạn lưu dữ liệu YouTube (28 ngày) và luật bộ nhớ đệm hiện có.

## Điều không được để xảy ra

- Gõ đúng tên bài (có dấu hoặc không dấu) mà bài đó không ở đầu khi YouTube có nó.
- InnerTube hỏng / bị chặn làm **mất** chức năng tìm: luôn phải lùi về API chính thức.
- Kết quả có video không nhúng được hoặc đang phát trực tiếp (như hiện nay đã lọc).
- Tốn quota nhiều hơn hiện nay trong mọi trường hợp.

## Thiết kế

### 1. Tìm trong kho bài (không tốn lượt)

Giữ khoá không dấu hiện có (`searchKey` = tiêu đề + kênh, bỏ dấu, chữ thường). Đổi luật khớp và
cách xếp:

- **Khớp theo chữ trọn vẹn:** mỗi chữ trong câu tìm phải bằng **một chữ** trong khoá (không phải mẩu
  chữ): `la` khớp "lạ", "là", "la" nhưng **không** khớp "làm"; `oi` không khớp "người".
  - Ngoại lệ cho chữ cuối câu: cho phép khớp **đầu chữ** (gõ dở "nguoi la o" vẫn ra "ơi"), vì người
    ta hay bấm Tìm khi chưa gõ hết. *(Quyết định của người viết.)*
- **Điểm khớp** (cao lên đầu), mỗi bài lấy mức cao nhất:
  1. Tiêu đề chứa **nguyên cụm có dấu** (so chữ thường, chuẩn hoá NFC) — "người lạ ơi".
  2. **Nguyên cụm không dấu** liền nhau (theo chữ trọn vẹn) trong tiêu đề — "nguoi la oi"; hoặc trong
     **tên kênh** (xếp sau khớp ở tiêu đề) — để "son tung" khớp kênh "Sơn Tùng M-TP Official".
     *(Quyết định của người viết.)*
  3. Đủ các chữ trọn vẹn nhưng rời rạc; hoặc chỉ khớp nhờ **chữ cuối gõ dở** (khớp đầu chữ).
  - Cùng mức: bài có tiêu đề **ngắn hơn** trước (ít chữ thừa hơn), rồi bài **được phát / thêm nhiều hơn**
    trong phòng (nếu có số liệu sẵn), rồi bài lưu gần nhất. *(Quyết định của người viết.)*
- Câu tìm không có dấu → mức 1 bỏ qua (không phân biệt "lạ"/"là").
- Trả tối đa 10 bài như hiện nay.

### 2. Khi nào dừng ở kho, khi nào hỏi YouTube

- Kho **chắc chắn** → trả kết quả kho (`source: 'library'`), không tốn
  lượt; vẫn có nút "Tìm trên YouTube" như hiện nay.
- Kho chỉ khớp lỏng (chỉ mức 3) hoặc không có gì → **tự hỏi YouTube** (bước 3), không cần người dùng
  bấm thêm. Kết quả YouTube trả về theo thứ tự YouTube (thường đã đúng ý, như ảnh người dùng gửi).
- "Chắc chắn" nghĩa là *(quyết định của người viết)*:
  - câu tìm ≥ 2 chữ: có ≥ 1 bài đạt mức 1 hoặc 2 (chữ cuối phải khớp **trọn**, khớp đầu chữ chỉ tính
    mức 3);
  - câu tìm 1 chữ (ví dụ "em", "yeu"): cần ≥ 3 bài đạt mức 1 hoặc 2 — một chữ quá rộng để tin một bài.
- Luật cũ "≥ 3 bài là dừng" (`LIBRARY_MIN_HITS`) **chỉ còn dùng khi InnerTube không dùng được** (tắt bằng
  `YOUTUBE_SEARCH_PROVIDER=api` hoặc đang tạm tắt vì lỗi): khi đó một lượt YouTube tốn 100 điểm, nên kho
  khớp lỏng ≥ 3 bài vẫn được trả như hiện nay — để **tổng quota không bao giờ tăng** so với hôm nay.
  *(Quyết định của người viết.)*
- Bộ nhớ đệm câu tìm (28 ngày, khoá theo câu không dấu) giữ nguyên và vẫn được hỏi **trước** kho.

### 3. Tìm trên YouTube: InnerTube trước, API chính thức sau

Thêm nguồn **InnerTube** — địa chỉ nội bộ mà chính trang youtube.com dùng để tìm (`/youtubei/v1/search`),
không cần API key, không tính quota. Dùng thư viện mã nguồn mở `youtubei.js` (LuanRT/YouTube.js, MIT)
thay vì tự gọi, để đỡ phải theo kịp thay đổi của YouTube.

Thứ tự cho một lượt tìm YouTube:
1. **InnerTube search** → danh sách id video (≤ 10, chỉ video, bỏ Shorts / kênh / playlist / live).
2. **Chi tiết qua API chính thức** `videos.list` (1 điểm, như code hiện có) → lọc nhúng được, bỏ live /
   sắp phát, lấy thời lượng chuẩn; lưu vào kho và bộ nhớ đệm như hiện nay.
   - Không gọi được `videos.list` (không có `YOUTUBE_API_KEY`, hoặc API đang tạm nghỉ vì hết quota —
     `quotaUntil`): dùng thông tin InnerTube trả về (tiêu đề, kênh, thời lượng, ảnh), bỏ live / Shorts theo
     dữ liệu InnerTube; **không** lọc được "nhúng được" — chấp nhận, máy phát đã có luồng báo lỗi / bỏ qua.
     Những kết quả **chưa kiểm** này chỉ trả cho lượt tìm đó, **không** lưu vào kho bài và bộ nhớ đệm câu
     tìm (để kho không chứa bài chưa xác minh "nhúng được"); thêm vào hàng chờ thì đi luồng thêm bài như
     bình thường. *(Quyết định của người viết.)*
3. InnerTube **lỗi / hết giờ / trả rỗng bất thường** → lùi về `search.list` chính thức như hiện nay (tốn
   100 điểm). Lỗi InnerTube lặp lại (ví dụ 3 lần liên tiếp) → tạm tắt InnerTube 30 phút rồi thử lại, ghi
   log cảnh báo. *(Quyết định của người viết.)*

- Bật / tắt bằng biến môi trường `YOUTUBE_SEARCH_PROVIDER` = `innertube` (mặc định) | `api` (chỉ API như
  cũ). Để tắt nhanh trên production nếu YouTube chặn mà không cần sửa code.
- Giới hạn mỗi người (`SEARCH_LIMIT`, 10 lượt / giờ) giữ nguyên cho lượt đi API chính thức `search.list`
  (luật có sẵn). Lượt đi InnerTube **không** giới hạn theo người (người dùng chốt).
- Hết giờ InnerTube: 5 giây (như API hiện có).
- `searchEnabled` trong snapshot = có API key **hoặc** InnerTube đang bật — để nút / gợi ý "tìm" hiện ra
  cả khi chưa có API key.

#### Rủi ro (người dùng đã được nói và đồng ý)
- Đường không chính thức: không đúng hẳn điều khoản sử dụng YouTube; có thể hỏng khi YouTube đổi; máy chủ
  Render (IP trung tâm dữ liệu) có thể bị YouTube chặn tạm. Vì vậy luôn có đường lùi về API và công tắc
  `YOUTUBE_SEARCH_PROVIDER`.

### 4. Client

- Không đổi giao diện lớn. Dòng nguồn kết quả giữ như cũ ("Bài đã có trên máy chủ…" + nút "Tìm trên
  YouTube" khi `source === 'library'`).
- Nếu builder đổi tên / thêm giá trị `source` (ví dụ phân biệt InnerTube) thì chỉ để ghi log; client
  không cần hiện khác (*quyết định của người viết*: không thêm `source` mới vào contracts nếu không cần).

## Server / contracts / dữ liệu

- `normalizeQuery` giữ nguyên (khoá không dấu, dùng chung với bộ nhớ đệm).
- Cần một khoá **có dấu** chữ thường để chấm mức 1 — tính lúc chấm từ `title` (không cần cột) hoặc thêm
  cột; builder chọn.
- Khớp chữ trọn vẹn trong Postgres: builder chọn cách (regex `\m…\M` qua `$queryRaw`, mảng chữ, hoặc
  `pg_trgm` + lọc lại trong code), miễn kho vài chục nghìn bài vẫn nhanh (< 100 ms); thêm chỉ mục nếu cần.
- Contracts: không bắt buộc đổi. Nếu đổi (ví dụ thêm giá trị `source`) thì bump `CONTRACTS_VERSION`
  (fetch `origin/develop` trước).

## Để builder quyết

- Cách cài `youtubei.js` vào server NestJS (gói ESM: `import()` động hoặc cấu hình build), phiên bản cụ thể.
- Cách khớp chữ trọn vẹn và chấm điểm trong SQL hay trong code; chỉ mục.
- Ngưỡng tạm tắt InnerTube.

## Kiểm thử

Theo quy ước dự án: không viết test tự động; lint, typecheck, build và probe trên dev (DB
`localhost:55432`):
- Kho có sẵn các bản "Làm Người Luôn Yêu Em" (như hiện tại): gõ "người lạ ơi" và "nguoi la oi" → bài
  "Người Lạ Ơi" lên đầu (từ kho nếu đã có, hoặc tự hỏi YouTube nếu chưa).
- Gõ "son tung" → ra bài Sơn Tùng từ kho, không tốn lượt.
- Gõ dở "nguoi la o" → vẫn ra "Người Lạ Ơi" (kho khớp lỏng → tự hỏi YouTube nếu InnerTube bật).
- Gõ một chữ "em" → kho chỉ trả khi có ≥ 3 bài khớp trọn chữ.
- `YOUTUBE_SEARCH_PROVIDER=api` + kho có ≥ 3 bài khớp lỏng → trả kho, không tốn lượt (như hôm nay).
- API hết quota + InnerTube bật → vẫn tìm được; các bài đó không xuất hiện trong kho ở lượt tìm sau.
- InnerTube giả lỗi (tắt mạng tới youtube.com hoặc ném lỗi) → lùi về API, vẫn có kết quả; lỗi lặp lại →
  tạm tắt InnerTube; `YOUTUBE_SEARCH_PROVIDER=api` → không gọi InnerTube.
- Đếm quota trong log: một lượt tìm mới qua InnerTube chỉ gọi `videos.list` (1 điểm), không gọi `search.list`.
- Không có `YOUTUBE_API_KEY` + InnerTube bật → vẫn tìm được.
- Trên production (sau khi được phép): một lượt tìm thật từ máy chủ Render để xem YouTube có chặn IP không.
