module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  // `*.integration.spec.ts` needs a live SQL Server (real RLS, transactions) and is run
  // separately where a DATABASE_URL is provisioned -- same segregation the `.e2e-spec.ts`
  // suite already gets via test:e2e. Excluded from this no-DB unit run so CI stays green;
  // without this, record-visibility.integration.spec.ts fails on DATABASE_URL-not-found.
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.spec\\.ts$'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    '**/*.(t|j)s',
  ],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};
