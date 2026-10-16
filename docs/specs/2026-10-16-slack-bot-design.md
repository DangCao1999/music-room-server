# Bot Slack `/music` (đợt 3)

Ngày: 2026-10-16 · Contracts: không đổi · Migration `chat_links` · Hướng dẫn cài: `deploy/README.md` §9

## Kiến trúc

- `ChatRoomService` (lõi, không phụ thuộc nền tảng): nối / bỏ nối kênh (PIN quản trị, khoá như web),
  xác định thành viên, thêm bài (`QueueService.add`), tìm bài (`SearchService`), bỏ phiếu
  (`PlaybackService.voteSkip`), reaction (`SocialService`), xem đang phát / hàng chờ (snapshot).
  Mọi luật của phòng giữ nguyên vì đi qua đúng các service của web; actor có `socketId` / `ip` = `chat:slack`.
- `ChatNotifierService`: nghe `RoomStateService.onCommitted`; khi cuộc bỏ phiếu (V1) mở → đăng thẻ vào
  mọi kênh đã nối, cập nhật số phiếu và đếm ngược (5 giây / lần, chỉ khi có thay đổi), khi đóng → đổi
  thành "Đã qua bài" / "Cả phòng muốn nghe tiếp". Mỗi phòng xử lý tuần tự (không đăng trùng).
  Trạng thái thẻ giữ trong bộ nhớ; khởi động lại giữa chừng thì thẻ cũ không được cập nhật nữa.
- Nền tảng khác (Discord, Teams, Google Chat, Mattermost) chỉ cần một bộ chuyển đổi gọi lõi này.

## Slack

- `POST /api/slack/commands` (`/music`) và `/api/slack/interactions` (nút). Kiểm tra chữ ký v0
  (HMAC-SHA256 của nguyên văn body, `rawBody: true`) và từ chối request cũ hơn 5 phút. Thiếu
  `SLACK_BOT_TOKEN` hoặc `SLACK_SIGNING_SECRET` → 404 (tính năng tắt). `SLACK_API_URL` chỉ để thử.
- Lệnh: `connect <MÃ> <PIN>`, `disconnect <PIN>`, (trống) / `now`, `add <tên | link>`, `skip`,
  `queue`, `help`. Tìm theo tên trả lời ngay "Đang tìm…" rồi gửi 3 kết quả qua `response_url`.
- Nút: `vote_yes` / `vote_no` (giá trị = queueItemId, bài đổi → `STALE_ITEM`), `react` (❤️ 🔥 👏),
  `add` (videoId), `open_room` (link). Nút trả lời ngay 200, kết quả báo riêng qua `response_url`.
- Câu báo lỗi tiếng Việt giống web (`chat-text.ts`).

## Gọi bằng tag tên và thread

- Slack không cho gõ slash command tự tạo trong thread → thêm `@Music Room <lệnh>` qua Events API
  (`POST /api/slack/events`, sự kiện `app_mention`, quyền `app_mentions:read`): cùng các lệnh như
  `/music` (`SlackCommands` dùng chung). Bot trả lời trong thread của tin nhắn (hoặc mở thread dưới
  tin nhắn ở kênh); câu trả lời riêng dùng `chat.postEphemeral` kèm `thread_ts`.
- Trả lời `url_verification`; bỏ qua lần gửi lại (`X-Slack-Retry-Num`), sự kiện trùng `event_id`
  (nhớ 500 id gần nhất) và tin nhắn của bot.
- Tin nhắn tag là tin nhắn công khai → không nhận `connect` / `disconnect` (PIN) qua tag; bot nhắc
  dùng `/music connect` và đổi PIN nếu lỡ gõ. Nối kênh chỉ bằng slash command (không ai khác thấy).
- `@Music Room here` trong một thread của kênh đã nối → `ChatLink.threadTs`: thẻ bỏ phiếu đăng vào
  thread đó; `/music here` ở kênh (hoặc `/music connect` lại) → về kênh. Không cần PIN: chỉ đổi chỗ
  đăng thẻ. Migration `chat_link_thread`.

## Thành viên

`Member.slackUserId`. Thứ tự: thành viên đã gắn Slack user → thành viên của tài khoản Google cùng email
(`users:read.email`) → thành viên mới mang tên hiển thị Slack (trùng thì thêm "(Slack)" hoặc số).
Đã bị mời ra khỏi phòng thì không tạo lại (`FORBIDDEN`).

## Phiếu từ Slack

Người bỏ phiếu qua Slack được `PresenceService.addChatVoter` tính là "có mặt" cho tới hết cuộc bỏ
phiếu (+5 giây): cộng vào tổng số người tham gia và phía họ chọn.

## Dữ liệu

`ChatLink { platform, teamId, channelId, roomId }` (duy nhất theo nền tảng + workspace + kênh, xoá theo
phòng), `Member.slackUserId`.

## Kiểm tra

Không test tự động. Lint + typecheck + build; probe với request có chữ ký và một Slack giả trên máy
(DB Docker): chưa nối, sai PIN, nối, `/music`, thêm bằng link, tìm + nút Thêm, hàng chờ, sai chữ ký và
request cũ (401), `/music skip` mở bỏ phiếu và đăng thẻ, đếm ngược cập nhật, ❌ từ Slack (tổng số người
tăng), web ✅✅ → thẻ "Đã qua bài", reaction, bỏ nối. Thiếu biến môi trường → 404.
