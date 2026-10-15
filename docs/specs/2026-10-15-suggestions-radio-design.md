# Chuẩn hoá tên bài (AI1), Gợi ý tiếp theo (A3), Radio tự động (A4)

Ngày: 2026-10-15 · Contracts: `2026-10-15.5` · Giai đoạn 1 (không cần đăng nhập)

YouTube đã bỏ "video liên quan" khỏi API (`relatedToVideoId`, 08/2023) và không cho đọc
danh sách Mix, nên gợi ý phải tự xây từ dữ liệu của mình, Last.fm và AI miễn phí.
Mọi nguồn ngoài đều tuỳ chọn: thiếu key thì phần đó tắt, app vẫn chạy.

## Biến môi trường (tuỳ chọn)

`LASTFM_API_KEY`; `GEMINI_API_KEY` (+ `GEMINI_MODEL`, mặc định `gemini-flash-lite-latest`);
`GROQ_API_KEY` (+ `GROQ_MODEL`, mặc định `llama-3.1-8b-instant`);
`OPENROUTER_API_KEY` + `OPENROUTER_MODEL` (chỉ dùng khi đặt cả hai).

## AI1: nghệ sĩ và tên bài

- `Track` thêm `artist`, `song`, `artistKey`, `songKey` (`normalizeQuery`), `metaSource`
  (`rules` | `guess` | `lastfm` | `ai`), `metaAt`.
- Worker nền mỗi 20 giây xử lý tối đa 20 bài có `metaAt = null`:
  1. **Quy tắc** (`title-parser.ts`): bỏ phần thừa (Official MV, Lyrics, 4K, Vietsub, #tag…),
     tách theo `-`, `–`, `|`; kênh "X - Topic" → nghệ sĩ X; vế nào giống tên kênh là nghệ sĩ.
  2. **Last.fm** `track.getInfo` (autocorrect) để xác nhận và lấy tên chuẩn; thử cả hai
     thứ tự khi không biết vế nào là nghệ sĩ.
  3. **AI** (gộp 20 tiêu đề / lần) cho bài quy tắc không chắc và Last.fm không xác nhận.
  4. Không có gì xác nhận → giữ dự đoán của quy tắc (`guess`).
- Job lưu trữ 30 ngày xoá luôn các cột này khi xoá thông tin bài.

## Lớp AI miễn phí

`AiService.json(task, prompt)`: thử lần lượt Gemini → Groq → OpenRouter (cái nào có key).
429 / lỗi / quá 15 giây → nghỉ nhà cung cấp đó 10 phút, chuyển cái sau. Hết cả → `null`
(người gọi dùng cách không cần AI). Chỉ gửi tiêu đề và tên kênh.

## A3: Gợi ý tiếp theo

`suggest:next { trackId? }` (mặc định bài đang phát) → `{ items: SuggestionView[] }`:
- `{ kind: 'track', track, reason }` — bài server đã biết, thêm ngay, 0 quota;
- `{ kind: 'search', artist, song }` — bài Last.fm gợi ý nhưng server chưa có video:
  "Tìm & thêm" dùng tìm kiếm hiện có (thư viện → cache → YouTube, theo giới hạn sẵn có).

Nguồn, theo thứ tự ưu tiên: `similar` (Last.fm bài tương tự / nghệ sĩ tương tự, khớp với
bài đã biết qua `artistKey` + `songKey`), `room` (phòng hay phát tiếp sau bài này),
`artist` (cùng nghệ sĩ), `popular` (phòng thích nhất). Bỏ bài đang chờ / đang phát, bài
quá dài so với cài đặt, bài không nhúng được. Tối đa 8 bài + 3 gợi ý "Tìm & thêm".
Kết quả Last.fm cache trong bộ nhớ 6 giờ.

## A4: Radio tự động

- Cài đặt phòng `autoRadio` (mặc định tắt).
- Hàng chờ trống: Radio (nếu bật) → playlist dự phòng (nếu có) → dừng.
- Radio chỉ chọn **bài server đã biết** (0 quota), từ gợi ý cho bài vừa phát (Last.fm được
  tính sẵn ngoài transaction khi bài bắt đầu), không lặp bài đã phát trong phòng 3 giờ qua.
- `QueueItem.auto` = `'radio'` | `'fallback'`; giao diện ghi "Radio tự động" hoặc
  "Playlist dự phòng".

## Kiểm tra

Không test tự động. Lint + typecheck + build; probe thuần cho bộ tách tiêu đề; Chrome
headless trên dev cho gợi ý từ dữ liệu phòng và Radio. Last.fm và AI chỉ kiểm được khi
có key.
