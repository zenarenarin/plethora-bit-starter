// Ammo.js Diagnostic Bit
// Runs a series of checks and displays results on screen

window.scrollerApp = {
  meta: {
    title: 'Ammo Diagnostic',
    author: 'plethora',
    description: 'Tests what is blocking Ammo.js physics.',
    tags: ['game'],
  },

  _root: null,

  init(container) {
    container.style.cssText = 'position:relative;background:#050510;width:100%;height:100%;overflow-y:auto;';

    const root = document.createElement('div');
    root.style.cssText = 'padding:24px;font-family:monospace;font-size:14px;color:#cdf;';
    container.appendChild(root);
    this._root = root;

    this._log('=== Ammo.js Diagnostic ===', '#fff');
    this._log('');

    // 1. WebAssembly
    const hasWasm = typeof WebAssembly !== 'undefined';
    this._log(`1. WebAssembly: ${hasWasm ? '✅ available' : '❌ NOT available'}`, hasWasm ? '#4f4' : '#f44');

    // 2. eval
    let evalOk = false;
    try { evalOk = eval('1+1') === 2; } catch(e) { /* blocked */ }
    this._log(`2. eval(): ${evalOk ? '✅ works' : '❌ BLOCKED'}`, evalOk ? '#4f4' : '#f44');

    // 3. Script loading from CDN
    this._log('');
    this._log('3. Testing CDN script loading...', '#fa0');

    const urls = [
      'https://cdn.jsdelivr.net/npm/ammo.js@0.0.10/ammo.js',
      'https://cdn.jsdelivr.net/npm/ammo.js/ammo.js',
      'https://unpkg.com/ammo.js@0.0.10/ammo.js',
    ];

    this._testUrls(urls, 0, () => {
      // 4. cannon-es as fallback
      this._log('');
      this._log('4. Testing cannon-es (pure JS alternative)...', '#fa0');
      this._testScript(
        'https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js',
        'cannon-es',
        () => typeof CANNON !== 'undefined',
        () => {
          this._log('');
          this._log('=== Summary ===', '#fff');
          this._summarize(hasWasm, evalOk);
        }
      );
    });
  },

  _testUrls(urls, idx, done) {
    if (idx >= urls.length) { done(); return; }
    const url = urls[idx];
    const shortUrl = url.replace('https://cdn.jsdelivr.net/npm/', 'jsdelivr: ').replace('https://unpkg.com/', 'unpkg: ');
    this._testScript(url, shortUrl, null, () => this._testUrls(urls, idx + 1, done));
  },

  _testScript(url, label, checkFn, next) {
    const s = document.createElement('script');
    const t0 = Date.now();

    s.onload = () => {
      const elapsed = Date.now() - t0;
      this._log(`   ✅ LOADED: ${label} (${elapsed}ms)`, '#4f4');

      if (url.includes('ammo')) {
        // Try calling Ammo()
        try {
          if (typeof Ammo === 'undefined') {
            this._log(`   ⚠️  Ammo global not defined after load`, '#fa0');
            next();
            return;
          }
          this._log(`   Ammo type: ${typeof Ammo}`, '#adf');
          const result = Ammo();
          if (result && typeof result.then === 'function') {
            this._log(`   Ammo() returned Promise — waiting for init...`, '#fa0');
            const timer = setTimeout(() => {
              this._log(`   ❌ Promise timed out after 5s`, '#f44');
              next();
            }, 5000);
            result.then(A => {
              clearTimeout(timer);
              this._log(`   ✅ Ammo initialized! Keys: ${Object.keys(A).slice(0,5).join(', ')}...`, '#4f4');
              window._AmmoOk = true;
              next();
            }).catch(e => {
              clearTimeout(timer);
              this._log(`   ❌ Promise rejected: ${e}`, '#f44');
              next();
            });
          } else if (result) {
            this._log(`   ✅ Ammo() returned synchronously`, '#4f4');
            window.Ammo = result;
            window._AmmoOk = true;
            next();
          } else {
            this._log(`   ⚠️  Ammo() returned: ${result}`, '#fa0');
            next();
          }
        } catch(e) {
          this._log(`   ❌ Ammo() threw: ${e.message || e}`, '#f44');
          next();
        }
      } else if (checkFn) {
        const ok = checkFn();
        this._log(`   Check: ${ok ? '✅ passed' : '❌ failed'}`, ok ? '#4f4' : '#f44');
        next();
      } else {
        next();
      }
    };

    s.onerror = (e) => {
      this._log(`   ❌ FAILED: ${label}`, '#f44');
      next();
    };

    s.src = url;
    document.head.appendChild(s);
  },

  _summarize(hasWasm, evalOk) {
    if (window._AmmoOk) {
      this._log('✅ Ammo.js WORKS — physics games should work!', '#4f4');
      this._log('Check which URL succeeded above and use that one.', '#adf');
    } else if (!evalOk) {
      this._log('❌ eval() is BLOCKED by CSP.', '#f44');
      this._log('➜ Solution: Use cannon-es instead of Ammo.js', '#fa0');
      this._log('  cannon-es is pure JS with no eval() calls.', '#adf');
    } else if (!hasWasm) {
      this._log('❌ WebAssembly not available.', '#f44');
      this._log('➜ Use ammo.js asm.js build (no wasm).', '#fa0');
    } else {
      this._log('❌ Ammo.js failed to initialize.', '#f44');
      this._log('➜ Try cannon-es — it loaded successfully above.', '#fa0');
    }
  },

  _log(msg, color) {
    const line = document.createElement('div');
    line.style.cssText = `color:${color || '#adf'};margin-bottom:4px;white-space:pre-wrap;`;
    line.textContent = msg;
    this._root.appendChild(line);
  },

  destroy() {
    this._root = null;
  },
};
