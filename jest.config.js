/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  // `cookie` (used by Fastify's inject) ships ESM only, so it has to be transpiled for Jest's CommonJS runtime.
  transform: { '^.+\\.[jt]s$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }] },
  transformIgnorePatterns: ['/node_modules/(?!cookie/)'],
};
