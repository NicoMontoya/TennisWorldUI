import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // components/*.test.js use node:test — run those with `node --test`,
        // not vitest (they have no vitest suite and fail collection here).
        include: ['*.test.js'],
        exclude: ['components/**', 'node_modules/**'],
        environment: 'node',
    },
});
