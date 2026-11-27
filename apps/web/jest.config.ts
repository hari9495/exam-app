import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }], '^.+\\.m?js$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }] },
  // T2-G 84b: next-intl and its message formatter ship only as ES modules; Jest gets them as CommonJS.
  transformIgnorePatterns: ['/node_modules/(?!(next-intl|use-intl|intl-messageformat|@formatjs|icu-minify|@schummar)/)'],
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  // Page tests type whole passwords and forms key by key; on a shared machine under load (other dev servers and
  // e2e runs) one such test passed 5 s while the suite took 21 min. 15 s keeps a real hang visible.
  testTimeout: 15_000,
  moduleNameMapper: {
    '\\.(css|less|scss)$': '<rootDir>/jest.style-mock.ts',
    '^d3-scale$': '<rootDir>/__mocks__/d3-scale.ts',
    '^d3-shape$': '<rootDir>/__mocks__/d3-shape.ts',
  },
};

export default config;
