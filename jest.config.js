const nextJest = require('next/jest');

// Pure-logic tests only (utils, hooks' helpers), so the default `node` environment is enough —
// no jsdom, no Testing Library. `next/jest` supplies the SWC transform and the `@/` aliases.
const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
};

module.exports = createJestConfig(config);
