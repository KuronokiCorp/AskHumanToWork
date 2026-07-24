import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration suite shares one Postgres database and truncates `users`
    // between tests; run files serially so they don't wipe each other's fixtures.
    fileParallelism: false,
  },
});
