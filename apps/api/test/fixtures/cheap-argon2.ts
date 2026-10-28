// Unit tests hash and verify with the real argon2, at its minimum cost instead of the production default (64 MiB,
// 3 passes, ~60 ms idle). auth.service.spec alone runs about 100 of them; with every Jest worker doing the same the
// suites ran past the 5 s test timeout on a loaded machine. Same algorithm and hash format; verify() reads the cost
// from the hash, so it is cheap too. Production code is unchanged.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const argon2 = require('argon2') as typeof import('argon2');

const hash = argon2.hash;
const CHEAP = { memoryCost: 1024, timeCost: 2, parallelism: 1 };
(argon2 as { hash: typeof hash }).hash = ((plain: string | Buffer, options?: object) => hash(plain, { ...CHEAP, ...options })) as typeof hash;
