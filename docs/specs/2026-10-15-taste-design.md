# Gợi ý theo gu riêng (L5)

Ngày: 2026-10-15 · Contracts: `2026-10-15.11` · Giai đoạn 2, dự án con 5 · Cần đăng nhập (L1)

Không đổi database, không dùng AI (giữ quota miễn phí cho DJ / MC / Radio).

## Gu của một tài khoản (tính lại tối đa mỗi 10 phút, giữ trong bộ nhớ)

Điểm bài, từ mọi phòng của mọi thành viên gắn với tài khoản: Yêu thích +4, thả tim +3, bài mình
thêm và đã phát +2, bài trong playlist của mình +2, bỏ phiếu bỏ qua −3. Điểm nghệ sĩ = tổng điểm
các bài của nghệ sĩ đó (theo `artistKey` của AI1); bài bị bỏ qua trừ nghệ sĩ 1 điểm.

## `taste:for-me {}` → `{ items: SuggestionView[], topArtists: string[] }`

Ứng viên (đều là bài server đã biết → thêm vào hàng chờ không tốn quota):
1. `peers` — "Người cùng gu cũng thích": tài khoản / thành viên có Yêu thích hoặc tim trùng bài với
   mình → các bài họ thích, xếp theo độ trùng;
2. `taste` — "Vì bạn hay nghe X": bài khác của 8 nghệ sĩ mình thích nhất;
3. `taste-similar` — "Giống gu X": bài của nghệ sĩ tương tự (Last.fm `artist.getSimilar`) với
   3 nghệ sĩ hàng đầu.
Bỏ: bài đã trong Yêu thích hoặc playlist của mình, bài mình bỏ phiếu bỏ qua, bài đã phát trong các phòng của mình 3 ngày
qua, bài đang chờ / đang phát trong phòng hiện tại, bài quá dài với luật phòng, bài không nhúng được.
Trộn xen kẽ 3 nguồn (mỗi nguồn ≤ 4), tối đa 12. `SuggestionView` (loại `track`) thêm `because?`.

## `taste:save-mix {}` → `{ playlistId, count }`

Lưu gợi ý hiện tại thành playlist "Dành cho bạn" (`source = 'mix:foryou'`); bấm lại thì cập nhật
đúng playlist đó.

## Giao diện

- "Gợi ý tiếp theo" (tab Phòng): công tắc **Cho phòng / Cho bạn** khi đã đăng nhập.
- "Của tôi": mục **Gu của bạn** (nghệ sĩ hay nghe) và nút **Lưu thành playlist "Dành cho bạn"**.
- Khách: như cũ.

## Kiểm tra

Không test tự động. Lint + typecheck + build; dựng lịch sử nghe giả cho tài khoản thử trên
**DB Docker** (xác nhận đích trước) rồi kiểm tra gu và các loại gợi ý.
