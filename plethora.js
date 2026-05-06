#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  BIT_ALLOWED_NETWORK_HOSTS,
  BIT_MAX_PACKAGE_BYTES,
  assertSourcePackageContract,
  canonicalPackageByteLength,
  checkPackageDirectory,
  extractBitSourceMeta,
  formatBytes,
  packageLimitError,
} = require('./lib/bit-contract');

const SUPABASE_URL = 'https://ggjhoskhfsljxzeopaax.supabase.co';
const ANON_KEY = 'sb_publishable_29LJ7kpAW28Ubp7mg22DnA_HKbbLopH';
const CONFIG_PATH = path.join(os.homedir(), '.plethora', 'config.json');

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function writeConfig(data) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
}

async function sbAuth(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  return res.json();
}

async function sbSendEmailCode(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({
      email,
      create_user: true,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.msg || data.error || JSON.stringify(data));
  return data;
}

async function sbVerifyEmailCode(email, token) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({
      email,
      token,
      type: 'email',
    }),
  });
  return res.json();
}

async function sbVerifyEmailTokenHash(tokenHash, type = 'email') {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({
      token_hash: tokenHash,
      type,
    }),
  });
  return res.json();
}

async function sbRefresh(refreshToken) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  return res.json();
}

async function sbSelect(table, filter, accessToken) {
  const params = new URLSearchParams(filter);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || JSON.stringify(data));
  return data;
}

function prompt(question, { hidden = false } = {}) {
  return new Promise(resolve => {
    process.stdout.write(question);
    if (hidden && process.stdin.isTTY) process.stdin.setRawMode(true);

    let input = '';
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    if (hidden && process.stdin.isTTY) {
      process.stdin.on('data', function handler(ch) {
        if (ch === '\n' || ch === '\r' || ch === '\u0003') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', handler);
          process.stdout.write('\n');
          resolve(input);
        } else if (ch === '\u007f') {
          input = input.slice(0, -1);
        } else {
          input += ch;
        }
      });
    } else {
      process.stdin.once('data', data => {
        process.stdin.pause();
        resolve(data.toString().trim());
      });
    }
  });
}

function writeSession(result) {
  writeConfig({
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    user_id: result.user.id,
    email: result.user.email,
  });
}

function requireConfig() {
  const cfg = readConfig();
  if (!cfg) {
    console.error('Not logged in. Run: plethora login');
    process.exit(1);
  }
  return cfg;
}

async function requireFreshConfig() {
  const cfg = requireConfig();
  if (!cfg.refresh_token) return cfg;

  const refreshed = await sbRefresh(cfg.refresh_token);
  if (refreshed.error || !refreshed.access_token) {
    console.error('Saved login expired. Run: plethora login');
    process.exit(1);
  }

  writeSession(refreshed);
  return {
    ...cfg,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token,
    user_id: refreshed.user.id,
    email: refreshed.user.email,
  };
}

function parseUploadArgs(args) {
  let filePath = null;
  let title = null;
  let description = null;
  let tags = [];

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--title') title = args[++i];
    else if (args[i] === '--desc') description = args[++i];
    else if (args[i] === '--tags') tags = args[++i].split(',').map(tag => tag.trim()).filter(Boolean);
    else if (!filePath) filePath = args[i];
  }

  return { filePath, title, description, tags };
}

function assertByteLimit(label, bytes) {
  if (bytes > BIT_MAX_PACKAGE_BYTES) {
    throw new Error(`${label}: ${packageLimitError(bytes)}`);
  }
}

