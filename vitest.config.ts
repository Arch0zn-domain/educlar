import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { fileParallelism: false, testTimeout: 60000, hookTimeout: 60000 }, resolve: { alias: { '@': new URL('./src', import.meta.url).pathname.replace(/^\/(\w:)/, '$1') } } });
