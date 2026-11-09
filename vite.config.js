import { defineConfig } from 'vite';

const base = process.env.GITHUB_ACTIONS ? '/familyflow/' : '/';

export default defineConfig({
  base,
});