function parseEmailLoginInput(value) {
  const input = String(value || '').trim();
  if (!/^https?:\/\//i.test(input)) return { token: input };

  try {
    const url = new URL(input);
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
    const searchParams = url.searchParams;
    const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token') || searchParams.get('refresh_token');
    if (accessToken && refreshToken) {
      return {
        session: {
          access_token: accessToken,
          refresh_token: refreshToken,
          user: {
            id: hashParams.get('user_id') || searchParams.get('user_id') || null,
            email: null,
          },
        },
      };
    }

    const tokenHash = searchParams.get('token_hash') || searchParams.get('token');
    const type = searchParams.get('type') || 'email';
    if (tokenHash) return { tokenHash, type };
  } catch {}

  return { token: input };
}

async function cmdLogin() {
  const email = await prompt('Email: ');
  const password = await prompt('Password (leave blank for email code): ', { hidden: true });

  const trimmedEmail = email.trim();
  let result;

  if (password) {
    process.stdout.write('Signing in...\n');
    result = await sbAuth(trimmedEmail, password);
  } else {
    process.stdout.write('Sending email code...\n');
    await sbSendEmailCode(trimmedEmail);
    const input = await prompt('Email code or magic link: ');
    const parsed = parseEmailLoginInput(input);
    process.stdout.write('Verifying email login...\n');
    if (parsed.session) {
      result = parsed.session;
    } else if (parsed.tokenHash) {
      result = await sbVerifyEmailTokenHash(parsed.tokenHash, parsed.type);
    } else {
      result = await sbVerifyEmailCode(trimmedEmail, parsed.token);
    }
  }

  if (result.error || !result.access_token) {
    console.error('Login failed:', result.error_description || result.error || 'unknown error');
    process.exit(1);
  }

  if (!result.user.email || !result.user.id) {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${result.access_token}`,
      },
    });
    const user = await userRes.json();
    if (userRes.ok) result.user = user;
  }

  writeSession(result);

  console.log(`OK logged in as ${result.user.email}`);
}

async function cmdLogout() {
  try {
    fs.unlinkSync(CONFIG_PATH);
  } catch {}
  console.log('OK logged out');
}

async function cmdUpload(args) {
  const cfg = await requireFreshConfig();

  const { filePath, title, description, tags } = parseUploadArgs(args);
  if (!filePath) {
    console.error('Usage: plethora upload <file.js|file.zip> [--title "..."] [--desc "..."] [--tags game,design]');
    process.exit(1);
  }

  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  if (absPath.endsWith('.zip')) {
    if (!title) {
      console.error('ZIP uploads require --title "My Bit"');
      process.exit(1);
    }

    const zipBytes = fs.readFileSync(absPath);
    assertByteLimit('ZIP file', zipBytes.length);
    console.log(`Uploading ZIP "${title}" as draft... (${formatBytes(zipBytes.length)})`);

    const boundary = `----PlethoraBoundary${Date.now()}`;
    const parts = [];
    const addField = (name, value) => {
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}`);
    };
    addField('title', title);
    if (description) addField('description', description);
    if (tags.length) addField('tags', tags.join(','));

    const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${path.basename(absPath)}"\r\nContent-Type: application/zip\r\n\r\n`;
    const footer = `\r\n--${boundary}--`;
    const body = Buffer.concat([
      Buffer.from(`${parts.join('\r\n')}\r\n${header}`),
      zipBytes,
      Buffer.from(footer),
    ]);

    const res = await fetch(`${SUPABASE_URL}/functions/v1/upload-bit`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        Authorization: `Bearer ${cfg.access_token}`,
      },
      body,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || JSON.stringify(data));
    console.log(`OK ZIP uploaded. bit id: ${data.bit.id}`);
    console.log('Open Plethora -> Profile -> Uploads to preview it.');
    return;
  }

  const source = fs.readFileSync(absPath, 'utf8');
  const sourceMeta = extractBitSourceMeta(source);
  const manifestInput = {
    title: title || sourceMeta.title || path.basename(filePath, '.js'),
    description: description ?? sourceMeta.description ?? '',
    tags: tags.length ? tags : sourceMeta.tags,
  };
  const manifest = assertSourcePackageContract(source, {
    manifestInput,
    requireTitle: true,
  });
  const packageBytes = canonicalPackageByteLength(source, manifest);

  console.log(`Uploading "${manifest.title}" as draft... (${formatBytes(packageBytes)})`);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/upload-bit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.access_token}`,
    },
    body: JSON.stringify({
      title: manifest.title,
      description: manifest.description,
      tags: manifest.tags,
      source,
      manifest,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || JSON.stringify(data));
  const verb = data.action === 'updated' ? 'Draft updated' : 'Draft uploaded';
  console.log(`OK ${verb}. bit id: ${data.bit.id}`);
  console.log('Open Plethora -> Profile -> Uploads to preview it.');
}

async function cmdCheck(args) {
  const writeManifest = args.includes('--write-manifest');
  const targetArg = args.find(arg => !arg.startsWith('--')) || (fs.existsSync('dist/bit.js') ? 'dist/bit.js' : 'src/index.js');
  const absPath = path.resolve(targetArg);
  if (!fs.existsSync(absPath)) throw new Error(`Not found: ${absPath}`);

  const stat = fs.statSync(absPath);
  if (stat.isDirectory()) {
    const result = checkPackageDirectory(absPath, { writeManifest });
    console.log(`OK package directory: ${absPath}`);
    console.log(`  assets: ${result.assetCount}`);
    console.log(`  extracted size: ${formatBytes(result.extractedBytes)} / ${formatBytes(BIT_MAX_PACKAGE_BYTES)}`);
    console.log(`  canonical package: ${formatBytes(result.packageBytes)} / ${formatBytes(BIT_MAX_PACKAGE_BYTES)}`);
    if (writeManifest) console.log(`  wrote ${result.manifestPath}`);
    return;
  }

  if (absPath.endsWith('.zip')) {
    assertByteLimit('ZIP file', stat.size);
    console.log(`OK zip: ${formatBytes(stat.size)} / ${formatBytes(BIT_MAX_PACKAGE_BYTES)}`);
    console.log('The upload function will also validate extracted size, manifest descriptors, and package hash.');
    return;
  }

  if (!absPath.endsWith('.js')) throw new Error('Check target must be a .js file, .zip file, or package directory.');
  const source = fs.readFileSync(absPath, 'utf8');
  const meta = extractBitSourceMeta(source);
  const manifest = assertSourcePackageContract(source, {
    manifestInput: {
      title: meta.title || path.basename(absPath, '.js'),
      description: meta.description,
      tags: meta.tags,
    },
    requireTitle: true,
  });
  const packageBytes = canonicalPackageByteLength(source, manifest);
  console.log(`OK source: ${absPath}`);
  console.log(`  permissions: ${manifest.permissions.length ? manifest.permissions.join(', ') : '(none)'}`);
  console.log(`  canonical package: ${formatBytes(packageBytes)} / ${formatBytes(BIT_MAX_PACKAGE_BYTES)}`);
  console.log(`  CDN allowlist: ${BIT_ALLOWED_NETWORK_HOSTS.join(', ')}`);
}

async function cmdList() {
  const cfg = await requireFreshConfig();

  const bits = await sbSelect('bits', {
    author_id: `eq.${cfg.user_id}`,
    select: 'id,title,published,created_at',
    order: 'created_at.desc',
  }, cfg.access_token);

  if (!bits.length) {
    console.log('No bits yet.');
    return;
  }

  const pad = n => String(n).padStart(2);
  bits.forEach((bit, index) => {
    const status = bit.published ? 'live ' : 'draft';
    console.log(`${pad(index + 1)}. [${status}] ${bit.title} (${bit.id.slice(0, 8)}...)`);
  });
}

async function cmdPublish(args) {
  const cfg = await requireFreshConfig();

  const id = args[0];
  if (!id) {
    console.error('Usage: plethora publish <bit-id>');
    process.exit(1);
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/upload-bit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.access_token}`,
    },
    body: JSON.stringify({ action: 'publish', id }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || JSON.stringify(data));
  console.log(`OK published bit ${id}`);
}

