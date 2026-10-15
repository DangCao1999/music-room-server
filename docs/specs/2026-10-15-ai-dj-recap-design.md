# DJ theo yêu cầu (AI2), MC giới thiệu bài (AI3), lọc nội dung (AI4), radio thông minh (AI5), tổng kết phòng (A8)

Ngày: 2026-10-15 · Contracts: `2026-10-15.7` · Giai đoạn 1 (không cần đăng nhập)

AI dùng `AiService` (Gemini → Groq → OpenRouter, gói miễn phí). Thiếu AI thì mỗi tính năng
có đường không cần AI hoặc tự tắt; app không hỏng vì hết quota. Snapshot thêm `aiEnabled`.
Model Groq mặc định đổi sang `qwen/qwen3.8-27b` (Llama 3.1 8B đã bị Groq gỡ).

## AI2. DJ theo yêu cầu

- `dj:ask { prompt ≤ 200 }` → `{ items: SuggestionView[] }`, giới hạn 3 lần / giờ / thành viên.
- AI đề xuất 10 bài có thật (nghệ sĩ + tên bài); prompt kèm tối đa 40 bài phòng đã nghe để AI
  ưu tiên bài sẵn có. Bài khớp bài đã biết (`artistKey` + `songKey`, hoặc `searchKey` chứa tên
  bài và nghệ sĩ) → `track` (thêm ngay, 0 quota); còn lại → `search` ("Tìm & thêm").
- `SuggestionReason` thêm `'dj'`. Không có AI → `AI_UNAVAILABLE`.
- Giao diện: tab **Hỏi DJ** trong Thêm bài, có vài gợi ý câu hỏi mẫu.

## AI3. MC giới thiệu bài

- Cài đặt `mcIntro` (mặc định tắt). Khi bật, máy phát đọc một câu dẫn ngắn trước bài do
  thành viên chọn (bài có lời chúc thì đọc lời chúc như cũ, không đọc MC).
- Câu dẫn viết sẵn trước: hàng chờ đổi → chờ 10 giây → một lần gọi AI viết cho tối đa 6 bài
  đang chờ chưa có câu dẫn; giữ trong bộ nhớ theo `queueItemId`. Không bịa thông tin về bài.
- `PlayerCommand.intro: string | null`; máy phát đọc bằng giọng "MC đài", hạ nhạc như lời chúc.

## AI4. Lọc nội dung

- Lời chúc (sẽ được đọc to): danh sách từ cấm (tiếng Việt có/không dấu, tiếng Anh) rồi AI
  phân loại (5 giây, lỗi thì cho qua) → `MESSAGE_BLOCKED`.
- Chat: chỉ danh sách từ cấm, từ bị che thành `***` (không gọi AI cho từng tin nhắn).

## AI5. Radio thông minh

- Khi một bài bắt đầu và phòng bật Radio: tính trước (ngoài transaction) tối đa 15 ứng viên,
  AI xếp lại 5 bài hợp nhất theo giờ trong ngày và phản ứng của phòng (bài bị bỏ qua, tim).
  Radio dùng thứ tự này nếu còn mới (15 phút), không thì dùng cách cũ.

## A8. Tổng kết phòng

- `room:recap { since, tzOffsetMinutes }` (tối đa 31 ngày) → số bài đã phát, số phút nghe,
  số bài bị bỏ qua, top 5 bài (lượt phát, tim), top 5 người chọn bài (số bài được phát, tim
  nhận), số bài theo giờ địa phương, và một câu nhận xét vui do AI viết (nếu có AI, cache 10 phút).
- Giao diện: thẻ **Tổng kết** ở tab Mọi người, chọn **Hôm nay** / **7 ngày**.

## Kiểm tra

Không test tự động. Lint + typecheck + build; Chrome headless trên dev với key AI thật.
