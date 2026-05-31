import { loadEnv } from '../core';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

// Load the single root .env before we read DATABASE_URL.
loadEnv();

// Parse the URL ourselves so we can hand the adapter a PoolConfig object.
// The URL-string form uses lax pool defaults (idleTimeout 30 min) that
// misbehave on shared-hosting MySQL (e.g. Hostinger), which drops idle TCP
// sockets after ~60s. Swapping "mysql://" to "mariadb://" only helps Node's
// URL parser read the userinfo when the password has special characters.
function parseDbUrl(raw: string) {
  const u = new URL(raw.replace(/^mysql:\/\//, 'mariadb://'));
  return {
    host: u.hostname,
    port: u.port ? parseInt(u.port, 10) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
  };
}

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env.');
}

const logLevels =
  process.env.NODE_ENV === 'production' ? (['error'] as const) : (['warn', 'error'] as const);

const { host, port, user, password, database } = parseDbUrl(rawUrl);
const adapter = new PrismaMariaDb(
  {
    host,
    port,
    user,
    password,
    database,
    connectionLimit: 5,
    idleTimeout: 30,
    minimumIdle: 1,
    acquireTimeout: 15_000,
  },
  { database },
);

// One client per process. We stash it on globalThis in non-production so a
// dev-watch reload reuses the same pool instead of leaking a new one each
// time the module is re-imported.
const globalForPrisma = globalThis as unknown as {
  __ayahPrisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.__ayahPrisma ?? new PrismaClient({ adapter, log: [...logLevels] });

if (process.env.NODE_ENV !== 'production') globalForPrisma.__ayahPrisma = prisma;
