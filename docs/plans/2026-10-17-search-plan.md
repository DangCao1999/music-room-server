# Tìm bài chính xác hơn, ít lượt YouTube hơn — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kho bài khớp theo chữ trọn vẹn và xếp theo mức khớp; chỉ dừng ở kho khi chắc chắn; tìm YouTube qua InnerTube (0 điểm) + `videos.list` (1 điểm), lùi về `search.list` khi InnerTube lỗi.

**Architecture:** Hàm thuần `scoreTrack` / `isConfident` (file riêng) chấm điểm ứng viên lấy từ DB bằng lọc `contains` như cũ (rộng) rồi lọc + xếp trong code. `InnerTubeProvider` (mới) bọc `youtubei.js` (nạp động, gói ESM) với cầu dao tạm tắt. `SearchService.search` điều phối: bộ nhớ đệm → kho (xếp hạng) → InnerTube (+ `videos.list`) → `search.list`.

**Tech Stack:** NestJS 11, Prisma/Postgres, `youtubei.js` (InnerTube), YouTube Data API v3.

**Spec:** `docs/specs/2026-10-17-search-design.md`

## Global Constraints

- Mức khớp: 1 = tiêu đề chứa nguyên cụm **có dấu** (chữ thường, NFC); 2 = nguyên cụm **không dấu** liền nhau theo chữ trọn vẹn trong tiêu đề, hoặc (xếp sau) trong tên kênh; 3 = đủ chữ trọn vẹn rời rạc, hoặc chỉ khớp nhờ chữ cuối gõ dở (khớp đầu chữ). Câu không dấu → không có mức 1.
- Cùng mức: tiêu đề ngắn hơn trước, rồi `fetchedAt` mới hơn. (Bỏ "phát nhiều hơn" — không có số liệu sẵn rẻ; xem Ruling trong ledger.)
- "Chắc chắn": câu ≥ 2 chữ → ≥ 1 bài mức 1/2; câu 1 chữ → ≥ 3 bài mức 1/2.
- Khi InnerTube **không dùng được** (`YOUTUBE_SEARCH_PROVIDER=api` hoặc cầu dao đang mở): kho trả nếu chắc chắn **hoặc** có ≥ 3 bài (bất kỳ mức) — luật cũ `LIBRARY_MIN_HITS = 3`, để tổng quota không tăng.
- InnerTube: ≤ 10 video, bỏ Shorts / live / kênh / playlist; hết giờ 5 s; 3 lỗi liên tiếp → tắt 30 phút (`INNERTUBE_COOLDOWN_MS = 30 * 60_000`), ghi `warn`.
- `YOUTUBE_SEARCH_PROVIDER`: `innertube` (mặc định) | `api`.
- Có `videos.list` dùng được (`apiUsable`) → kiểm chi tiết (1 điểm), lưu kho + bộ nhớ đệm như cũ. Không có → trả thông tin InnerTube, **không** lưu kho / bộ nhớ đệm.
- Giới hạn `SEARCH_LIMIT` (10/giờ/người) chỉ áp cho lượt `search.list`; InnerTube **không** giới hạn theo người.
- `snapshot.searchEnabled` = có API key **hoặc** InnerTube bật.
- `fromLibrary` (dùng bởi dán danh sách bài) giữ nguyên hành vi.
- Contracts không đổi. Không test tự động; lint + typecheck + build (`tsc -p tsconfig.build.json --outDir <scratchpad>`) + probe trên dev (DB `localhost:55432`). Không commit khi chưa được phép.

## Review Focus

1. Câu có ký tự đặc biệt / dấu câu ("người lạ ơi!", "Sơn Tùng M-TP") → tách chữ theo cùng một cách cho câu tìm và tiêu đề; không ném lỗi regex — Task 1 kiểm.
2. InnerTube trả kết quả lạ (rỗng bất thường, chỉ Shorts, cấu trúc đổi) → coi là lỗi, lùi về API, không trả rỗng — Task 2 kiểm.
3. Hai người tìm cùng câu cùng lúc khi chưa có bộ nhớ đệm → một lượt gọi (giữ `inFlight`) — Task 3 kiểm.
4. API hết quota giữa chừng (`QUOTA_EXCEEDED` từ `videos.list`) sau khi InnerTube đã trả id → vẫn trả kết quả InnerTube chưa kiểm, không ném lỗi — Task 3 kiểm.
5. Slack `/music add <tên bài>` và dán danh sách bài vẫn chạy như trước (cùng `SearchService.search`) — Task 3 kiểm.

