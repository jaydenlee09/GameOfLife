// Bundles functions/src + the app's shared src/utils into lib/:
//   lib/cli.js   — what GitHub Actions runs (the active setup)
//   lib/index.js — the optional Firebase Cloud Function (firebase deploy uploads
//                  only this folder, so shared code must be inlined)
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const { dependencies } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));

// The shared src/utils import lucide-react icons as UI metadata (rank tiers,
// achievements). The server never renders, so swap the package for a CommonJS
// proxy where every export is a no-op component. CommonJS so esbuild accepts any
// named import without a hand-kept list that would break on the next new icon.
const stubLucide = {
  name: 'stub-lucide-react',
  setup(b) {
    b.onResolve({ filter: /^lucide-react$/ }, () => ({ path: 'lucide-react', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'const Icon = () => null; module.exports = new Proxy({}, { get: (_, key) => (key === "__esModule" ? false : Icon) });',
      loader: 'js',
    }));
  },
};

await build({
  entryPoints: ['src/index.js', 'src/cli.js'],
  outdir: 'lib',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  external: Object.keys(dependencies),
  plugins: [stubLucide],
  // Client-only code paths read Vite env vars; the server never calls them.
  define: { 'import.meta.env': '{}' },
  logLevel: 'warning',
});
console.log('built functions/lib/index.js + lib/cli.js');
