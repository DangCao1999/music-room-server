import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const URL_FILE = join(__dirname, '.db-url');
export const ID_FILE = join(__dirname, '.db-container');

/** One Postgres container for the whole integration run; migrations applied once. */
export default async function globalSetup(): Promise<void> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const url = container.getConnectionUri();
  execSync('npx prisma migrate deploy', {
    cwd: join(__dirname, '..', '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  writeFileSync(URL_FILE, url);
  writeFileSync(ID_FILE, container.getId());
}
