import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json', jsx: 'react-jsx' }] },
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  moduleNameMapper: { '\\.(css|less|scss)$': '<rootDir>/jest.style-mock.ts' },
};

export default config;