---

### Task 1: Chấm điểm khớp trong kho

**Files:**
- Create: `src/music/library-match.ts`
- Modify: `src/music/search.service.ts` — thêm `rankLibrary`.

**Interfaces:**
- Produces:
  - `export function matchWords(s: string): string[]` — chữ thường, NFC, tách theo mọi ký tự không phải chữ / số Unicode (`/[^\p{L}\p{N}]+/u`), bỏ rỗng.
  - `export function scoreTrack(title: string, channel: string | null, q: string): number` — 0 = không khớp; khớp: số càng **lớn** càng tốt; mã hoá mức + phụ: `level 1 → 300`, `level 2 title → 200`, `level 2 channel → 150`, `level 3 → 100`. (Phân hạng phụ "tiêu đề ngắn" và `fetchedAt` làm ở bước sắp xếp, không trong điểm.)
  - `export function isConfident(scores: number[], wordCount: number): boolean` — theo Global Constraints (mức 1/2 = điểm ≥ 150).
  - `SearchService.rankLibrary(q: string): Promise<{ results: TrackSummary[]; strong: boolean; total: number }>` — ứng viên: `embeddable`, `fetchedAt` ≤ 28 ngày, `AND searchKey contains` từng chữ **không dấu** (như `fromLibrary`), `take: 300`, `orderBy fetchedAt desc`; chấm `scoreTrack`, bỏ điểm 0, sắp (điểm desc, độ dài tiêu đề asc, fetchedAt desc), lấy 10. `strong = isConfident(...)`, `total` = số bài điểm > 0.
- Thuật toán khớp (không dấu, chữ trọn vẹn): `qw = matchWords(stripAccents(q))`, `tw = matchWords(stripAccents(title))`. Cụm liền nhau = có `i` sao cho `tw[i..i+n) == qw`. Chữ cuối gõ dở: khớp nếu `tw[j].startsWith(qw.last)` (chỉ tính mức 3). Có dấu: `matchWords(q)` là dãy con liền nhau của `matchWords(title)`. `stripAccents` = phần bỏ dấu của `normalizeQuery` (dùng lại, không viết lại).

- [ ] **Step 1:** Viết `library-match.ts`.
- [ ] **Step 2:** Kiểm tay bằng script `scratchpad/match-check.mjs` (nạp file `.ts` bằng Node 24), các ca (Expected):
  - `scoreTrack('Người Lạ Ơi ! Official MV | Châu Đăng Khoa x Karik x Orange','Superbrothers','người lạ ơi') === 300`
  - `scoreTrack('Làm Người Luôn Yêu Em - Sơn Tùng M-TP',null,'người lạ ơi') === 0`
  - `scoreTrack('LẠI LÀ DG HOUSE - CoolKid rủ ngay người anh RHYDER','Vie Channel','nguoi la oi') === 0`
  - `scoreTrack('NGƯỜI LẠ ƠI - HÀ AN HUY','Vietnam Idol','nguoi la oi') === 200`
  - `scoreTrack('Lạc Trôi','Sơn Tùng M-TP Official','son tung') === 150`
  - `scoreTrack('Người Lạ Ơi','Superbrothers','nguoi la o') === 100`
  - `scoreTrack('Sơn Tùng M-TP | Làm Người Luôn Yêu Em',null,'Sơn Tùng M-TP!') >= 200` (Review Focus 1)
  - `isConfident([200], 3) === true`, `isConfident([100,100,100], 3) === false`, `isConfident([200,200], 1) === false`, `isConfident([200,200,150], 1) === true`
- [ ] **Step 3:** `npm run lint && npm run typecheck` → sạch.

### Task 2: InnerTube provider

