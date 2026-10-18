import { chatError } from '../chat/chat-text';
import { AppError } from '../common/app-error';
import type { DjReply, GuideTarget } from '../contracts';

/**
 * The DJ's answer as plain Vietnamese: the chat history's `content`, the speaker screen and
 * Slack. Room clients word `DjReply` themselves, in the viewer's language.
 */

const GUIDE: Record<GuideTarget, string> = {
  skip: 'Việc này bạn tự bấm được: nút Bỏ qua mở bỏ phiếu cho cả phòng (người có quyền điều khiển thì có nút Chuyển bài qua ngay).',
  save: 'Bấm nút Lưu cạnh bài đang phát để giữ bài vào danh sách của bạn.',
  heart: 'Thả tim cho bài trong hàng chờ để bài đó được phát sớm hơn.',
  pause:
    'Nút Tạm dừng / Phát tiếp nằm cạnh bài đang phát (chỉ người có quyền điều khiển).',
  lyrics: 'Bấm "Lời bài hát" dưới tên bài đang phát để xem lời.',
  listen: 'Bấm "Nghe cùng" để nghe ngay trên máy bạn, khớp với cả phòng.',
  share: 'Bấm nút Chia sẻ ở đầu trang để lấy link hoặc mã QR mời mọi người.',
  mini: 'Bấm nút Thu nhỏ để giữ bài đang phát trong một khung nhỏ.',
  add: 'Gõ tên bài vào ô Thêm bài là thêm được ngay.',
  myItem: 'Bài của bạn nằm trong hàng chờ.',
  block: 'Quản trị viên chặn bài bằng nút Tùy chọn cạnh bài.',
};

function minutes(sec: number): number {
  return Math.max(1, Math.round(sec / 60));
}

function when(etaSec: number | null | undefined): string {
  if (etaSec === null || etaSec === undefined) return '';
  return etaSec < 45
    ? ', sắp phát ngay'
    : `, khoảng ${minutes(etaSec)} phút nữa`;
}

function infoText(r: DjReply): string {
  const i = r.info;
  if (!i) return 'Mình chưa xem được thông tin phòng.';
  switch (i.kind) {
    case 'nowPlaying':
      return i.title ? `Đang phát: ${i.title}.` : 'Phòng chưa phát bài nào.';
    case 'whoPicked':
      return i.title
        ? i.pickedBy
          ? `${i.pickedBy} chọn bài đang phát.`
          : 'Bài đang phát do phòng tự chọn.'
        : 'Phòng chưa phát bài nào.';
    case 'myNext':
      if (!i.queueItemId) return `${r.forName} chưa có bài nào đang chờ.`;
      return i.ahead === 0
        ? `Bài của ${r.forName} là bài kế tiếp${when(i.etaSec)}.`
        : `Còn ${i.ahead} bài nữa là tới bài của ${r.forName}${when(i.etaSec)}.`;
    case 'queueLength':
      return i.count
        ? `Hàng chờ còn ${i.count} bài${i.totalSec ? `, khoảng ${minutes(i.totalSec)} phút` : ''}.`
        : 'Hàng chờ đang trống.';
    case 'myCount':
      return `${r.forName} đang có ${i.count ?? 0} bài trong hàng chờ.`;
  }
}

export function djText(r: DjReply): string {
  switch (r.kind) {
    case 'hello':
      return 'Chào bạn, mình là DJ của phòng. Thử: "bật vài bài chill cho buổi chiều", "bài mới của Sơn Tùng", "còn bao lâu tới bài của tôi". Câu bạn gửi DJ được chuyển cho AI miễn phí.';
    case 'guide': {
      if (r.guide === 'add' && r.query)
        return `Bạn gõ "${r.query}" vào ô Thêm bài là thêm được ngay.`;
      return GUIDE[r.guide ?? 'add'];
    }
    case 'info':
      return infoText(r);
    case 'added': {
      const what =
        r.fresh === 'latest'
          ? 'bài mới nhất mình tìm được'
          : r.fresh === 'popular'
            ? 'bài đang hot mình tìm được'
            : 'bài';
      const song = r.track?.title ? `${what} "${r.track.title}"` : what;
      if (r.position === 0)
        return `Đã bật ${song} cho ${r.forName}, đang phát ngay.`;
      const at = r.position ? `, đứng thứ ${r.position}${when(r.etaSec)}` : '';
      return `Đã thêm ${song} cho ${r.forName}${at}.`;
    }
    case 'denied':
      return r.errorCode && r.errorCode !== 'FORBIDDEN'
        ? chatError(new AppError(r.errorCode, r.errorParams))
        : 'Bạn chưa có quyền làm việc này.';
    case 'busy':
      return r.retryAfterSec
        ? `Bạn đã hỏi DJ nhiều quá, thử lại sau khoảng ${minutes(r.retryAfterSec)} phút nhé.`
        : 'Mình đang hơi quá tải, bạn thử lại sau ít phút nhé.';
    case 'error':
      if (r.errorCode === 'TRACK_NOT_FOUND')
        return 'Mình chưa tìm được bài hợp yêu cầu, bạn thử gõ tên bài vào ô Thêm bài nhé.';
      return r.errorCode && r.errorCode !== 'INTERNAL'
        ? chatError(new AppError(r.errorCode, r.errorParams))
        : 'Mình chưa làm được việc này, bạn thử lại sau nhé.';
    case 'other':
      return 'Mình chưa giúp được việc này. Thử: "bật vài bài chill", "bài mới của Đen Vâu", "còn bao lâu tới bài của tôi".';
  }
}
