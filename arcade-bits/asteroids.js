// Asteroids - Arcade Classic
window.scrollerApp = function() {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 500;
  canvas.style.border = '3px solid #00FF00';
  canvas.style.backgroundColor = '#000000';
  canvas.style.display = 'block';
  canvas.style.margin = '10px auto';
  document.body.appendChild(canvas);
  
  const ctx = canvas.getContext('2d');
  
  let player = { x: 200, y: 250, angle: 0, vx: 0, vy: 0, w: 15, h: 15 };
  let bullets = [];
  let asteroids = [];
  let particles = [];
  let score = 0;
  let gameOver = false;
  let level = 1;
  
  function createAsteroids() {
    asteroids = [];
    for (let i = 0; i < 3 + level; i++) {
      asteroids.push({
        x: Math.random() * canvas.width,
        y: Math.random() * 100,
        size: 3,
        vx: (Math.random() - 0.5) * 3,
        vy: (Math.random() - 0.5) * 3
      });
    }
  }
  
  createAsteroids();
  
  function drawPlayer() {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-8, -8);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-8, 8);
    ctx.closePath();
    ctx.stroke();
    
    ctx.restore();
  }
  
  function drawAsteroids() {
    asteroids.forEach(a => {
      let radius = 5 + a.size * 3;
      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(a.x, a.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      
      // Jagged edge
      for (let i = 0; i < 8; i++) {
        let angle = (i / 8) * Math.PI * 2;
        let x1 = a.x + Math.cos(angle) * radius;
        let y1 = a.y + Math.sin(angle) * radius;
        let x2 = a.x + Math.cos(angle + Math.PI / 8) * (radius + 2);
        let y2 = a.y + Math.sin(angle + Math.PI / 8) * (radius + 2);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    });
  }
  
  function drawBullets() {
    bullets.forEach(b => {
      ctx.fillStyle = '#FFFF00';
      ctx.fillRect(b.x, b.y, 2, 2);
    });
  }
  
  function drawParticles() {
    particles.forEach(p => {
      ctx.fillStyle = `rgba(255, 255, 0, ${p.life / p.maxLife})`;
      ctx.fillRect(p.x, p.y, 2, 2);
    });
  }
  
  function update() {
    if (gameOver) return;
    
    // Player movement
    player.x += player.vx;
    player.y += player.vy;
    
    if (player.x < 0) player.x = canvas.width;
    if (player.x > canvas.width) player.x = 0;
    if (player.y < 0) player.y = canvas.height;
    if (player.y > canvas.height) player.y = 0;
    
    // Friction
    player.vx *= 0.99;
    player.vy *= 0.99;
    
    // Move bullets
    bullets = bullets.filter(b => {
      b.x += b.vx;
      b.y += b.vy;
      return b.x >= 0 && b.x < canvas.width && b.y >= 0 && b.y < canvas.height;
    });
    
    // Move asteroids
    asteroids.forEach(a => {
      a.x += a.vx;
      a.y += a.vy;
      
      if (a.x < 0) a.x = canvas.width;
      if (a.x > canvas.width) a.x = 0;
      if (a.y < 0) a.y = canvas.height;
      if (a.y > canvas.height) a.y = 0;
    });
    
    // Bullet-asteroid collisions
    for (let i = bullets.length - 1; i >= 0; i--) {
      for (let j = asteroids.length - 1; j >= 0; j--) {
        let b = bullets[i];
        let a = asteroids[j];
        let radius = 5 + a.size * 3;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < radius) {
          bullets.splice(i, 1);
          score += (4 - a.size) * 100;
          explode(a.x, a.y);
          
          if (a.size > 1) {
            for (let k = 0; k < 2; k++) {
              asteroids.push({
                x: a.x + (Math.random() - 0.5) * 20,
                y: a.y + (Math.random() - 0.5) * 20,
                size: a.size - 1,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4
              });
            }
          }
          asteroids.splice(j, 1);
          break;
        }
      }
    }
    
    // Player-asteroid collisions
    asteroids.forEach(a => {
      let radius = 5 + a.size * 3;
      let dx = player.x - a.x;
      let dy = player.y - a.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < radius + 10) {
        gameOver = true;
        explode(player.x, player.y);
      }
    });
    
    // Level complete
    if (asteroids.length === 0) {
      level++;
      createAsteroids();
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
    for (let i = 0; i < 12; i++) {
      let angle = (i / 12) * Math.PI * 2;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * 2,
        vy: Math.sin(angle) * 2,
        life: 30,
        maxLife: 30
      });
    }
  }
  
  function draw() {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Scanlines
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.height; i += 3) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(canvas.width, i);
      ctx.stroke();
    }
    
    drawAsteroids();
    drawPlayer();
    drawBullets();
    drawParticles();
    
    ctx.fillStyle = '#00FF00';
    ctx.font = 'bold 16px "Courier New"';
    ctx.fillText('SCORE: ' + score, 10, 480);
    ctx.fillText('LEVEL: ' + level, 280, 480);
    
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
      bullets.push({
        x: player.x + Math.cos(player.angle) * 15,
        y: player.y + Math.sin(player.angle) * 15,
        vx: Math.cos(player.angle) * 5,
        vy: Math.sin(player.angle) * 5
      });
    }
    keys[e.key] = true;
  });
  document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
  });
  
  // Touch controls
  canvas.addEventListener('touchstart', (e) => {
    bullets.push({
      x: player.x + Math.cos(player.angle) * 15,
      y: player.y + Math.sin(player.angle) * 15,
      vx: Math.cos(player.angle) * 5,
      vy: Math.sin(player.angle) * 5
    });
  }, false);
  
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    let rect = canvas.getBoundingClientRect();
    let touchX = e.touches[0].clientX - rect.left;
    let touchY = e.touches[0].clientY - rect.top;
    player.angle = Math.atan2(touchY - player.y, touchX - player.x) - Math.PI / 2;
  }, false);
  
  function gameLoop() {
    if (keys['ArrowLeft']) player.angle -= 0.15;
    if (keys['ArrowRight']) player.angle += 0.15;
    if (keys['ArrowUp']) {
      player.vx += Math.cos(player.angle) * 0.4;
      player.vy += Math.sin(player.angle) * 0.4;
    }
    
    update();
    draw();
    requestAnimationFrame(gameLoop);
  }
  
  // Restart button
  let restartBtn = document.createElement('button');
  restartBtn.textContent = 'RESTART';
  restartBtn.style.cssText = 'padding:10px 20px;font-size:16px;font-weight:bold;background:#00FF00;color:#000;border:2px solid #FFFF00;cursor:pointer;margin-top:10px;display:block;margin-left:auto;margin-right:auto;';
  document.body.appendChild(restartBtn);
  
  restartBtn.addEventListener('click', () => {
    location.reload();
  });
  
  gameLoop();
};
