import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    env: {
      // config.ts throws at import if these are missing; tests that load it
      // transitively get harmless dummies. dotenv never overrides real env.
      BOT_TOKEN: 'test-bot-token',
      DATABASE_URL: 'mysql://test:test@localhost:3306/test',
      TZ_NAME: 'Africa/Cairo',
    },
  },
});
