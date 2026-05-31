import { config as dotenvConfig } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

// One .env for the whole project. Code and scripts call loadEnv() at startup;
// it finds the project root (the folder with package.json) and loads the
// single .env there. This way there is just one file to fill in, no matter
// which folder a command runs from.

let loaded = false;

/** Load the project's root .env into process.env. Safe to call many times. */
export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  // quiet: true silences dotenv v17's promotional "tip" lines so they do not
  // clutter the bot logs.
  const root = findProjectRoot(process.cwd());
  if (root) {
    dotenvConfig({ path: join(root, '.env'), quiet: true });
  } else {
    // Fallback: load a .env from the current directory if we cannot find the
    // root (e.g. an unusual deploy layout). dotenv never overrides variables
    // already set in the real environment.
    dotenvConfig({ quiet: true });
  }
}

/** Walk up from `start` to find the project root (the folder with package.json). */
function findProjectRoot(start: string): string | null {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break; // reached the filesystem root
    dir = parent;
  }
  return null;
}
