import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    env: {
      // A dummy URL so the Prisma client can be imported without a real DB.
      // The tests here only exercise pure functions (reference data and
      // curriculum building); they never open a connection.
      DATABASE_URL: 'mysql://test:test@localhost:3306/test',
    },
  },
});
