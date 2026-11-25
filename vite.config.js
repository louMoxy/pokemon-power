import { defineConfig } from 'vite';

// Relative base so the build works on GitHub Pages under /<repo-name>/.
// es2022 target allows top-level await (all current browsers support it).
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
});
