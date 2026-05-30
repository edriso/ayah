// Prisma CLI config. In Prisma 7 the datasource block no longer holds the
// connection URL, so the CLI (migrate, db push, studio, seed) reads it from
// here. The running bot builds its own client in src/client.ts.
//
// We tolerate a missing DATABASE_URL at load time so `prisma generate`
// (run by postinstall in CI/Docker, which does not touch the DB) never
// fails here. Commands that really connect will error with their own clear
// message if the URL is missing.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
