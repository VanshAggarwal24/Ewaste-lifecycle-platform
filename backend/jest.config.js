/**
 * Jest configuration for the EcoCycle backend test suite.
 *
 * - unit tests:        pure logic, no database required
 * - integration tests: real HTTP requests (supertest) against a real PostgreSQL database
 *
 * `globalSetup` applies versioned Prisma migrations to the *test* database; it never
 * touches the development database. Tests run in band because they share one database.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  globalSetup: '<rootDir>/tests/helpers/globalSetup.ts',
  setupFilesAfterEnv: ['<rootDir>/tests/helpers/setupAfterEnv.ts'],
  clearMocks: true,
  testTimeout: 30000,
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'ES2022',
          module: 'CommonJS',
          esModuleInterop: true,
          strict: true,
          skipLibCheck: true,
          types: ['node', 'jest'],
        },
        diagnostics: { ignoreCodes: [151001] },
      },
    ],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
