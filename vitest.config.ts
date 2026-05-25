import { defineConfig } from 'vitest/config'
import path from 'node:path'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  // Wir nutzen NUR die Plugins, die für Tests nötig sind
  plugins: [viteReact()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      '#': path.resolve(__dirname, './src'),
      // Zwingt Vitest auf die exakt gleichen React-Dateien
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    reporters: ['verbose'],
    server: {
      deps: {
        // Verhindert den "module is not defined" Fehler bei React 19
        inline: [/react/],
      },
    },
    setupFiles: ['./src/test/setup.ts'],
    env: {
      DATABASE_URL: 'postgresql://dummy:dummy@localhost:5432/test',
      BETTER_AUTH_SECRET: 'super-secret-test-key',
      BETTER_AUTH_URL: 'http://localhost:3000',
      OPENROUTER_API_KEY: 'sk-or-dummy-key-for-tests',
    },
  },
})
