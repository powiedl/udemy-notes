import { defineConfig } from 'vitest/config'
import path from 'node:path'
import viteReact from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  // Wir nutzen NUR die Plugins, die für Tests nötig sind
  plugins: [tsconfigPaths({ projects: ['./tsconfig.json'] }), viteReact()],
  resolve: {
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
    server: {
      deps: {
        // Verhindert den "module is not defined" Fehler bei React 19
        inline: [/react/],
      },
    },
    setupFiles: ['./src/test/setup.ts'],
  },
})
