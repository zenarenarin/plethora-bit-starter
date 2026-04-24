// Centipede - Arcade Classic
window.scrollerApp = function() {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 500;
  canvas.style.border = '3px solid #00DDDD';
  canvas.style.backgroundColor = '#001133';
  canvas.style.display = 'block';
  canvas.style.margin = '10px auto';
  document.body.appendChild(canvas);
  
  const ctx = canvas.getContext('2d');
  
  let player = { x: 190, y: 450, w: 16, h: 16, speed: 3 };
  let bullets = [];
  let centipedes = [];
  let mushrooms = [];
  let particles = [];
  let score = 0;
  let gameOver = false;
  let level = 1;
  
  function createCentipede() {
    centipedes = [];
    let length = 8 + level;
    for (let i = 0; i < length; i++) {
      centipedes.push({
        x: i * 20,
        y: 50,
        dx: 1,
        dy: 0,
        size: i === length - 1 ? 1 : 2
      });
    }
  }
  
  function createMushrooms() {
    for (let i = 0; i < 10 + level * 2; i++) {
      mushrooms.push({
        x: Math.random() * (canvas.width - 20) + 10,
        y: Math.random() * (canvas.height - 150) + 50,
        hits: 4,
        color: '#FF8800'
      });
    }
  }
  
  createCentipede();
  createMushrooms();
  
  function drawPlayer() {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(player.x, player.y, player.w, player.h);
    ctx.fillRect(player.x + 3, player.y - 8, 2, 8);
    ctx.fillRect(player.x + 11, player.y - 8, 2, 8);
  }
  
  function drawCentipedes() {
    centipedes.forEach(seg => {
      ctx.fillStyle = seg.dy === 0 ? '#FF00FF' : '#FF6600';
      ctx.fillRect(seg.x, seg.y, 12, 12);
      ctx.fillStyle = '#FFFF00';
      ctx.fillRect(seg.x + 2, seg.y + 2, 8, 8);
    });
  }
  
  function drawMushrooms() {
    mushrooms.forEach(m => {
      ctx.fillStyle = m.color;
      ctx.fillRect(m.x, m.y, 12, 12);
      ctx.strokeStyle = '#FF00FF';
      ctx.lineWidth = 1;
      ctx.strokeRect(m.x, m.y, 12, 12);
    });
  }
  
  function drawBullets() {
    bullets.forEach(b => {
      ctx.fillStyle = '#00FFFF';
      ctx.fillRect(b.x, b.y, 2, 6);
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
    
    // Move centipede
    let turnDown = false;
    centipedes.forEach(seg => {
      seg.x += seg.dx;
      if (seg.x <= 0 || seg.x + 12 >= canvas.width) turnDown = true;
    });
    
    if (turnDown) {
      centipedes.forEach(seg => {
        seg.dx *= -1;
        seg.dy = 15;
      });
    } else {
      centipedes.forEach(seg => seg.dy = 0);
    }
    
    centipedes.forEach(seg => {
      seg.y += seg.dy;
    });
    
    // Move bullets
    bullets = bullets.filter(b => {
      b.y -= 5;
      return b.y > 0;
    });
    
    // Bullet-centipede collisions
    for (let i = bullets.length - 1; i >= 0; i--) {
      for (let j = centipedes.length - 1; j >= 0; j--) {
        let b = bullets[i];
        let seg = centipedes[j];
        
        if (b.x < seg.x + 12 && b.x + 2 > seg.x &&
            b.y < seg.y + 12 && b.y + 6 > seg.y) {
          
          bullets.splice(i, 1);
          score += 100;
          explode(seg.x, seg.y);
          
          if (seg.size > 1) {
            centipedes.splice(j, 1);
            for (let k = 0; k < 2; k++) {
              centipedes.push({
                x: seg.x + (Math.random() - 0.5) * 30,
                y: seg.y + (Math.random() - 0.5) * 30,
                dx: seg.dx * 1.5,
                dy: 0,
                size: 1
              });
            }
          } else {
            centipedes.splice(j, 1);
          }
          break;
        }
      }
    }
    
    // Bullet-mushroom collisions
    for (let i = bullets.length - 1; i >= 0; i--) {
      for (let j = mushrooms.length - 1; j >= 0; j--) {
        let b = bullets[i];
        let m = mushrooms[j];
        
        if (b.x < m.x + 12 && b.x + 2 > m.x &&
            b.y < m.y + 12 && b.y + 6 > m.y) {
          
          bullets.splice(i, 1);
          m.hits--;
          if (m.hits <= 0) {
            mushrooms.splice(j, 1);
            score += 50;
          }
          break;
        }
      }
    }
    
    // Player-centipede collisions
    centipedes.forEach(seg => {
      if (player.x < seg.x + 12 && player.x + player.w > seg.x &&
          player.y < seg.y + 12 && player.y + player.h > seg.y) {
        gameOver = true;
        explode(player.x, player.y);
      }
    });
    
    // Level complete
    if (centipedes.length === 0) {
      level++;
      createCentipede();
      createMushrooms();
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
    for (let i = 0; i < 6; i++) {
      particles.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 3,
        vy: (Math.random() - 0.5) * 3,
        life: 25,
        maxLife: 25
      });
    }
  }
  
  function draw() {
    ctx.fillStyle = '#001133';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.strokeStyle = 'rgba(0, 221, 221, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.height; i += 10) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(canvas.width, i);
      ctx.stroke();
    }
    
    drawMushrooms();
    drawCentipedes();
    drawPlayer();
    drawBullets();
    drawParticles();
    
    ctx.fillStyle = '#00DDDD';
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
      bullets.push({ x: player.x + 7, y: player.y - 10 });
    }
    keys[e.key] = true;
  });
  document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
  });
  
  // Touch controls
  let touchX = 0;
  canvas.addEventListener('touchstart', (e) => {
    touchX = e.touches[0].clientX;
    bullets.push({ x: player.x + 7, y: player.y - 10 });
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
    
    update();
    draw();
    requestAnimationFrame(gameLoop);
  }
  
  // Restart button
  let restartBtn = document.createElement('button');
  restartBtn.textContent = 'RESTART';
  restartBtn.style.cssText = 'padding:10px 20px;font-size:16px;font-weight:bold;background:#00DDDD;color:#000;border:2px solid #FF00FF;cursor:pointer;margin-top:10px;display:block;margin-left:auto;margin-right:auto;';
  document.body.appendChild(restartBtn);
  
  restartBtn.addEventListener('click', () => {
    location.reload();
  });
  
  gameLoop();
};
