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

RUN corepack enable

# Copy manifests first so `pnpm install` is cached when only source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json ./packages/core/
COPY packages/database/package.json ./packages/database/
COPY apps/telegram/package.json ./apps/telegram/
# The postinstall hook runs `prisma generate`, which needs the schema/config.
COPY packages/database/prisma ./packages/database/prisma
COPY packages/database/prisma.config.ts ./packages/database/

RUN pnpm install --frozen-lockfile

# Copy the rest of the source (including the committed Quran data file).
COPY . .

# Drop root for runtime. The bot writes nothing to disk; logs go to stdout.
USER node

# Long-polling bot: no inbound port needed (the /health server binds PORT).
CMD ["pnpm", "start"]
