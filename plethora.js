#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const SUPABASE_URL  = 'https://ggjhoskhfsljxzeopaax.supabase.co';
const ANON_KEY      = 'sb_publishable_29LJ7kpAW28Ubp7mg22DnA_HKbbLopH';
const CONFIG_PATH   = path.join(os.homedir(), '.plethora', 'config.json');

// ── Config helpers ──────────────────────────────────────────────────────────

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
  catch { return null; }
}

function writeConfig(data) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
}

// ── Supabase REST helpers ────────────────────────────────────────────────────

async function sbAuth(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  return res.json();
}

async function sbInsert(table, row, accessToken) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || JSON.stringify(data));
  return Array.isArray(data) ? data[0] : data;
}

async function sbUpdate(table, id, row, accessToken) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || JSON.stringify(data));
  return Array.isArray(data) ? data[0] : data;
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

// ── Prompt helper ────────────────────────────────────────────────────────────

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

// ── Commands ─────────────────────────────────────────────────────────────────

async function cmdLogin() {
  const email    = await prompt('Email: ');
  const password = await prompt('Password: ', { hidden: true });

  process.stdout.write('Signing in…\n');
  const result = await sbAuth(email.trim(), password);

  if (result.error || !result.access_token) {
    console.error('Login failed:', result.error_description || result.error || 'unknown error');
    process.exit(1);
  }

  writeConfig({
    access_token:  result.access_token,
    refresh_token: result.refresh_token,
    user_id:       result.user.id,
    email:         result.user.email,
  });

  console.log(`✓ Logged in as ${result.user.email}`);
}

async function cmdLogout() {
  try { fs.unlinkSync(CONFIG_PATH); } catch {}
  console.log('✓ Logged out');
}

