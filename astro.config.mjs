import { defineConfig } from 'astro/config';

// GameHub is a static single-page app: Tauri loads the files from `dist`.
export default defineConfig({
  output: 'static',
  devToolbar: { enabled: false },
  server: { port: 4321 },
  vite: {
    clearScreen: false,
    server: {
      strictPort: true,
      watch: {
        // Rust builds and user data must not trigger reloads.
        ignored: ['**/src-tauri/**', '**/GameHub_Data/**'],
      },
    },
  },
});
