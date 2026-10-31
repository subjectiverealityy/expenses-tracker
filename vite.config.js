import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// base './' keeps asset paths relative, so the build works on GitHub Pages
// (including project sub-paths), Netlify, Vercel or any static host.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
});
