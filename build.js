const esbuild = require('esbuild');
const fs = require('fs');
const {
  BIT_MAX_PACKAGE_BYTES,
  assertSourcePackageContract,
  canonicalPackageByteLength,
  formatBytes,
} = require('./lib/bit-contract');

const watch = process.argv.includes('--watch');

function checkBuiltBit() {
  const source = fs.readFileSync('dist/bit.js', 'utf8');
  const manifest = assertSourcePackageContract(source, { requireTitle: false });
  const packageBytes = canonicalPackageByteLength(source, manifest);
  console.log(`OK contract: ${formatBytes(packageBytes)} / ${formatBytes(BIT_MAX_PACKAGE_BYTES)}`);
}

function checkSourceBit() {
  const source = fs.readFileSync('src/index.js', 'utf8');
  assertSourcePackageContract(source, { requireTitle: false });
}

const ctx = esbuild.context({
  entryPoints: ['src/index.js'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/bit.js',
  target: ['es6'],
  minify: !watch,
  logLevel: 'info',
});

ctx.then(c => {
  if (watch) {
    c.watch();
    console.log('Watching for changes... (Ctrl+C to stop)');
  } else {
    checkSourceBit();
    c.rebuild()
      .then(() => {
        checkBuiltBit();
        console.log('OK built dist/bit.js');
        c.dispose();
      })
      .catch(error => {
        if (error && error.message) console.error(error.message);
        c.dispose();
        process.exit(1);
      });
  }
});
