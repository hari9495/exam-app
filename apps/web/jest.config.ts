import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }] },
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  moduleNameMapper: {
    '\\.(css|less|scss)$': '<rootDir>/jest.style-mock.ts',
    '^d3-scale$': '<rootDir>/__mocks__/d3-scale.ts',
    '^d3-shape$': '<rootDir>/__mocks__/d3-shape.ts',
  },
};

export default config;
