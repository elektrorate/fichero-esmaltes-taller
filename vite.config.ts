import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');

  // Identificador de build, visible en la app. Sirve para saber de inmediato si
  // el navegador está con la versión desplegada o con una copia cacheada
  // antigua: es la causa más difícil de diagnosticar cuando un arreglo parece
  // no tener efecto. Vercel expone el commit automáticamente; en local cae a
  // 'local'.
  const buildSha = (process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7);

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      __BUILD_SHA__: JSON.stringify(buildSha),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify: file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/glazy-api': {
          target: 'https://api.glazy.org',
          changeOrigin: true,
          rewrite: (proxyPath) => proxyPath.replace(/^\/glazy-api/, ''),
        },
      },
    },
  };
});
