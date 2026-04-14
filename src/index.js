/**
 * Plethora Bit Starter
 * --------------------
 * 1. Edit the meta object below.
 * 2. Build your experience in init(container) — it's a full-screen div.
 * 3. Clean up in destroy() — cancel timers, remove listeners.
 * 4. Run:  npm run build
 * 5. Upload dist/bit.js at https://plethora-dashboard.vercel.app
 */

window.scrollerApp = {
  meta: {
    title: 'My Bit',
    author: 'YourUsername',
    description: 'A one-line description of what this bit does.',
    tags: ['creative'],   // e.g. 'game', 'education', 'design', 'stories', 'creative'
  },

  // Called when the bit scrolls into view.
  // container: a full-screen <div> you own — add any DOM/canvas/SVG you like.
  init(container) {
    const stage = document.createElement('div');
    stage.style.cssText = [
      'width:100%; height:100%;',
      'display:flex; flex-direction:column;',
      'align-items:center; justify-content:center;',
      'background:#111;',
    ].join('');

    const title = document.createElement('p');
    title.textContent = this.meta.title;
    title.style.cssText = 'color:#fff; font-size:28px; font-weight:700; margin-bottom:8px;';

    const sub = document.createElement('p');
    sub.textContent = 'Edit src/index.js to get started';
    sub.style.cssText = 'color:#888; font-size:16px;';

    stage.appendChild(title);
    stage.appendChild(sub);
    container.appendChild(stage);

    // Example: keep a reference so destroy() can clean up
    this._stage = stage;
  },

  // Called when the bit scrolls off screen.
  // Cancel any requestAnimationFrame loops, clear intervals, remove event listeners.
  destroy() {
    this._stage = null;
  },
};
