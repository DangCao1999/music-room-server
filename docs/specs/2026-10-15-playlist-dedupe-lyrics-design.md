# Nhập playlist (A5), chặn bài trùng (A6), lời bài hát (A7)

Ngày: 2026-10-15 · Contracts: `2026-10-15.6` · Giai đoạn 1 (không cần đăng nhập)

## A5. Nhập playlist YouTube

- `playlist:open { url }` → `{ playlistId, tracks: TrackSummary[] }`: dùng `PlaylistService.refresh`
  (cache 24 giờ, tối đa 200 video, `playlistItems` + `videos` = 1 đơn vị / 50 bài), chỉ bài
  nhúng được và không phải livestream. Chưa cache và máy chủ không có `YOUTUBE_API_KEY`
  → `PLAYLIST_UNAVAILABLE`. Playlist trống / riêng tư → `PLAYLIST_EMPTY`.
- `queue:add-many { trackIds ≤ 20 }` → `{ added, skipped: [{ trackId, reason }] }`: một
  transaction, theo thứ tự chọn, dừng khi hết suất (`maxQueuedPerMember`); bài quá dài, bài
  trùng (A6) bị bỏ qua kèm lý do. Luật công bằng vẫn xếp xen kẽ với người khác.
- Giao diện (Tìm kiếm): link chỉ có playlist → nút **Mở playlist**; link có cả video và
  playlist → thêm video như cũ, kèm nút phụ **Mở cả playlist**. Danh sách có ô chọn, giới hạn
  bằng số suất còn lại, nút **Thêm N bài**.

## A6. Chặn bài trùng

- Cài đặt `repeatGapMinutes` (0–1440, mặc định 60; 0 = tắt).
- `queue:add` / `queue:add-many` của thành viên:
  - bài đang chờ hoặc đang phát → `ALREADY_QUEUED` (luôn chặn);
  - bài bắt đầu phát trong `repeatGapMinutes` phút qua → `PLAYED_RECENTLY { minutes, gap }`.
    Quản trị viên được bỏ qua luật này (vẫn không được thêm bài đang chờ).
- Giao diện: dòng bài đang có trong hàng chờ / đang phát hiện "Đã có trong hàng chờ" và
  không bấm thêm được.

## A7. Lời bài hát

- Nguồn: LRCLIB (`/api/search`, miễn phí, không key), theo `artist` + `song` (AI1), thiếu thì
  theo tiêu đề đã làm gọn. Chọn bản có lời theo thời gian, thời lượng gần nhất (±5 giây).
- `lyrics:get { trackId }` → `{ lyrics: { synced: {t, text}[] | null, plain: string | null } | null }`.
  Chỉ cache trong bộ nhớ (6 giờ; "không có" 1 giờ), **không lưu vào database**.
- Trang máy phát: khung lời karaoke (dòng trước, dòng đang hát, 2 dòng sau) dưới tên bài;
  nút bật/tắt nhớ trong trình duyệt. Không có lời theo thời gian thì không hiện trên máy phát.
- Thành viên: nút **Lời bài hát** trên thẻ Đang phát → hộp thoại, dòng đang hát được tô và tự cuộn.
- Ghi chú nguồn "Lời: LRCLIB". Lời bài hát có bản quyền của tác giả; LRCLIB là dữ liệu cộng đồng.

## Kiểm tra

Không test tự động. Lint + typecheck + build; Chrome headless trên dev. Dev không có
`YOUTUBE_API_KEY`, nên A5 được thử với một playlist đặt sẵn vào `PlaylistCache`.