**Files:**
- Run: `npm i youtubei.js` (phiên bản mới nhất ổn định).
- Create: `src/music/innertube.provider.ts`
- Modify: `src/config/env.ts` (`YOUTUBE_SEARCH_PROVIDER: z.enum(['innertube','api']).default('innertube')`), `src/music/music.module.ts` (hoặc nơi khai báo provider) đăng ký `InnerTubeProvider`; `.env.example` nếu có.

**Interfaces:**
- Produces:
  - `export interface FoundVideo { externalId: string; title: string; channel: string | null; durationSec: number | null; thumbnailUrl: string | null }`
  - `InnerTubeProvider.available: boolean` — `env.YOUTUBE_SEARCH_PROVIDER === 'innertube' && Date.now() >= offUntil`.
  - `InnerTubeProvider.search(q: string): Promise<FoundVideo[]>` — ném lỗi khi thất bại (để bên gọi lùi về API); thành công → `failures = 0`. Rỗng **khi YouTube có** là bất thường: coi kết quả rỗng là thành công (câu tìm vô nghĩa có thể thật sự rỗng) nhưng nếu phản hồi không đọc được cấu trúc (không có mảng kết quả) → ném lỗi. *(Builder: lọc Shorts = bỏ mục không phải `Video` hoặc thời lượng < 60 s; bỏ `is_live` / upcoming.)*
- Khởi tạo `Innertube.create({ lang: 'vi', location: 'VN', retrieve_player: false })` một lần, lười (lần tìm đầu), qua `await import('youtubei.js')` (gói ESM); lỗi khởi tạo tính như một lần thất bại. Hết giờ 5 s (`HTTP_TIMEOUT_MS`) bằng `Promise.race`. 3 lần thất bại liên tiếp → `offUntil = now + INNERTUBE_COOLDOWN_MS`, `logger.warn`.

- [ ] **Step 1:** Cài gói, viết provider + env.
- [ ] **Step 2:** Script tay `scratchpad/innertube-check.cjs` (chạy `dist` build ra scratchpad, hoặc gọi trực tiếp `youtubei.js`): tìm "người lạ ơi" → Expected: ≥ 5 video, video đầu tiêu đề chứa "Người Lạ Ơi", có `durationSec`, không có Shorts.
- [ ] **Step 3:** `npm run lint && npm run typecheck` + `npx tsc -p tsconfig.build.json --outDir <scratchpad>/build-check` → sạch; trong build, lệnh `import('youtubei.js')` còn nguyên là `import()` (không bị đổi thành `require`) — kiểm `grep "import(\"youtubei.js\")\|import('youtubei.js')"` trong file đã build.

### Task 3: Điều phối tìm kiếm

**Files:**
- Modify: `src/music/search.service.ts` (`search`, `fromYouTube`), `src/music/youtube.provider.ts` (tách `searchIds(q): Promise<string[]>` từ `search` hiện có nếu tiện; `videos(ids)` dùng lại), `src/state/snapshot.service.ts:152` (`searchEnabled`).

**Interfaces:**
- Consumes: Task 1 `rankLibrary`; Task 2 `InnerTubeProvider.available`, `.search`.
- Luồng `search(memberId, q, remote)`:
  1. `fromCache(key)` → `'cache'` (giữ nguyên).
  2. `!remote`: `lib = rankLibrary(q)`. Trả `'library'` khi `lib.strong`; hoặc khi **InnerTube không dùng được** và (`lib.total >= LIBRARY_MIN_HITS` hoặc (`lib.total > 0` và không có API key)).
  3. Chưa có nguồn nào (`!innertube.available && !youtube.searchEnabled`) → `SEARCH_UNAVAILABLE` (giữ hành vi cũ khi tắt hết).
  4. `inFlight` theo `key` bọc phần còn lại (`fromYouTube(key, q, memberId)`), `source: 'youtube'`.
