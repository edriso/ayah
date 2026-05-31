import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      // config.ts throws at import if these are missing; the dummies let tests
      // that load it transitively run. dotenv never overrides real env. The
      // DATABASE_URL lets the Prisma client be imported without a real DB; the
      // pure tests here never open a connection.
      BOT_TOKEN: 'test-bot-token',
      DATABASE_URL: 'mysql://test:test@localhost:3306/test',
      TZ_NAME: 'Africa/Cairo',
    },
  },
});
