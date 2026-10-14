# Music Room — server

Phòng nhạc chung cho văn phòng: mọi người dùng điện thoại thêm bài YouTube, một máy phát nhạc ra loa. Đây là server **NestJS 11 + Socket.IO + PostgreSQL (Prisma 7)**. Giao diện nằm ở repo [`music-room-client`](https://github.com/hungnm-developer/music-room-client).

- **Cài cho văn phòng (Docker):** [`deploy/README.md`](deploy/README.md)
- **Deploy lên cloud (Vercel + Render):** [`deploy/README.md` §8](deploy/README.md#8-deploy-lên-cloud-vercel-web--render-api)
- **Thiết kế:** [`docs/specs/2026-10-14-music-room-mvp-design.md`](docs/specs/2026-10-14-music-room-mvp-design.md)
- **Yêu cầu và mô hình nghiệp vụ:** [`docs/requirements/2026-10-14-music-room-v2-yeu-cau.md`](docs/requirements/2026-10-14-music-room-v2-yeu-cau.md)
- **Ma trận case:** [`docs/qa/2026-10-14-music-room-v2-test-matrix.md`](docs/qa/2026-10-14-music-room-v2-test-matrix.md)

## Phát triển

```bash
docker run -d --name musicroom-dev-db -e POSTGRES_USER=musicroom -e POSTGRES_PASSWORD=musicroom \
  -e POSTGRES_DB=musicroom -p 55432:5432 postgres:16-alpine
cp deploy/.env.example .env   # rồi sửa: DATABASE_URL=postgresql://musicroom:musicroom@localhost:55432/musicroom
                              #          PUBLIC_URL=http://localhost:3000, CORS_ORIGINS=http://localhost:3000
                              #          YOUTUBE_FAKE=1 (không gọi YouTube thật), DATA_DIR=./.data
npm ci
npx prisma migrate dev
npm run start:dev             # http://localhost:3001/api/health
```

| Lệnh | Việc |
|---|---|
| `npm test` | Unit test (Jest) |
| `npm run test:int` | Integration test với Postgres thật (Testcontainers, cần Docker) |
| `npm run lint` · `npm run typecheck` | ESLint · TypeScript |
| `npm run build` | `prisma generate` + `nest build` |

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `src/contracts/` | Schema Zod, sự kiện, kiểu snapshot — **nguồn gốc**, client copy bằng `npm run contracts:sync` |
| `src/realtime/` | Gateway Socket.IO: kiểm tra schema → xác thực → ack |
| `src/state/` | `RoomStateService.mutate()` — transaction + khóa dòng + version + broadcast |
| `src/queue/` | `fair-queue.ts` (thứ tự công bằng, hàm thuần) và các thao tác hàng chờ |
| `src/playback/` | Chuyển bài, hẹn giờ, phiếu bỏ qua, lease máy phát |
| `src/music/` | YouTube Data API / oEmbed, cache, tìm kiếm, playlist dự phòng |
| `src/members/`, `src/auth/` | Phòng, thành viên, quyền, token, PIN |

## Biến môi trường

Xem [`deploy/.env.example`](deploy/.env.example). Thiếu hoặc sai biến bắt buộc thì server **không khởi động** và in rõ biến nào sai.
