module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  testMatch: ['**/tests/**/*.test.ts'],
  moduleNameMapper: {
    '^obsidian$': '<rootDir>/node_modules/obsidian',
  },
};
