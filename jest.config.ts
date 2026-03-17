import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/tests/**',
    '!src/index.ts',
  ],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@qbtlabs/x402/split$': '<rootDir>/node_modules/@qbtlabs/x402/src/split/index.ts',
    '^@qbtlabs/x402/transport$': '<rootDir>/node_modules/@qbtlabs/x402/src/transport/index.ts',
    '^@qbtlabs/x402$': '<rootDir>/node_modules/@qbtlabs/x402/src/index.ts',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
        diagnostics: {
          ignoreCodes: [151002],
        },
        useESM: true,
      },
    ],
  },
  // Transform ESM packages
  transformIgnorePatterns: [
    'node_modules/(?!(@noble/hashes|@noble/curves|@qbtlabs/x402)/)',
  ],
  extensionsToTreatAsEsm: ['.ts'],
};

export default config;
