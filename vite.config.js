import { defineConfig, loadEnv } from 'vite';

const base = process.env.GITHUB_ACTIONS ? '/familyflow/' : '/';

/**
 * Proxy keeps Ollama on loopback. Browser never talks to :11434 directly.
 * Override target with FAMILYFLOW_OLLAMA_URL for a LAN bridge later (still not public WAN).
 */
function ollamaProxy() {
  const target = process.env.FAMILYFLOW_OLLAMA_URL || 'http://127.0.0.1:11434';
  return {
    '/api/ollama': {
      target,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api\/ollama/, ''),
    },
  };
}

export default defineConfig(({ mode }) => {
  // Ensure env is visible if someone puts FAMILYFLOW_OLLAMA_URL in .env.local
  loadEnv(mode, process.cwd(), '');
  const proxy = ollamaProxy();
  return {
    base,
    server: {
      host: '127.0.0.1',
      port: 5174,
      strictPort: true,
      proxy,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
    preview: {
      host: '127.0.0.1',
      port: 4174,
      strictPort: true,
      proxy,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
    build: {
      // Hashed filenames already bust CDN/browser cache when index.html updates.
      assetsDir: 'assets',
    },
    plugins: [
      {
        name: 'familyflow-html-cache-headers',
        transformIndexHtml(html) {
          // Hint browsers not to pin the shell document; GH Pages CDN still ~10m.
          return html.replace(
            '<head>',
            `<head>
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
    <meta http-equiv="Pragma" content="no-cache" />
    <meta http-equiv="Expires" content="0" />`,
          );
        },
      },
    ],
  };
});
