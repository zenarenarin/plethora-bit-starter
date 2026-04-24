// PlayCanvas + Ammo.js Step-by-Step Diagnostic

window.scrollerApp = {
  meta: {
    title: 'PC+Ammo Diagnostic',
    author: 'plethora',
    description: 'Tests PlayCanvas + Ammo.js integration step by step.',
    tags: ['game'],
  },

  _root: null,

  init(container) {
    container.style.cssText = 'position:relative;background:#050510;width:100%;height:100%;overflow-y:auto;';
    const root = document.createElement('div');
    root.style.cssText = 'padding:20px;font-family:monospace;font-size:13px;color:#cdf;';
    container.appendChild(root);
    this._root = root;

    this._log('=== PlayCanvas + Ammo Diagnostic ===', '#fff');
    this._log('');

    // Step 1: Load PlayCanvas
    this._log('1. Loading PlayCanvas...', '#fa0');
    const pc_script = document.createElement('script');
    pc_script.src = 'https://code.playcanvas.com/playcanvas-stable.min.js';
    pc_script.onload = () => {
      this._log('   ✅ PlayCanvas loaded. typeof pc = ' + typeof pc, '#4f4');
      this._log('   pc.Application exists: ' + (typeof pc.Application !== 'undefined'), '#adf');
      this._step2();
    };
    pc_script.onerror = () => this._log('   ❌ PlayCanvas failed to load', '#f44');
    document.head.appendChild(pc_script);
  },

  _step2() {
    this._log('');
    this._log('2. Loading Ammo.js + wrapping as factory...', '#fa0');
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/ammo.js@0.0.10/ammo.js';
    s.onload = () => {
      this._log('   ✅ ammo.js loaded. typeof Ammo = ' + typeof window.Ammo, '#4f4');

      if (typeof window.Ammo === 'object') {
        // Self-init build — wrap as factory so PlayCanvas can call Ammo().then(ready)
        const lib = window.Ammo;
        window.Ammo = Object.assign(function() { return Promise.resolve(lib); }, lib);
        this._log('   ✅ Wrapped as factory. typeof Ammo now = ' + typeof window.Ammo, '#4f4');
        this._log('   btVector3 still accessible: ' + (typeof window.Ammo.btVector3 !== 'undefined'), '#adf');
      } else {
        this._log('   Ammo already a function — no wrap needed', '#adf');
      }

      this._step3();
    };
    s.onerror = () => this._log('   ❌ Ammo.js failed to load', '#f44');
    document.head.appendChild(s);
  },

  _step3() {
    this._log('');
    this._log('3. Creating pc.Application (off-screen canvas)...', '#fa0');
    try {
      const c = document.createElement('canvas');
      c.width = 100; c.height = 100;
      const app = new pc.Application(c, {});
      this._log('   ✅ pc.Application created', '#4f4');
      this._log('   app.systems keys: ' + Object.keys(app.systems).join(', '), '#adf');

      const hasRb = !!(app.systems && app.systems.rigidbody);
      this._log('   app.systems.rigidbody exists: ' + hasRb, hasRb ? '#4f4' : '#f44');

      if (hasRb) {
        try {
          app.systems.rigidbody.gravity.set(0, -9.8, 0);
          this._log('   ✅ gravity.set() worked', '#4f4');
        } catch(e) {
          this._log('   ❌ gravity.set() threw: ' + e.message, '#f44');
        }
      }

      this._step4(app);
    } catch(e) {
      this._log('   ❌ pc.Application threw: ' + e.message, '#f44');
      this._log('   Stack: ' + (e.stack || '').split('\n')[1], '#f66');
    }
  },

  _step4(app) {
    this._log('');
    this._log('4. start() first, then setTimeout(0) to add physics entities', '#fa0');
    try {
      app.start();
      this._log('   ✅ app.start() called', '#4f4');
      this._log('   Waiting one tick for PlayCanvas Ammo.then(ready)...', '#adf');

      setTimeout(() => {
        this._log('   — tick fired —', '#adf');
        try {
          const e = new pc.Entity('testA');
          e.addComponent('model', { type: 'box' });
          e.setPosition(0, 5, 0);
          app.root.addChild(e);
          this._log('   ✅ addChild done', '#4f4');
          e.addComponent('rigidbody', { type: pc.BODYTYPE_DYNAMIC, mass: 1 });
          this._log('   ✅ rigidbody added', '#4f4');
          e.addComponent('collision', { type: 'box', halfExtents: new pc.Vec3(0.5, 0.5, 0.5) });
          this._log('   ✅ collision added — no crash!', '#4f4');
        } catch(err) {
          this._log('   ❌ threw: ' + err.message, '#f44');
          this._log('   ' + (err.stack || '').split('\n')[1], '#f66');
        }
      }, 0);

      setTimeout(() => {
        try {
          const testEnt = app.root.findByName('testA');
          if (testEnt) {
            const y = testEnt.getPosition().y.toFixed(3);
            this._log('   y at 800ms: ' + y, '#adf');
            const fell = parseFloat(y) < 4.9;
            this._log('   Falling: ' + (fell ? '✅ YES — physics works!' : '❌ NO — physics inactive'), fell ? '#4f4' : '#f44');
          } else {
            this._log('   testA entity not found', '#f44');
          }
        } catch(err) {
          this._log('   ❌ ' + err.message, '#f44');
        }
        app.destroy();
        this._summary();
      }, 800);

    } catch(err) {
      this._log('   ❌ threw: ' + err.message, '#f44');
      this._log('   ' + (err.stack || '').split('\n')[1], '#f66');
      this._summary();
    }
  },

  _summary() {
    this._log('');
    this._log('=== Done ===', '#fff');
  },

  _log(msg, color) {
    const d = document.createElement('div');
    d.style.cssText = `color:${color||'#adf'};margin-bottom:3px;white-space:pre-wrap;`;
    d.textContent = msg;
    this._root.appendChild(d);
  },

  destroy() { this._root = null; },
};
