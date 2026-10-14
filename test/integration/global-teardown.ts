import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Removes the Postgres container with the Docker CLI. The Node Docker client
 * cannot be used here: in-band test files leave nock's patches on the shared
 * `http` module, which breaks unix-socket requests (they go to localhost:80).
 */
export default function globalTeardown(): void {
  const idFile = join(__dirname, '.db-container');
  try {
    const id = readFileSync(idFile, 'utf8').trim();
    execFileSync('docker', ['rm', '-f', '-v', id], { stdio: 'ignore' });
  } finally {
    rmSync(idFile, { force: true });
    rmSync(join(__dirname, '.db-url'), { force: true });
  }
}