- `fromYouTube`:
  - `innertube.available` → thử `found = innertube.search(q)`; lỗi → bỏ qua sang bước API.
    - Có `found` và `youtube.apiUsable` → `infos = youtube.videos(ids)` (giữ thứ tự `found`, bỏ không nhúng được / live) → upsert kho + ghi bộ nhớ đệm (như cũ) → trả. `videos` ném `QUOTA_EXCEEDED` → nhánh dưới.
    - Có `found` mà không kiểm được → trả `found` dưới dạng `TrackSummary` (id `trackId(externalId)`), **không** upsert, **không** ghi bộ nhớ đệm.
  - API (`youtube.search(q)` cũ, 100 điểm): áp `SEARCH_LIMIT` (giới hạn theo người) **chỉ ở đây**; lưu như cũ.
  - Không nguồn nào thành công → ném lỗi của API (giữ mã lỗi hiện có: `QUOTA_EXCEEDED`, `SEARCH_UNAVAILABLE`, `RATE_LIMITED`).
- `TrackSummary` cho kết quả chưa kiểm: dựng giống `toTrackSummary` (cùng các trường; trường không có → `null` / mặc định). Thêm vào hàng chờ đi luồng `queue:add` bình thường (resolve video lại).
- `snapshot.searchEnabled = Boolean(env.YOUTUBE_API_KEY) || env.YOUTUBE_SEARCH_PROVIDER === 'innertube'`.
- Log mỗi lượt YouTube: `search "<q>" via innertube(+videos)|innertube(unverified)|api` để đếm quota.

- [ ] **Step 1:** Viết.
- [ ] **Step 2:** `npm run lint && npm run typecheck` + build ra scratchpad → sạch.
- [ ] **Step 3:** Probe trên dev (`scratchpad/probe-search.cjs`; xác nhận DB `localhost:55432`; dev **không** có `YOUTUBE_API_KEY`). Chèn vào DB dev (bảng `Track`, `fetchedAt = now`, `embeddable = true`, `searchKey` bằng `trackSearchKey`) 4 bài "Làm Người Luôn Yêu Em…", 1 bài "LẠI LÀ DG HOUSE…", 2 bài "… Sơn Tùng M-TP Official" (kênh), id dạng `youtube:probeXXXXXX` (11 ký tự) để dọn sau. Expected:
  - "người lạ ơi" → `source: 'youtube'`, kết quả đầu chứa "Người Lạ Ơi"; log `innertube(unverified)`; gọi lại lần 2 → vẫn `'youtube'` (chưa kiểm thì không cache).
  - "son tung" → `source: 'library'`, các bài kênh Sơn Tùng lên đầu.
  - "nguoi la o" → `'youtube'`, đầu là "Người Lạ Ơi".
  - "em" → kho có 4 bài "…Yêu Em" (≥ 3 mức 2) → `'library'`.
  - Review Focus 3: gửi 2 lượt "uptown funk" đồng thời → log chỉ 1 lượt InnerTube.
  - Review Focus 5: Slack giả không có sẵn → gọi `songlist` / `chat` không cần; thay bằng kiểm tay: `queue:add` với `input: 'nguoi la oi'` qua socket (đường Slack dùng cùng `search`) → thêm được bài.
  - Khởi động lại server với `YOUTUBE_SEARCH_PROVIDER=api` → "nguoi la oi" (kho 5 bài khớp lỏng? không: 0 bài) → `SEARCH_UNAVAILABLE`; "yeu em" → `'library'` (≥ 3 bài); snapshot `searchEnabled: false`.
  - Review Focus 2 / 4: tạm sửa local (không giữ) để `innertube.search` ném lỗi 3 lần → log `warn` tắt 30 phút, lượt sau đi nhánh API (dev: `SEARCH_UNAVAILABLE`). Nhánh `videos` ném `QUOTA_EXCEEDED`: kiểm bằng đọc code + một lần ép lỗi tạm thời → trả kết quả chưa kiểm.
  - Dọn: xoá các `Track` `youtube:probe%` và `SearchCache` của các câu đã probe trên DB dev.

### Task 4: Rà soát toàn nhánh

- [ ] **Step 1:** Server lint + typecheck + build; client không đổi (kiểm `git status` client sạch phần search).
- [ ] **Step 2:** Trên trình duyệt dev: ô Tìm kiếm gõ "người lạ ơi" → đúng bài ở đầu, thêm vào hàng chờ được.
- [ ] **Step 3:** Reviewer mới đọc toàn nhánh theo spec + plan + Review Focus; sửa Critical / Important. Không commit khi chưa được phép.