const [, , cmd, ...rest] = process.argv;

const HELP = `
Plethora CLI - upload bits from the command line

Commands:
  plethora login                              Sign in with email + password or email code
  plethora logout                             Clear saved credentials
  plethora check [file.js|file.zip|dir]        Validate contract, size, permissions, CDN URLs
    --write-manifest                          For package dirs, write enriched asset descriptors
  plethora upload <file.js|file.zip> [flags]  Upload a bit as a draft
    --title "My Bit"                          Required for .zip uploads
    --desc  "A short description"
    --tags  game,design
  plethora list                               List your bits
  plethora publish <bit-id>                   Publish a draft

Contract:
  - package limit: ${formatBytes(BIT_MAX_PACKAGE_BYTES)}
  - permissions are enforced: audio, camera, haptics, microphone, motion, networkFetch, storage
  - networkFetch may only reach approved CDN hosts:
    ${BIT_ALLOWED_NETWORK_HOSTS.join(', ')}
  - published packages are immutable by source + manifest + assets + runtime hash

Workflow - single JS file:
  1. npm run build
  2. plethora check dist/bit.js
  3. plethora login        (press Enter at password prompt to use an email code)
  4. plethora upload dist/bit.js --title "My Bit" --tags game
  5. Open Plethora app -> profile -> Uploads -> tap draft to preview
  6. plethora publish <id>    (or tap Publish in the app)

Workflow - ZIP with assets:
  1. Create: main.js + manifest.json + assets/
  2. plethora check ./my-package --write-manifest
  3. cd my-package && zip ../my-bit.zip main.js manifest.json assets/
  4. plethora upload my-bit.zip --title "My Bit"
`;

(async () => {
  try {
    if (!cmd || cmd === 'help' || cmd === '--help') console.log(HELP);
    else if (cmd === 'login') await cmdLogin();
    else if (cmd === 'logout') await cmdLogout();
    else if (cmd === 'check') await cmdCheck(rest);
    else if (cmd === 'upload') await cmdUpload(rest);
    else if (cmd === 'list') await cmdList();
    else if (cmd === 'publish') await cmdPublish(rest);
    else {
      console.error(`Unknown command: ${cmd}\n`);
      console.log(HELP);
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error.message || String(error));
    process.exit(1);
  }
})();
