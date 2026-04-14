const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');

const ctx = esbuild.context({
  entryPoints: ['src/index.js'],
  bundle: true,
  format: 'iife',   // wraps code in a self-executing function; window.scrollerApp = {...} still reaches the global
  outfile: 'dist/bit.js',
  target: ['es6'],
  minify: !watch,
  logLevel: 'info',
});

ctx.then(c => {
  if (watch) {
    c.watch();
    console.log('Watching for changes… (Ctrl+C to stop)');
  } else {
    c.rebuild()
      .then(() => { console.log('✓ Built dist/bit.js'); c.dispose(); })
      .catch(() => { c.dispose(); process.exit(1); });
  }
});
