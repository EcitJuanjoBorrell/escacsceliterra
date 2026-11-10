import { defineConfig } from 'vitest/config';

// base './' perquè el build funcioni també obert per file:// i a qualsevol subcarpeta
export default defineConfig({
  base: './',
  test: { environment: 'node' }
});
