import { defineConfig } from 'vite';

export default defineConfig({
  // Aquesta línia és la que Cloudflare està buscant i no trobava
  plugins: [], 
  
  build: {
    outDir: 'dist', // Assegura que la carpeta de sortida es digui 'dist'
  },
  server: {
    port: 5173,
  }
});