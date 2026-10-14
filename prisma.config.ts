import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Migrations need a direct (non-pooled) connection. With Neon, set DATABASE_URL to the
  // pooled "-pooler" URL for the app and DIRECT_URL to the direct one; otherwise only
  // DATABASE_URL is needed. See deploy/README.md §8.
  datasource: { url: process.env.DIRECT_URL || env('DATABASE_URL') },
});
