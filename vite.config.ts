import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      'next/navigation': path.resolve(import.meta.dirname, './src/compat/next-navigation.ts'),
      'next/link': path.resolve(import.meta.dirname, './src/compat/next-link.tsx'),
      'next/image': path.resolve(import.meta.dirname, './src/compat/next-image.tsx'),
    },
  },
  server: {
    port: 3000,
    open: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
});
