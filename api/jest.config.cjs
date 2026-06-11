module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.json' }]
  },
  collectCoverageFrom: [
    'src/**/*.service.ts',
    'src/**/*.guard.ts',
    'src/**/*.provider.ts',
    'src/**/*.registry.ts',
    '!src/modules/prisma/prisma.service.ts',
    '!src/modules/integrations/google-oauth.client.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  testEnvironment: 'node'
};
