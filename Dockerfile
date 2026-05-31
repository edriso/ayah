# syntax=docker/dockerfile:1
#
# Image for the Ayah Telegram bot. It runs from TypeScript source with tsx
# (no separate compile step), which keeps the setup simple. The verified
# Quran text file is committed in the repo, so the image needs no network to
# seed.
#
# Migrations and seeding are NOT run here. Run them once per environment as
# setup steps (see docs/DEPLOY.md):
#     pnpm db:deploy && pnpm db:seed
# The bot refuses to start until the text is seeded, so you cannot forget.

FROM node:22-slim
WORKDIR /app

# openssl: Prisma's CLI engines (migrate/seed) need libssl, which node:22-slim
# omits; without it Prisma warns and guesses. ca-certificates: TLS roots.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install the pinned pnpm GLOBALLY rather than via corepack. The bot's CMD is
# `pnpm start`, so it invokes pnpm at container startup; with corepack, that
# triggers an interactive "download pnpm?" prompt for the runtime `node` user,
# which hangs a detached (`up -d`) container. A global pnpm needs no download.
RUN npm install -g pnpm@10.33.0

# Copy manifests first so `pnpm install` is cached when only source changes.
COPY package.json pnpm-lock.yaml ./
# The postinstall hook runs `prisma generate`, which needs the schema/config.
COPY prisma ./prisma
COPY prisma.config.ts ./

# Install ALL dependencies (the postinstall `prisma generate` and tsx need
# them). We set NODE_ENV to production AFTER this so the install does not skip
# anything.
RUN pnpm install --frozen-lockfile

# Copy the rest of the source (including the committed Quran data file).
COPY . .

# Regenerate the Prisma client against the final source tree. The install
# step above already generates it, but regenerating here makes the image
# independent of COPY ordering and guarantees it matches the committed schema.
RUN pnpm db:generate

# This image is the production artifact, so default to production for runtime.
# An operator can still override it with `-e NODE_ENV=...` if ever needed.
ENV NODE_ENV=production

# Drop root for runtime. The bot writes nothing to disk; logs go to stdout.
USER node

# Long-polling bot: no inbound port needed (the /health server binds PORT).
CMD ["pnpm", "start"]
