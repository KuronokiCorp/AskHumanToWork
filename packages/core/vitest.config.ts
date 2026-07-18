import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The integration suites share one Postgres database and each truncates
    // `users` between tests, so running files in parallel makes them wipe each
    // other's fixtures. Run one file at a time.
    fileParallelism: false,
  },
});
