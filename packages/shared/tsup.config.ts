import { defineConfig } from 'tsup';

// Sem dts e sem type-check: o editor e o Vite leem o TS direto de src/.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.mjs' }),
  target: 'es2022',
  sourcemap: true,
  clean: true,
  dts: false,
  splitting: false,
});
