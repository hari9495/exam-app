module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  // `*.integration.spec.ts` needs a live SQL Server (real RLS, transactions) and is run
  // separately where a DATABASE_URL is provisioned -- same segregation the `.e2e-spec.ts`
  // suite already gets via test:e2e. Excluded from this no-DB unit run so CI stays green;
  // without this, record-visibility.integration.spec.ts fails on DATABASE_URL-not-found.
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.spec\\.ts$'],
  setupFiles: ['<rootDir>/../test/fixtures/cheap-argon2.ts'],
  // openid-client, oauth4webapi, jose, franc-min (with its trigram-utils, n-gram, collapse-white-space) and file-type (with strtok3,
  // token-types, uint8array-extras, @tokenizer/inflate, @borewit/text-codec) and sanitize-html's parser (htmlparser2 12 with
  // domelementtype, domhandler, domutils, dom-serializer, entities) ship ESM only. Node loads them through require(esm);
  // Jest's CommonJS loader cannot, so they are down-levelled here (same in test/jest-e2e.json).
  transform: {
    '/node_modules/(openid-client|oauth4webapi|jose|franc-min|trigram-utils|n-gram|collapse-white-space|file-type|strtok3|token-types|uint8array-extras|@tokenizer/inflate|@borewit/text-codec|htmlparser2|domelementtype|domhandler|domutils|dom-serializer|entities)/.+\\.js$': ['ts-jest', { tsconfig: { allowJs: true }, isolatedModules: true }],
    // Transpile only: type-checking every file inside every worker made the run CPU-bound, and a module first required
    // inside a test (exceljs, Nest testing modules) was type-checked within that test's 5 s timeout. Types are checked
    // by `tsc --noEmit` / the build instead.
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: { isolatedModules: true } }],
  },
  // Only the innermost package of a path counts, so a listed package nested under another one (sanitize-html's own
  // htmlparser2 12) is transformed too.
  transformIgnorePatterns: ['/node_modules/(?!(openid-client|oauth4webapi|jose|franc-min|trigram-utils|n-gram|collapse-white-space|file-type|strtok3|token-types|uint8array-extras|@tokenizer/inflate|@borewit/text-codec|htmlparser2|domelementtype|domhandler|domutils|dom-serializer|entities)/)[^/]+/(?!(.*/)?node_modules/)'],
  collectCoverageFrom: [
    '**/*.(t|j)s',
  ],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};
