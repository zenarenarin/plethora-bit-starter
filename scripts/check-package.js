#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const {
  BIT_ALLOWED_NETWORK_HOSTS,
  BIT_MAX_PACKAGE_BYTES,
  assertSourcePackageContract,
  canonicalPackageByteLength,
  checkPackageDirectory,
  extractBitSourceMeta,
  formatBytes,
  packageLimitError,
} = require('../lib/bit-contract');

const args = process.argv.slice(2);
const writeManifest = args.includes('--write-manifest');
const targetArg = args.find(arg => !arg.startsWith('--'));
const defaultTarget = fs.existsSync('dist/bit.js') ? 'dist/bit.js' : 'src/index.js';
const target = path.resolve(targetArg || defaultTarget);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function assertFileSize(label, bytes) {
  if (bytes > BIT_MAX_PACKAGE_BYTES) fail(`${label}: ${packageLimitError(bytes)}`);
}

if (!fs.existsSync(target)) fail(`Not found: ${target}`);

const stat = fs.statSync(target);

try {
  if (stat.isDirectory()) {
    const result = checkPackageDirectory(target, { writeManifest });
    console.log(`OK: package directory ${target}`);
    console.log(`  entry: ${path.relative(target, result.entryPath).replace(/\\/g, '/')}`);
    console.log(`  manifest: ${path.relative(target, result.manifestPath).replace(/\\/g, '/')}`);
    console.log(`  assets: ${result.assetCount}`);
    console.log(`  extracted size: ${formatBytes(result.extractedBytes)} / ${formatBytes(BIT_MAX_PACKAGE_BYTES)}`);
    console.log(`  canonical package: ${formatBytes(result.packageBytes)} / ${formatBytes(BIT_MAX_PACKAGE_BYTES)}`);
    if (writeManifest) console.log('  manifest descriptors written');
    return;
  }

  if (target.endsWith('.zip')) {
    assertFileSize('ZIP file', stat.size);
    console.log(`OK: zip file ${target}`);
    console.log(`  compressed size: ${formatBytes(stat.size)} / ${formatBytes(BIT_MAX_PACKAGE_BYTES)}`);
    console.log('  note: the upload function will also validate extracted size, manifest descriptors, and package hash');
    return;
  }

  if (target.endsWith('.js')) {
    const source = fs.readFileSync(target, 'utf8');
    const meta = extractBitSourceMeta(source);
    const manifest = assertSourcePackageContract(source, {
      manifestInput: {
        title: meta.title || path.basename(target, '.js'),
        description: meta.description,
        tags: meta.tags,
      },
      requireTitle: true,
    });
    const packageBytes = canonicalPackageByteLength(source, manifest);
    console.log(`OK: source file ${target}`);
    console.log(`  title: ${manifest.title}`);
    console.log(`  permissions: ${manifest.permissions.length ? manifest.permissions.join(', ') : '(none)'}`);
    console.log(`  canonical package: ${formatBytes(packageBytes)} / ${formatBytes(BIT_MAX_PACKAGE_BYTES)}`);
    console.log(`  approved CDN hosts: ${BIT_ALLOWED_NETWORK_HOSTS.join(', ')}`);
    return;
  }

  fail(`Unsupported target. Use a .js file, .zip file, or package directory: ${target}`);
} catch (error) {
  fail(error.message || String(error));
}
