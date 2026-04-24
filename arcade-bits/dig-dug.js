// Dig Dug - Arcade Classic
window.scrollerApp = function() {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 500;
  canvas.style.border = '3px solid #FF6600';
  canvas.style.backgroundColor = '#8B4513';
  canvas.style.display = 'block';
  canvas.style.margin = '10px auto';
  document.body.appendChild(canvas);
  
  const ctx = canvas.getContext('2d');
  
  let player = { x: 190, y: 450, w: 16, h: 16, speed: 2 };
  let pump = { x: -100, y: -100, active: false, target: null };
  let enemies = [];
  let rocks = [];
  let dug = [];
  let particles = [];
  let score = 0;
  let gameOver = false;
  let level = 1;
  
  const GRID_SIZE = 20;
  const COLS = 20;
  const ROWS = 20;
  
  function createLevel() {
    enemies = [];
    rocks = [];
    dug = Array(ROWS).fill(0).map(() => Array(COLS).fill(0));
    
    // Create enemies
    for (let i = 0; i < 2 + level; i++) {
      enemies.push({
        x: Math.random() * (canvas.width - 20),
        y: Math.random() * 150 + 50,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        w: 16,
        h: 16,
        state: 'normal'
      });
    }
    
    // Create rocks
    for (let i = 0; i < 5 + level; i++) {
      rocks.push({
        x: Math.random() * (canvas.width - 20),
        y: Math.random() * (canvas.height - 200) + 50,
        w: 18,
        h: 18,
        state: 'solid'
      });
    }
  }
  
  createLevel();
  
  function drawTerrain() {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (dug[y][x] === 1) {
          ctx.fillStyle = '#000000';
          ctx.fillRect(x * GRID_SIZE, y * GRID_SIZE, GRID_SIZE, GRID_SIZE);
        } else if (dug[y][x] === 0) {
          ctx.fillStyle = '#A0522D';
          ctx.fillRect(x * GRID_SIZE, y * GRID_SIZE, GRID_SIZE, GRID_SIZE);
          ctx.strokeStyle = '#8B4513';
          ctx.lineWidth = 1;
          ctx.strokeRect(x * GRID_SIZE, y * GRID_SIZE, GRID_SIZE, GRID_SIZE);
        }
      }
    }
  }
  
  function drawPlayer() {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(player.x, player.y, player.w, player.h);
    ctx.fillStyle = '#FFFF00';
    ctx.fillRect(player.x + 4, player.y + 2, 4, 4);
    ctx.fillRect(player.x + 8, player.y + 2, 4, 4);
  }
  
  function drawEnemies() {
    enemies.forEach(e => {
      ctx.fillStyle = e.state === 'inflating' ? '#FF0000' : '#FF00FF';
      ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.fillStyle = '#000000';
      ctx.fillRect(e.x + 4, e.y + 4, 3, 3);
      ctx.fillRect(e.x + 9, e.y + 4, 3, 3);
    });
  }
  
  function drawRocks() {
    rocks.forEach(r => {
      ctx.fillStyle = r.state === 'falling' ? '#FFD700' : '#8B4513';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = '#696969';
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    });
  }
  
  function drawPump() {
    if (pump.active) {
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(player.x + 8, player.y);
      ctx.lineTo(pump.x + 8, pump.y + 16);
      ctx.stroke();
    }
  }
  
  function drawParticles() {
    particles.forEach(p => {
      ctx.fillStyle = `rgba(255, 215, 0, ${p.life / p.maxLife})`;
      ctx.fillRect(p.x, p.y, 2, 2);
    });
  }
  
  function dig(x, y) {
    let gx = Math.floor(x / GRID_SIZE);
    let gy = Math.floor(y / GRID_SIZE);
    if (gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS) {
      dug[gy][gx] = 1;
    }
  }
  
  function update() {
    if (gameOver) return;
    
    // Dig around player
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        dig(player.x + dx * player.w, player.y + dy * player.h);
      }
    }
    
    // Move enemies
    enemies.forEach(e => {
      if (e.state === 'normal') {
        e.x += e.vx;
        e.y += e.vy;
        
        if (e.x < 0 || e.x + e.w > canvas.width) e.vx *= -1;
        if (e.y < 50 || e.y > canvas.height - 50) e.vy *= -1;
      } else if (e.state === 'inflating') {
        e.w += 1;
        e.h += 1;
        e.x -= 0.5;
        e.y -= 0.5;
        e.inflateTime--;
        if (e.inflateTime <= 0) {
          e.state = 'pop';
          explode(e.x, e.y);
          score += 500;
        }
      }
    });
    
    enemies = enemies.filter(e => e.state !== 'pop');
    
    // Move rocks
    rocks.forEach(r => {
      if (r.state === 'falling') {
        r.y += 3;
      }
      
      // Rock kills enemy
      enemies.forEach(e => {
        if (r.x < e.x + e.w && r.x + r.w > e.x &&
            r.y < e.y + e.h && r.y + r.h > e.y &&
            r.state === 'falling') {
          e.state = 'pop';
          r.state = 'resting';
          score += 500;
        }
      });
    });
    
    rocks = rocks.filter(r => r.y < canvas.height);
    
    // Pump enemies
    if (pump.active && pump.target) {
      let dist = Math.hypot(pump.target.x - player.x, pump.target.y - player.y);
      if (dist > 100) {
        pump.active = false;
      } else if (pump.target.state === 'normal') {
        pump.target.state = 'inflating';
        pump.target.inflateTime = 60;
      }
    }
    
    // Player-enemy collisions
    enemies.forEach(e => {
      if (e.state === 'normal' &&
          player.x < e.x + e.w && player.x + player.w > e.x &&
          player.y < e.y + e.h && player.y + player.h > e.y) {
        gameOver = true;
        explode(player.x, player.y);
      }
    });
    
    // Level complete
    if (enemies.length === 0) {
      level++;
      createLevel();
    }
    
    // Update particles
    particles = particles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      return p.life > 0;
    });
  }
  
  function explode(x, y) {
    for (let i = 0; i < 8; i++) {
      let angle = (i / 8) * Math.PI * 2;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * 2,
        vy: Math.sin(angle) * 2,
        life: 20,
        maxLife: 20
      });
    }
  }
  
  function draw() {
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    drawTerrain();
    drawRocks();
    drawEnemies();
    drawPlayer();
    drawPump();
    drawParticles();
    
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 16px "Courier New"';
    ctx.fillText('SCORE: ' + score, 10, 490);
    ctx.fillText('LEVEL: ' + level, 280, 490);
    
    if (gameOver) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#FF0000';
      ctx.font = 'bold 40px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', 200, 250);
    }
  }
  
  let keys = {};
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ') {
      e.preventDefault();
      let closest = null;
      let closestDist = Infinity;
      enemies.forEach(e => {
        let dist = Math.hypot(e.x - player.x, e.y - player.y);
        if (dist < closestDist && e.state === 'normal') {
          closestDist = dist;
          closest = e;
        }
      });
      if (closest) {
        pump.active = true;
        pump.target = closest;
        pump.x = closest.x;
        pump.y = closest.y;
      }
    }
    keys[e.key] = true;
  });
  document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
  });
  
  // Touch controls
  canvas.addEventListener('touchstart', (e) => {
    let closest = null;
    let closestDist = Infinity;
    enemies.forEach(e => {
      let dist = Math.hypot(e.x - player.x, e.y - player.y);
      if (dist < closestDist && e.state === 'normal') {
        closestDist = dist;
        closest = e;
      }
    });
    if (closest) {
      pump.active = true;
      pump.target = closest;
    }
  }, false);
  
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    let rect = canvas.getBoundingClientRect();
    let newX = e.touches[0].clientX - rect.left - player.w / 2;
    player.x = Math.max(0, Math.min(canvas.width - player.w, newX));
  }, false);
  
  function gameLoop() {
    if (keys['ArrowLeft']) player.x = Math.max(0, player.x - player.speed);
    if (keys['ArrowRight']) player.x = Math.min(canvas.width - player.w, player.x + player.speed);
    if (keys['ArrowUp']) player.y = Math.max(0, player.y - player.speed);
    if (keys['ArrowDown']) player.y = Math.min(canvas.height - player.h, player.y + player.speed);
    
    update();
    draw();
    requestAnimationFrame(gameLoop);
  }
  
  // Restart button
  let restartBtn = document.createElement('button');
  restartBtn.textContent = 'RESTART';
  restartBtn.style.cssText = 'padding:10px 20px;font-size:16px;font-weight:bold;background:#FF6600;color:#000;border:2px solid #FFD700;cursor:pointer;margin-top:10px;display:block;margin-left:auto;margin-right:auto;';
  document.body.appendChild(restartBtn);
  
  restartBtn.addEventListener('click', () => {
    location.reload();
  });
  
  gameLoop();
};
