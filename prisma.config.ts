// Prisma CLI config. In Prisma 7 the datasource block no longer holds the
// connection URL, so the CLI (migrate, db push, studio, seed) reads it from
// here.
//
// We load the project's single root .env. The Prisma CLI loads this file on
// its own, so to avoid any resolution edge cases we find the root (the folder
// with package.json) and load it inline here (the same logic lives in
// src/core/env.ts for the rest of the app).
//
// A missing DATABASE_URL is tolerated at load time so `prisma generate` (run
// by postinstall in CI/Docker, which does not connect) never fails here.
// Commands that really connect error later with their own clear message.
import { config as dotenvConfig } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { defineConfig } from 'prisma/config';

function loadRootEnv(): void {
  let dir = process.cwd();
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, 'package.json'))) {
      dotenvConfig({ path: join(dir, '.env'), quiet: true });
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  dotenvConfig({ quiet: true }); // fallback to a local .env
}

loadRootEnv();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
