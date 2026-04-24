// Breakout - Arcade Classic
window.scrollerApp = function() {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 500;
  canvas.style.border = '3px solid #FF00FF';
  canvas.style.backgroundColor = '#000033';
  canvas.style.display = 'block';
  canvas.style.margin = '10px auto';
  document.body.appendChild(canvas);
  
  const ctx = canvas.getContext('2d');
  
  let paddle = { x: 175, y: 460, w: 50, h: 10 };
  let ball = { x: 200, y: 440, vx: 3, vy: -3, r: 5 };
  let bricks = [];
  let particles = [];
  let score = 0;
  let gameOver = false;
  let won = false;
  let level = 1;
  
  function createBricks() {
    bricks = [];
    let colors = ['#FF0000', '#FF7700', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF'];
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 10; col++) {
        bricks.push({
          x: col * 40,
          y: 40 + row * 20,
          w: 38,
          h: 18,
          color: colors[row],
          hits: 1
        });
      }
    }
  }
  
  createBricks();
  
  function drawPaddle() {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);
    ctx.strokeStyle = '#FFFF00';
    ctx.lineWidth = 2;
    ctx.strokeRect(paddle.x, paddle.y, paddle.w, paddle.h);
  }
  
  function drawBall() {
    ctx.fillStyle = '#FFFF00';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  
  function drawBricks() {
    bricks.forEach(brick => {
      ctx.fillStyle = brick.color;
      ctx.fillRect(brick.x, brick.y, brick.w, brick.h);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1;
      ctx.strokeRect(brick.x, brick.y, brick.w, brick.h);
    });
  }
  
  function drawParticles() {
    particles.forEach(p => {
      ctx.fillStyle = `rgba(255, 255, 0, ${p.life / p.maxLife})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  
  function update() {
    if (gameOver || won) return;
    
    // Ball movement
    ball.x += ball.vx;
    ball.y += ball.vy;
    
    // Wall collisions
    if (ball.x - ball.r < 0 || ball.x + ball.r > canvas.width) {
      ball.vx *= -1;
      ball.x = Math.max(ball.r, Math.min(canvas.width - ball.r, ball.x));
    }
    
    if (ball.y - ball.r < 0) {
      ball.vy *= -1;
      ball.y = ball.r;
    }
    
    // Ball lost
    if (ball.y > canvas.height) {
      gameOver = true;
      explode(ball.x, ball.y);
    }
    
    // Paddle collision
    if (ball.y + ball.r >= paddle.y && ball.y - ball.r <= paddle.y + paddle.h &&
        ball.x >= paddle.x && ball.x <= paddle.x + paddle.w) {
      ball.vy *= -1;
      ball.y = paddle.y - ball.r;
      
      let hitPos = (ball.x - paddle.x) / paddle.w;
      ball.vx = (hitPos - 0.5) * 8;
      explode(ball.x, ball.y);
    }
    
    // Brick collisions
    bricks = bricks.filter(brick => {
      if (ball.x + ball.r >= brick.x && ball.x - ball.r <= brick.x + brick.w &&
          ball.y + ball.r >= brick.y && ball.y - ball.r <= brick.y + brick.h) {
        
        score += 10;
        explode(ball.x, ball.y);
        
        // Determine collision side
        let overlapLeft = (ball.x + ball.r) - brick.x;
        let overlapRight = (brick.x + brick.w) - (ball.x - ball.r);
        let overlapTop = (ball.y + ball.r) - brick.y;
        let overlapBottom = (brick.y + brick.h) - (ball.y - ball.r);
        
        let minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
        
        if (minOverlap === overlapTop || minOverlap === overlapBottom) {
          ball.vy *= -1;
        } else {
          ball.vx *= -1;
        }
        
        return false;
      }
      return true;
    });
    
    // Level complete
    if (bricks.length === 0) {
      won = true;
      score += 1000;
    }
    
    // Update particles
    particles = particles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.2;
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
        size: 2,
        life: 20,
        maxLife: 20
      });
    }
  }
  
  function draw() {
    ctx.fillStyle = '#000033';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Grid
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, canvas.height);
      ctx.stroke();
    }
    
    drawBricks();
    drawPaddle();
    drawBall();
    drawParticles();
    
    ctx.fillStyle = '#00FF00';
    ctx.font = 'bold 16px "Courier New"';
    ctx.fillText('SCORE: ' + score, 10, 490);
    
    if (gameOver) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#FF0000';
      ctx.font = 'bold 40px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', 200, 250);
    } else if (won) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#00FF00';
      ctx.font = 'bold 40px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('YOU WIN!', 200, 250);
    }
  }
  
  let keys = {};
  document.addEventListener('keydown', (e) => {
    keys[e.key] = true;
  });
  document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
  });
  
  // Touch controls
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    let rect = canvas.getBoundingClientRect();
    let touchX = e.touches[0].clientX - rect.left;
    paddle.x = Math.max(0, Math.min(canvas.width - paddle.w, touchX - paddle.w / 2));
  }, false);
  
  function gameLoop() {
    if (keys['ArrowLeft']) paddle.x = Math.max(0, paddle.x - 6);
    if (keys['ArrowRight']) paddle.x = Math.min(canvas.width - paddle.w, paddle.x + 6);
    
    update();
    draw();
    requestAnimationFrame(gameLoop);
  }
  
  // Restart button
  let restartBtn = document.createElement('button');
  restartBtn.textContent = 'RESTART';
  restartBtn.style.cssText = 'padding:10px 20px;font-size:16px;font-weight:bold;background:#FF00FF;color:#000;border:2px solid #00FF00;cursor:pointer;margin-top:10px;display:block;margin-left:auto;margin-right:auto;';
  document.body.appendChild(restartBtn);
  
  restartBtn.addEventListener('click', () => {
    location.reload();
  });
  
  gameLoop();
};