async function cmdUpload(args) {
  const cfg = readConfig();
  if (!cfg) { console.error('Not logged in. Run: plethora login'); process.exit(1); }

  // Parse flags
  let filePath = null;
  let title = null, description = null, tags = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--title')       { title       = args[++i]; }
    else if (args[i] === '--desc')   { description = args[++i]; }
    else if (args[i] === '--tags')   { tags        = args[++i].split(',').map(t => t.trim()); }
    else if (!filePath)              { filePath    = args[i]; }
  }

  if (!filePath) {
    console.error('Usage: plethora upload <file.js|file.zip> [--title "..."] [--desc "..."] [--tags game,design]');
    process.exit(1);
  }

  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  const isZip = absPath.endsWith('.zip');

  if (isZip) {
    // ZIP upload — multipart/form-data
    if (!title) {
      console.error('ZIP uploads require --title "My Bit"');
      process.exit(1);
    }
    console.log(`Uploading ZIP "${title}" as draft…`);

    const { FormData, Blob } = await import('node:buffer').catch(() => ({}));
    // Node 18+ has FormData natively; fall back to a simple multipart builder
    const zipBytes = fs.readFileSync(absPath);

    // Build multipart body manually for maximum Node version compatibility
    const boundary = `----PlethoraBoundary${Date.now()}`;
    const parts = [];
    const addField = (name, value) => {
      parts.push(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}`
      );
    };
    addField('title', title);
    if (description) addField('description', description);
    if (tags.length)  addField('tags', tags.join(','));

    const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${path.basename(absPath)}"\r\nContent-Type: application/zip\r\n\r\n`;
    const footer = `\r\n--${boundary}--`;

    const headerBuf  = Buffer.from(parts.join('\r\n') + '\r\n' + header);
    const footerBuf  = Buffer.from(footer);
    const body       = Buffer.concat([headerBuf, zipBytes, footerBuf]);

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/upload-bit`, {
        method: 'POST',
        headers: {
          'Content-Type':  `multipart/form-data; boundary=${boundary}`,
          'Authorization': `Bearer ${cfg.access_token}`,
        },
        body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || JSON.stringify(data));
      console.log(`✓ ZIP uploaded! bit id: ${data.bit.id}`);
      console.log('  Open Plethora → Your Profile → Uploads to preview it.');
    } catch (e) {
      console.error('Upload failed:', e.message);
      process.exit(1);
    }
    return;
  }

  // JS upload — JSON body
  const source = fs.readFileSync(absPath, 'utf8');

  if (!source.includes('plethoraBit') && !source.includes('scrollerApp')) {
    console.error('Error: file does not define window.plethoraBit (or legacy window.scrollerApp)');
    process.exit(1);
  }

  // Extract meta from source if not supplied via flags
  const metaTitle = title || (source.match(/title:\s*['"]([^'"]+)['"]/) || [])[1] || path.basename(filePath, '.js');
  const metaDesc  = description || (source.match(/description:\s*['"]([^'"]+)['"]/) || [])[1] || '';
  const metaTags  = tags.length ? tags : ((source.match(/tags:\s*\[([^\]]+)\]/) || [])[1] || '')
    .split(',').map(t => t.replace(/['" ]/g, '')).filter(Boolean);

  console.log(`Uploading "${metaTitle}" as draft…`);

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/upload-bit`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${cfg.access_token}`,
      },
      body: JSON.stringify({ title: metaTitle, description: metaDesc, tags: metaTags, source }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || JSON.stringify(data));
    const verb = data.action === 'updated' ? 'Draft updated' : 'Draft uploaded';
    console.log(`✓ ${verb}! bit id: ${data.bit.id}`);
    console.log('  Open Plethora → Your Profile → Uploads to preview it.');
  } catch (e) {
    console.error('Upload failed:', e.message);
    process.exit(1);
  }
}

async function cmdList() {
  const cfg = readConfig();
  if (!cfg) { console.error('Not logged in. Run: plethora login'); process.exit(1); }

  try {
    const bits = await sbSelect('bits', {
      'author_id': `eq.${cfg.user_id}`,
      'select':    'id,title,published,created_at',
      'order':     'created_at.desc',
    }, cfg.access_token);

    if (!bits.length) { console.log('No bits yet.'); return; }

    const pad = n => String(n).padStart(2);
    bits.forEach((b, i) => {
      const status = b.published ? '✓ live ' : '◌ draft';
      console.log(`${pad(i + 1)}.  [${status}]  ${b.title}  (${b.id.slice(0, 8)}…)`);
    });
  } catch (e) {
    console.error('Failed:', e.message);
    process.exit(1);
  }
}

async function cmdPublish(args) {
  const cfg = readConfig();
  if (!cfg) { console.error('Not logged in. Run: plethora login'); process.exit(1); }

  const id = args[0];
  if (!id) {
    console.error('Usage: plethora publish <bit-id>');
    process.exit(1);
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/upload-bit`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${cfg.access_token}`,
      },
      body: JSON.stringify({ action: 'publish', id }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || JSON.stringify(data));
    console.log(`✓ Published! bit ${id}`);
  } catch (e) {
    console.error('Failed:', e.message);
    process.exit(1);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

const [,, cmd, ...rest] = process.argv;

const HELP = `
Plethora CLI — upload bits from the command line

Commands:
  plethora login                              Sign in with email + password
  plethora logout                             Clear saved credentials
  plethora upload <file.js|file.zip> [flags]  Upload a bit as a draft
    --title "My Bit"                          (required for .zip uploads)
    --desc  "A short description"
    --tags  game,design
  plethora list                               List your bits
  plethora publish <bit-id>                   Publish a draft

Workflow — single JS file:
  1. npm run build
  2. plethora upload dist/bit.js --title "My Bit" --tags game
  3. Open Plethora app → profile → Uploads → tap draft to preview
  4. plethora publish <id>    (or tap Publish in the app)

Workflow — ZIP with assets:
  1. Create: main.js + assets/player.png + assets/tap.mp3 + manifest.json
  2. zip my-bit.zip main.js manifest.json assets/
  3. plethora upload my-bit.zip --title "My Bit"
`;

(async () => {
  try {
    if (!cmd || cmd === 'help' || cmd === '--help') { console.log(HELP); }
    else if (cmd === 'login')   { await cmdLogin(); }
    else if (cmd === 'logout')  { await cmdLogout(); }
    else if (cmd === 'upload')  { await cmdUpload(rest); }
    else if (cmd === 'list')    { await cmdList(); }
    else if (cmd === 'publish') { await cmdPublish(rest); }
    else { console.error(`Unknown command: ${cmd}\n`); console.log(HELP); process.exit(1); }
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
