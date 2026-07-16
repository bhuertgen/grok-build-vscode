import * as esbuild from 'esbuild';
import * as fs from 'node:fs';
import * as path from 'node:path';

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production') || !watch;

const outDir = 'dist';
fs.mkdirSync(outDir, { recursive: true });

/** Copy webview static assets next to the bundle */
function copyWebview() {
  const srcDir = path.join('webview');
  const destDir = path.join(outDir, 'webview');
  fs.mkdirSync(destDir, { recursive: true });
  for (const file of fs.readdirSync(srcDir)) {
    fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
  }
}

/** Ensure media assets (Grok logo) are available next to the extension */
function copyMedia() {
  const srcDir = path.join('media');
  const destDir = path.join(outDir, 'media');
  if (!fs.existsSync(srcDir)) {
    return;
  }
  fs.mkdirSync(destDir, { recursive: true });
  for (const file of fs.readdirSync(srcDir)) {
    fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
  }
}

const ctx = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: path.join(outDir, 'extension.js'),
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: !production,
  minify: production,
  sourcesContent: false,
  logLevel: 'info',
  define: {
    'process.env.NODE_ENV': production ? '"production"' : '"development"',
  },
  plugins: [
    {
      name: 'copy-webview-and-signal',
      setup(build) {
        build.onEnd((result) => {
          copyWebview();
          copyMedia();
          if (result.errors.length === 0) {
            // Signal for VS Code background problemMatcher (endsPattern)
            console.log('[watch] build finished, watching for changes...');
          }
        });
      },
    },
  ],
});

if (watch) {
  // beginsPattern for VS Code preLaunchTask
  console.log('[watch] build started...');
  await ctx.watch();
  fs.watch('webview', { recursive: true }, () => {
    try {
      copyWebview();
      console.log('[watch] webview assets copied');
      console.log('[watch] build finished, watching for changes...');
    } catch (e) {
      console.error(e);
    }
  });
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log('[build] done');
}
