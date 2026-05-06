'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BIT_CONTRACT_SPEC = Object.freeze(require('../bitContractV1.json'));
const BIT_PACKAGE_SCHEMA_VERSION = BIT_CONTRACT_SPEC.schemaVersion;
const BIT_RUNTIME_VERSION = BIT_CONTRACT_SPEC.runtimeVersion;
const BIT_MAX_PACKAGE_BYTES = BIT_CONTRACT_SPEC.limits.maxPackageBytes;
const BIT_ALLOWED_NETWORK_HOSTS = Object.freeze([...(BIT_CONTRACT_SPEC.networkAllowedHosts || [])]);

const ALLOWED_PERMISSIONS = new Set(BIT_CONTRACT_SPEC.permissions);
const TAG_RE = new RegExp(BIT_CONTRACT_SPEC.patterns.tag);
const ASSET_HASH_RE = new RegExp(BIT_CONTRACT_SPEC.patterns.assetHash);
const ASSET_ROLE_RE = new RegExp(BIT_CONTRACT_SPEC.patterns.assetRole);
const MIME_RE = new RegExp(BIT_CONTRACT_SPEC.patterns.mime);

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function byteLength(value) {
  return Buffer.byteLength(String(value ?? ''), 'utf8');
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(bytes % (1024 * 1024) === 0 ? 0 : 2)} MB`;
  }
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function packageLimitError(actualBytes) {
  return `Bit package is ${formatBytes(actualBytes)}; max is ${formatBytes(BIT_MAX_PACKAGE_BYTES)}.`;
}

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];
  (Array.isArray(values) ? values : []).forEach(value => {
    if (typeof value !== 'string') return;
    const cleaned = value.trim();
    if (!cleaned || seen.has(cleaned)) return;
    seen.add(cleaned);
    out.push(cleaned);
  });
  return out;
}

function normalizeBitPermissions(values) {
  return uniqueStrings(values).filter(permission => ALLOWED_PERMISSIONS.has(permission));
}

function normalizeBitTags(values) {
  const seen = new Set();
  return uniqueStrings(values)
    .map(tag => tag.toLowerCase())
    .filter(tag => {
      if (!TAG_RE.test(tag) || seen.has(tag)) return false;
      seen.add(tag);
      return true;
    })
    .slice(0, BIT_CONTRACT_SPEC.limits.maxTags);
}

function normalizeBitAssetPath(value) {
  if (typeof value !== 'string') return null;
  const normalizedPath = value.replace(/\\/g, '/').replace(/^assets\//, '');
  if (!normalizedPath || normalizedPath.length > BIT_CONTRACT_SPEC.limits.maxAssetPathLength) return null;
  if (normalizedPath.startsWith('/') || normalizedPath.endsWith('/') || normalizedPath.split('/').includes('..')) return null;
  return normalizedPath;
}

function normalizeBitAssetHash(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().toLowerCase();
  const prefixed = /^[a-f0-9]{64}$/.test(cleaned) ? `sha256:${cleaned}` : cleaned;
  return ASSET_HASH_RE.test(prefixed) ? prefixed : null;
}

function normalizeBitAssetDescriptor(value) {
  const src = typeof value === 'string' ? { path: value } : (isObject(value) ? value : null);
  if (!src) return null;

  const normalizedPath = normalizeBitAssetPath(src.path);
  if (!normalizedPath) return null;

  const asset = { path: normalizedPath };
  const mime = cleanString(src.mime).toLowerCase();
  if (mime && MIME_RE.test(mime)) asset.mime = mime;

  if (typeof src.size === 'number' && Number.isSafeInteger(src.size) && src.size >= 0) {
    asset.size = src.size;
  }

  const sha256 = normalizeBitAssetHash(src.sha256);
  if (sha256) asset.sha256 = sha256;

  const role = cleanString(src.role).toLowerCase();
  if (role && ASSET_ROLE_RE.test(role)) asset.role = role;

  return asset;
}

function normalizeBitAssets(values) {
  const seen = new Set();
  const out = [];
  (Array.isArray(values) ? values : []).forEach(value => {
    if (out.length >= BIT_CONTRACT_SPEC.limits.maxAssets) return;
    const asset = normalizeBitAssetDescriptor(value);
    if (!asset || seen.has(asset.path)) return;
    seen.add(asset.path);
    out.push(asset);
  });
  return out;
}

function normalizeBitEntry(value, fallback = BIT_CONTRACT_SPEC.entryDefault) {
  const normalizedPath = cleanString(value, fallback).replace(/\\/g, '/');
  if (!normalizedPath || normalizedPath.length > BIT_CONTRACT_SPEC.limits.maxEntryLength) return BIT_CONTRACT_SPEC.entryDefault;
  if (normalizedPath.startsWith('/') || normalizedPath.endsWith('/') || normalizedPath.split('/').includes('..')) return BIT_CONTRACT_SPEC.entryDefault;
  return normalizedPath;
}

function parseStringArrayLiteral(raw) {
  return (String(raw || '').match(/['"`]([^'"`]+)['"`]/g) || [])
    .map(item => item.replace(/['"`]/g, '').trim())
    .filter(Boolean);
}

function sourceArrayLiteral(source, field) {
  const match = String(source || '').match(new RegExp(`${field}\\s*:\\s*\\[([\\s\\S]*?)\\]`));
  return match ? parseStringArrayLiteral(match[1]) : [];
}

function sourceStringLiteral(source, field) {
  const pattern = new RegExp(`${field}\\s*:\\s*("((?:\\\\.|[^"\\\\])*)"|'((?:\\\\.|[^'\\\\])*)'|\`((?:\\\\.|[^\`\\\\])*)\`)`);
  const match = String(source || '').match(pattern);
  const raw = match ? (match[2] ?? match[3] ?? match[4] ?? '') : '';
  return raw
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\(['"`\\])/g, '$1');
}

function extractBitSourceMeta(source) {
  if (!source) {
    return {
      title: '',
      description: '',
      runtime: BIT_RUNTIME_VERSION,
      tags: [],
      permissions: [],
    };
  }

  const title = sourceStringLiteral(source, 'title');
  const description = sourceStringLiteral(source, 'description');
  const runtime = sourceStringLiteral(source, 'runtime') || BIT_RUNTIME_VERSION;

  return {
    title,
    description,
    runtime,
    tags: normalizeBitTags(sourceArrayLiteral(source, 'tags')),
    permissions: normalizeBitPermissions(sourceArrayLiteral(source, 'permissions')),
  };
}

function normalizeBitManifest(manifest, fallback = {}) {
  const src = isObject(manifest) ? manifest : {};
  const fallbackObj = isObject(fallback) ? fallback : {};
  const schemaVersion = Number.isInteger(src.schemaVersion)
    ? Number(src.schemaVersion)
    : BIT_PACKAGE_SCHEMA_VERSION;

  return {
    schemaVersion,
    runtime: cleanString(src.runtime, cleanString(fallbackObj.runtime, BIT_RUNTIME_VERSION)),
    entry: normalizeBitEntry(src.entry, fallbackObj.entry),
    title: cleanString(src.title, cleanString(fallbackObj.title)),
    description: cleanString(src.description, cleanString(fallbackObj.description)),
    tags: normalizeBitTags(src.tags ?? fallbackObj.tags),
    permissions: normalizeBitPermissions(src.permissions ?? fallbackObj.permissions),
    assets: normalizeBitAssets(src.assets ?? fallbackObj.assets),
  };
}

function invalidStrings(values, valid) {
  return uniqueStrings(values).filter(value => !valid(value));
}

function rawAssetPath(value) {
  return typeof value === 'string'
    ? value
    : (isObject(value) && typeof value.path === 'string' ? value.path : '');
}

function canonicalRawAssetPath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^assets\//, '');
}

function describeAsset(value, index) {
  const assetPath = rawAssetPath(value);
  return assetPath ? `"${assetPath}"` : `#${index + 1}`;
}

function validateAssetInput(value, index) {
  if (typeof value === 'string') {
    const normalizedPath = normalizeBitAssetPath(value);
    return normalizedPath === canonicalRawAssetPath(value)
      ? []
      : [`Invalid asset path ${describeAsset(value, index)}.`];
  }

  if (!isObject(value)) {
    return [`Asset ${describeAsset(value, index)} must be a path string or descriptor object.`];
  }

  const errors = [];
  const normalizedPath = normalizeBitAssetPath(value.path);
  if (!normalizedPath || normalizedPath !== canonicalRawAssetPath(String(value.path ?? ''))) {
    errors.push(`Invalid asset path ${describeAsset(value, index)}.`);
  }
  if (value.mime != null) {
    const mime = cleanString(value.mime).toLowerCase();
    if (!mime || !MIME_RE.test(mime)) errors.push(`Invalid asset mime for ${describeAsset(value, index)}.`);
  }
  if (value.size != null) {
    if (typeof value.size !== 'number' || !Number.isSafeInteger(value.size) || value.size < 0) {
      errors.push(`Invalid asset size for ${describeAsset(value, index)}.`);
    }
  }
  if (value.sha256 != null && !normalizeBitAssetHash(value.sha256)) {
    errors.push(`Invalid asset sha256 for ${describeAsset(value, index)}.`);
  }
  if (value.role != null) {
    const role = cleanString(value.role).toLowerCase();
    if (!role || !ASSET_ROLE_RE.test(role)) errors.push(`Invalid asset role for ${describeAsset(value, index)}.`);
  }
  return errors;
}

function duplicateAssetPaths(values) {
  const seen = new Set();
  const duplicates = new Set();
  (Array.isArray(values) ? values : []).forEach(value => {
    const normalizedPath = normalizeBitAssetPath(rawAssetPath(value));
    if (!normalizedPath) return;
    if (seen.has(normalizedPath)) duplicates.add(normalizedPath);
    else seen.add(normalizedPath);
  });
  return [...duplicates];
}

function validateBitManifest(manifest, { fallback = {}, requireTitle = false } = {}) {
  const src = isObject(manifest) ? manifest : {};
  const normalized = normalizeBitManifest(src, fallback);
  const errors = [];

  if (normalized.schemaVersion !== BIT_PACKAGE_SCHEMA_VERSION) {
    errors.push(`Unsupported schemaVersion ${normalized.schemaVersion}; expected ${BIT_PACKAGE_SCHEMA_VERSION}.`);
  }
  if (normalized.runtime !== BIT_RUNTIME_VERSION) {
    errors.push(`Unsupported runtime "${normalized.runtime}"; expected "${BIT_RUNTIME_VERSION}".`);
  }
  if (src.entry != null && normalizeBitEntry(src.entry) !== String(src.entry).trim().replace(/\\/g, '/')) {
    errors.push('Invalid manifest entry path.');
  }
  if (requireTitle && !normalized.title) errors.push('Missing title.');

  const badPermissions = invalidStrings(src.permissions, permission => ALLOWED_PERMISSIONS.has(permission));
  if (badPermissions.length) errors.push(`Unsupported permissions: ${badPermissions.join(', ')}.`);

  const badTags = invalidStrings(src.tags, tag => TAG_RE.test(String(tag).toLowerCase()));
  if (badTags.length) errors.push(`Invalid tags: ${badTags.join(', ')}.`);

  if (Array.isArray(src.assets)) {
    if (src.assets.length > BIT_CONTRACT_SPEC.limits.maxAssets) {
      errors.push(`Too many assets; max is ${BIT_CONTRACT_SPEC.limits.maxAssets}.`);
    }
    src.assets.forEach((asset, index) => errors.push(...validateAssetInput(asset, index)));
    const duplicates = duplicateAssetPaths(src.assets);
    if (duplicates.length) errors.push(`Duplicate asset paths: ${duplicates.join(', ')}.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    manifest: normalized,
  };
}

function manifestFromSource(source, overrides = {}) {
  const sourceMeta = extractBitSourceMeta(source);
  return normalizeBitManifest(overrides, sourceMeta);
}

function canonicalPackageByteLength(source, manifest) {
  return byteLength(JSON.stringify({
    source,
    manifest,
    runtimeVersion: manifest.runtime,
  }));
}

function hasRuntimeGlobal(source) {
  return /window\s*\.\s*(plethoraBit|scrollerApp)\s*=/.test(source)
    || /\b(plethoraBit|scrollerApp)\s*=/.test(source);
}

function stripJsComments(source) {
  const input = String(source || '');
  let out = '';
  let i = 0;
  let mode = 'code';
  let quote = '';

  while (i < input.length) {
    const ch = input[i];
    const next = input[i + 1];

    if (mode === 'line-comment') {
      if (ch === '\n') {
        out += ch;
        mode = 'code';
      }
      i += 1;
      continue;
    }

    if (mode === 'block-comment') {
      if (ch === '*' && next === '/') {
        i += 2;
        mode = 'code';
      } else {
        i += 1;
      }
      continue;
    }

    if (mode === 'string') {
      out += ch;
      if (ch === '\\') {
        if (i + 1 < input.length) out += input[i + 1];
        i += 2;
        continue;
      }
      if (ch === quote) mode = 'code';
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      mode = 'string';
      out += ch;
      i += 1;
      continue;
    }

    if (ch === '/' && next === '/') {
      mode = 'line-comment';
      i += 2;
      continue;
    }
    if (ch === '/' && next === '*') {
      mode = 'block-comment';
      i += 2;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

function hostMatches(host, allowed) {
  const lowerHost = String(host || '').toLowerCase();
  const lowerAllowed = String(allowed || '').toLowerCase();
  return !!lowerAllowed && (lowerHost === lowerAllowed || lowerHost.endsWith(`.${lowerAllowed}`));
}

function isAllowedCdnUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl));
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  return BIT_ALLOWED_NETWORK_HOSTS.some(host => hostMatches(url.hostname, host));
}

function isXmlNamespaceUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl));
    return url.protocol === 'http:' && url.hostname === 'www.w3.org';
  } catch {
    return false;
  }
}

function extractNetworkUrls(source) {
  const code = stripJsComments(source);
  const urls = [];
  const seen = new Set();
  const urlRe = /(['"`])(https?:\/\/[^'"`\s<>)]+)\1/g;
  let match;
  while ((match = urlRe.exec(code))) {
    const rawUrl = match[2];
    if (seen.has(rawUrl) || isXmlNamespaceUrl(rawUrl)) continue;
    seen.add(rawUrl);
    urls.push(rawUrl);
  }
  return urls;
}

function validateSurfaceOwnership(source) {
  const code = stripJsComments(source);
  const errors = [];
  const addOnce = message => {
    if (!errors.includes(message)) errors.push(message);
  };

  if (/document\s*\.\s*createElement\s*\(\s*(['"`])canvas\1\s*\)/.test(code)) {
    addOnce('Canvas elements must be created with ctx.createCanvas2D() or ctx.createCanvas().');
  }
  if (/document\s*\.\s*(?:body|documentElement)\s*\.\s*(?:appendChild|insertBefore|replaceChild)\s*\(/.test(code) ||
      /document\s*\.\s*(?:body|documentElement)\s*\.\s*(?:innerHTML|outerHTML)\s*=/.test(code)) {
    addOnce('Bits must mount UI under ctx.createRoot(), ctx.createCanvas2D(), or ctx.createCanvas(), not document.body/documentElement.');
  }
  if (/document\s*\.\s*createElement\s*\(\s*(['"`])script\1\s*\)/.test(code) ||
      /document\s*\.\s*head\s*\.\s*(?:appendChild|insertBefore|replaceChild)\s*\(/.test(code)) {
    addOnce('External scripts must be loaded with ctx.loadScript().');
  }
  if (/(?:^|[^\w$])(?:window\s*\.\s*)?requestAnimationFrame\s*\(/m.test(code)) {
    addOnce('Animation loops must use ctx.raf().');
  }
  if (/(?:window|document)\s*\.\s*addEventListener\s*\(/.test(code)) {
    addOnce('Global event listeners must use ctx.listen() so they are cleaned up.');
  }

  return errors;
}

function validateSourceMetaLiterals(source) {
  const errors = [];
  const rawPermissions = sourceArrayLiteral(source, 'permissions');
  const badPermissions = invalidStrings(rawPermissions, permission => ALLOWED_PERMISSIONS.has(permission));
  if (badPermissions.length) errors.push(`Unsupported permissions in source meta: ${badPermissions.join(', ')}.`);

  const rawTags = sourceArrayLiteral(source, 'tags');
  const badTags = invalidStrings(rawTags, tag => TAG_RE.test(String(tag).toLowerCase()));
  if (badTags.length) errors.push(`Invalid tags in source meta: ${badTags.join(', ')}.`);
  return errors;
}

function validatePermissionUse(source, manifest) {
  const code = stripJsComments(source);
  const permissions = new Set(manifest.permissions);
  const errors = [];
  const checks = [
    {
      permission: 'audio',
      label: 'Audio APIs',
      regex: /\b(AudioContext|webkitAudioContext)\b|(?:ctx|\w+)\.audio\.|(?:ctx|\w+)\.assets\.audio\s*\(|new\s+Audio\s*\(/,
    },
    {
      permission: 'camera',
      label: 'Camera APIs',
      regex: /(?:ctx|\w+)\.camera\.|getUserMedia\s*\(/,
    },
    {
      permission: 'haptics',
      label: 'Haptics',
      regex: /(?:ctx|\w+)\.platform\.haptic\s*\(|navigator\.vibrate\s*\(/,
    },
    {
      permission: 'microphone',
      label: 'Microphone APIs',
      regex: /(?:ctx|\w+)\.microphone\.|getUserMedia\s*\(/,
    },
    {
      permission: 'motion',
      label: 'Motion APIs',
      regex: /(?:ctx|\w+)\.motion\.|devicemotion|deviceorientation|DeviceMotionEvent|DeviceOrientationEvent/,
    },
    {
      permission: 'storage',
      label: 'Storage APIs',
      regex: /(?:ctx|\w+)\.storage\.|\blocalStorage\b|\bsessionStorage\b/,
    },
    {
      permission: 'networkFetch',
      label: 'Network APIs',
      regex: /(?:ctx|\w+)\.fetch\s*\(|\bfetch\s*\(|(?:ctx|\w+)\.loadScript\s*\(|XMLHttpRequest|new\s+WebSocket\s*\(|new\s+Worker\s*\(|new\s+SharedWorker\s*\(|new\s+EventSource\s*\(|sendBeacon\s*\(/,
    },
  ];

  checks.forEach(check => {
    if (check.regex.test(code) && !permissions.has(check.permission)) {
      errors.push(`${check.label} require permissions: ['${check.permission}'].`);
    }
  });

  const urls = extractNetworkUrls(source);
  if (urls.length && !permissions.has('networkFetch')) {
    errors.push(`External URLs require permissions: ['networkFetch']. Found: ${urls.slice(0, 3).join(', ')}.`);
  }

  urls.forEach(rawUrl => {
    if (!isAllowedCdnUrl(rawUrl)) errors.push(`Network URL must use an approved CDN host: ${rawUrl}`);
  });

  return errors;
}

function assertSourcePackageContract(source, { manifestInput = {}, requireTitle = false, allowAssets = false } = {}) {
  const errors = [];

  if (!hasRuntimeGlobal(source)) errors.push('Source must assign window.plethoraBit at the top level.');
  errors.push(...validateSourceMetaLiterals(source));

  const fallback = manifestFromSource(source, manifestInput);
  const validation = validateBitManifest(manifestInput, { fallback, requireTitle });
  errors.push(...validation.errors);

  if (!allowAssets && validation.manifest.assets.length) {
    errors.push('Raw JavaScript uploads cannot declare assets; upload a package zip with assets/.');
  }

  errors.push(...validatePermissionUse(source, validation.manifest));
  errors.push(...validateSurfaceOwnership(source));

  const packageBytes = canonicalPackageByteLength(source, validation.manifest);
  if (packageBytes > BIT_MAX_PACKAGE_BYTES) errors.push(packageLimitError(packageBytes));

  if (errors.length) throw new Error(`Bit contract violation:\n- ${errors.join('\n- ')}`);
  return validation.manifest;
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return `sha256:${hash.digest('hex')}`;
}

function mimeForPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimes = {
    '.avif': 'image/avif',
    '.gif': 'image/gif',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.json': 'application/json',
    '.m4a': 'audio/mp4',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain',
    '.wav': 'audio/wav',
    '.webp': 'image/webp',
  };
  return mimes[ext] || 'application/octet-stream';
}

function walkFiles(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  fs.readdirSync(root, { withFileTypes: true }).forEach(entry => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(fullPath));
    else if (entry.isFile()) out.push(fullPath);
  });
  return out;
}

function relativeAssetPath(assetsRoot, filePath) {
  return path.relative(assetsRoot, filePath).replace(/\\/g, '/');
}

function buildAssetDescriptor(packageDir, value) {
  const asset = normalizeBitAssetDescriptor(value);
  if (!asset) return null;
  const fullPath = path.join(packageDir, 'assets', asset.path);
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    return { asset, missing: true };
  }
  return {
    asset: {
      path: asset.path,
      mime: asset.mime || mimeForPath(fullPath),
      size: fs.statSync(fullPath).size,
      sha256: asset.sha256 || sha256File(fullPath),
      ...(asset.role ? { role: asset.role } : {}),
    },
    missing: false,
  };
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function checkPackageDirectory(packageDir, { writeManifest = false } = {}) {
  const absDir = path.resolve(packageDir);
  const manifestPath = fs.existsSync(path.join(absDir, 'plethora.json'))
    ? path.join(absDir, 'plethora.json')
    : path.join(absDir, 'manifest.json');
  const rawManifest = readJsonIfExists(manifestPath) || {};
  const entry = normalizeBitEntry(rawManifest.entry);
  const entryPath = path.join(absDir, entry);
  if (!fs.existsSync(entryPath)) throw new Error(`Entry file "${entry}" not found in ${absDir}`);

  const source = fs.readFileSync(entryPath, 'utf8');
  const assetsRoot = path.join(absDir, 'assets');
  const discoveredAssets = walkFiles(assetsRoot).map(filePath => ({ path: relativeAssetPath(assetsRoot, filePath) }));
  const listedAssets = Array.isArray(rawManifest.assets) && rawManifest.assets.length ? rawManifest.assets : discoveredAssets;

  const assetErrors = [];
  const descriptors = listedAssets.map(value => {
    const built = buildAssetDescriptor(absDir, value);
    if (!built || built.missing) {
      const assetPath = built?.asset?.path || rawAssetPath(value) || String(value);
      assetErrors.push(`Asset "${assetPath}" listed in manifest but not found under assets/.`);
      return null;
    }
    return built.asset;
  }).filter(Boolean);

  const manifestInput = { ...rawManifest, entry, assets: descriptors };
  const manifest = assertSourcePackageContract(source, {
    manifestInput,
    requireTitle: true,
    allowAssets: true,
  });

  if (assetErrors.length) throw new Error(`Bit contract violation:\n- ${assetErrors.join('\n- ')}`);

  const packageFiles = [entryPath, ...(fs.existsSync(manifestPath) ? [manifestPath] : []), ...walkFiles(assetsRoot)];
  const extractedBytes = packageFiles.reduce((total, filePath) => total + fs.statSync(filePath).size, 0);
  if (extractedBytes > BIT_MAX_PACKAGE_BYTES) throw new Error(packageLimitError(extractedBytes));

  if (writeManifest) fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    manifest,
    manifestPath,
    entryPath,
    packageBytes: canonicalPackageByteLength(source, manifest),
    extractedBytes,
    assetCount: manifest.assets.length,
  };
}

module.exports = {
  BIT_ALLOWED_NETWORK_HOSTS,
  BIT_CONTRACT_SPEC,
  BIT_MAX_PACKAGE_BYTES,
  BIT_PACKAGE_SCHEMA_VERSION,
  BIT_RUNTIME_VERSION,
  assertSourcePackageContract,
  byteLength,
  canonicalPackageByteLength,
  checkPackageDirectory,
  cleanString,
  extractBitSourceMeta,
  extractNetworkUrls,
  formatBytes,
  isAllowedCdnUrl,
  manifestFromSource,
  normalizeBitAssets,
  normalizeBitEntry,
  normalizeBitManifest,
  normalizeBitPermissions,
  normalizeBitTags,
  packageLimitError,
  validateBitManifest,
  validateSurfaceOwnership,
};
