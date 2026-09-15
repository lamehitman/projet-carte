(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const TILE = 45;
  const ROWS = 12;
  const GRAVITY = 0.62;
  const MAX_FALL = 16;
  const RUN_SPEED = 4.4;
  const RUN_ACCEL = 0.55;
  const AIR_ACCEL = 0.35;
  const FRICTION = 0.72;
  const JUMP_VELOCITY = -12.6;
  const JUMP_CUT = 0.5;

  const EMPTY = 0, GROUND = 1, BRICK = 2, QBLOCK = 3, USED = 4, PIPE = 5, PIPE_TOP = 6;

  const scoreEl = document.getElementById('score');
  const coinsEl = document.getElementById('coins');
  const livesEl = document.getElementById('lives');
  const worldEl = document.getElementById('world');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayText = document.getElementById('overlay-text');
  const overlayBtn = document.getElementById('overlay-btn');

  function buildLevel() {
    const COLS = 150;
    const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(EMPTY));
    const pits = [[19, 21], [46, 48], [71, 74], [98, 100], [122, 126]];
    const inPit = (c) => pits.some(([a, b]) => c >= a && c <= b);

    for (let c = 0; c < COLS; c++) {
      if (inPit(c)) continue;
      grid[10][c] = GROUND;
      grid[11][c] = GROUND;
    }

    const platforms = [
      { row: 7, cols: [10, 11, 12], type: BRICK },
      { row: 6, cols: [13], type: QBLOCK },
      { row: 8, cols: [25, 26, 27, 28], type: BRICK },
      { row: 5, cols: [30], type: QBLOCK },
      { row: 8, cols: [37, 38], type: QBLOCK },
      { row: 7, cols: [52, 53, 54, 55, 56], type: BRICK },
      { row: 4, cols: [54], type: QBLOCK },
      { row: 9, cols: [60, 61], type: BRICK },
      { row: 6, cols: [65, 66], type: QBLOCK },
      { row: 8, cols: [80, 81, 82], type: BRICK },
      { row: 5, cols: [81], type: QBLOCK },
      { row: 7, cols: [90, 91, 92, 93], type: BRICK },
      { row: 8, cols: [104, 105], type: QBLOCK },
      { row: 6, cols: [108, 109, 110], type: BRICK },
      { row: 9, cols: [130, 131], type: BRICK },
      { row: 7, cols: [134, 135, 136], type: BRICK },
    ];
    platforms.forEach(p => p.cols.forEach(c => { grid[p.row][c] = p.type; }));

    const pipes = [
      { col: 34, height: 2 }, { col: 43, height: 3 }, { col: 76, height: 2 },
      { col: 113, height: 3 }, { col: 140, height: 2 },
    ];
    pipes.forEach(({ col, height }) => {
      for (let h = 0; h < height; h++) {
        const row = 9 - h;
        grid[row][col] = h === height - 1 ? PIPE_TOP : PIPE;
        if (col + 1 < COLS) grid[row][col + 1] = h === height - 1 ? PIPE_TOP : PIPE;
      }
    });

    const coinCoords = [
      [6, 10], [6, 11], [6, 12], [5, 26], [5, 27], [4, 30],
      [9, 17], [9, 18], [6, 53], [6, 54], [6, 55], [3, 54],
      [8, 60], [8, 61], [5, 65], [5, 66], [7, 80], [7, 81], [7, 82],
      [4, 81], [6, 90], [6, 91], [6, 92], [7, 104], [7, 105],
      [5, 108], [5, 109], [5, 110], [8, 130], [8, 131], [6, 134], [6, 135], [6, 136],
      [9, 63], [9, 64], [9, 85], [9, 86], [9, 87],
    ];

    const enemySpawns = [
      { col: 15, range: [13, 24] },
      { col: 29, range: [24, 33] },
      { col: 40, range: [37, 42] },
      { col: 58, range: [52, 68] },
      { col: 63, range: [52, 68] },
      { col: 85, range: [78, 96] },
      { col: 102, range: [100, 112] },
      { col: 116, range: [108, 121] },
      { col: 133, range: [128, 145] },
    ];

    const flagCol = 145;
    for (let r = 2; r <= 9; r++) grid[r][flagCol] = EMPTY;

    return { grid, COLS, coinCoords, enemySpawns, flagCol, startCol: 2 };
  }

  const level = buildLevel();
  const COLS = level.COLS;
  const LEVEL_W = COLS * TILE;
  const LEVEL_H = ROWS * TILE;

  function isSolid(type) {
    return type === GROUND || type === BRICK || type === QBLOCK || type === USED || type === PIPE || type === PIPE_TOP;
  }

  function tileAt(col, row) {
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return EMPTY;
    return level.grid[row][col];
  }

  class Entity {
    constructor(x, y, w, h) {
      this.x = x; this.y = y; this.w = w; this.h = h;
      this.vx = 0; this.vy = 0;
      this.onGround = false;
      this.dead = false;
    }
    get left() { return this.x; }
    get right() { return this.x + this.w; }
    get top() { return this.y; }
    get bottom() { return this.y + this.h; }

    moveAndCollide(solidCheck) {
      this.x += this.vx;
      this.resolveAxis('x', solidCheck);
      this.y += this.vy;
      this.onGround = false;
      this.resolveAxis('y', solidCheck);
    }

    resolveAxis(axis, solidCheck) {
      const c1 = Math.floor(this.left / TILE);
      const c2 = Math.floor((this.right - 0.01) / TILE);
      const r1 = Math.floor(this.top / TILE);
      const r2 = Math.floor((this.bottom - 0.01) / TILE);
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
          if (!solidCheck(c, r)) continue;
          const tx = c * TILE, ty = r * TILE;
          if (axis === 'x') {
            if (this.vx > 0) this.x = tx - this.w;
            else if (this.vx < 0) this.x = tx + TILE;
            this.vx = 0;
          } else {
            if (this.vy > 0) { this.y = ty - this.h; this.onGround = true; }
            else if (this.vy < 0) { this.y = ty + TILE; }
            this.vy = 0;
          }
        }
      }
    }
  }

  class Player extends Entity {
    constructor(x, y) {
      super(x, y, 32, 40);
      this.facing = 1;
      this.invincible = 0;
      this.jumpHeld = false;
      this.dying = false;
    }
  }

  class Goomba extends Entity {
    constructor(x, y, range) {
      super(x, y, 34, 32);
      this.vx = -1.6;
      this.range = range;
      this.squashed = false;
      this.squashTimer = 0;
    }
  }

  class Coin {
    constructor(x, y) { this.x = x; this.y = y; this.taken = false; this.anim = Math.random() * Math.PI * 2; }
  }

  class Particle {
    constructor(x, y, vx, vy, color, life) {
      this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.color = color; this.life = life; this.maxLife = life;
    }
  }

  let player, goombas, coins, particles, popups, camX, keys, gameState, score, coinCount, lives, animT;

  function resetLevel(keepScore) {
    player = new Player(level.startCol * TILE, (ROWS - 3) * TILE);
    goombas = level.enemySpawns.map(s => new Goomba(s.col * TILE, (ROWS - 3) * TILE, s.range));
    coins = level.coinCoords.map(([r, c]) => new Coin(c * TILE + TILE / 2, r * TILE + TILE / 2));
    particles = [];
    popups = [];
    camX = 0;
    if (!keepScore) { score = 0; coinCount = 0; lives = 3; }
    level.usedBlocks = new Set();
    level.grid = buildLevel().grid;
  }

  function fullReset() {
    resetLevel(false);
    gameState = 'ready';
    animT = 0;
    updateHud();
  }

  keys = {};
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (gameState === 'ready' && (e.code === 'Space' || e.code === 'ArrowUp')) startGame();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  function bindHold(id, code) {
    const el = document.getElementById(id);
    const set = (v) => (e) => { e.preventDefault(); keys[code] = v; };
    el.addEventListener('touchstart', set(true), { passive: false });
    el.addEventListener('touchend', set(false), { passive: false });
    el.addEventListener('mousedown', set(true));
    el.addEventListener('mouseup', set(false));
    el.addEventListener('mouseleave', set(false));
  }
  bindHold('btn-left', 'ArrowLeft');
  bindHold('btn-right', 'ArrowRight');
  bindHold('btn-jump', 'ArrowUp');

  function left() { return keys['ArrowLeft'] || keys['KeyA'] || keys['KeyQ']; }
  function right() { return keys['ArrowRight'] || keys['KeyD']; }
  function jumpKey() { return keys['ArrowUp'] || keys['KeyW'] || keys['KeyZ'] || keys['Space']; }

  function updateHud() {
    scoreEl.textContent = score;
    coinsEl.textContent = coinCount;
    livesEl.textContent = lives;
    worldEl.textContent = '1-1';
  }

  function spawnParticles(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      particles.push(new Particle(x, y, (Math.random() - 0.5) * 6, -Math.random() * 6 - 2, color, 30));
    }
  }

  function hitBlock(col, row) {
    const type = tileAt(col, row);
    if (type === QBLOCK) {
      level.grid[row][col] = USED;
      score += 100;
      popups.push({ x: col * TILE + TILE / 2, y: row * TILE, text: '+100', life: 40 });
      spawnParticles(col * TILE + TILE / 2, row * TILE, '#ffd54a', 8);
    } else if (type === BRICK) {
      spawnParticles(col * TILE + TILE / 2, row * TILE, '#c96a3c', 10);
    }
  }

  function updatePlayer() {
    if (player.dying) {
      player.vy += GRAVITY * 0.5;
      player.y = Math.min(player.y + player.vy, LEVEL_H + 200);
      return;
    }

    const accel = player.onGround ? RUN_ACCEL : AIR_ACCEL;
    if (left() && !right()) {
      player.vx -= accel;
      player.facing = -1;
    } else if (right() && !left()) {
      player.vx += accel;
      player.facing = 1;
    } else if (player.onGround) {
      player.vx *= FRICTION;
      if (Math.abs(player.vx) < 0.05) player.vx = 0;
    }
    player.vx = Math.max(-RUN_SPEED, Math.min(RUN_SPEED, player.vx));

    if (jumpKey() && player.onGround && !player.jumpHeld) {
      player.vy = JUMP_VELOCITY;
      player.onGround = false;
      player.jumpHeld = true;
    }
    if (!jumpKey()) {
      if (player.vy < JUMP_VELOCITY * JUMP_CUT && player.jumpHeld) player.vy = JUMP_VELOCITY * JUMP_CUT;
      player.jumpHeld = false;
    }

    player.vy += GRAVITY;
    if (player.vy > MAX_FALL) player.vy = MAX_FALL;

    const prevVy = player.vy;
    player.moveAndCollide((c, r) => isSolid(tileAt(c, r)));

    if (prevVy < 0 && player.vy === 0) {
      const midCol = Math.floor((player.left + player.right) / 2 / TILE);
      const row = Math.floor((player.top - 1) / TILE);
      hitBlock(midCol, row);
    }

    if (player.x < 0) player.x = 0;
    if (player.x + player.w > LEVEL_W) player.x = LEVEL_W - player.w;

    if (player.y > LEVEL_H + 150) {
      endLife();
      return;
    }

    if (player.invincible > 0) player.invincible--;

    if (player.right >= level.flagCol * TILE && gameState === 'playing') {
      winLevel();
    }
  }

  function updateGoombas() {
    goombas.forEach(g => {
      if (g.dead) return;
      if (g.squashed) {
        g.squashTimer--;
        if (g.squashTimer <= 0) g.dead = true;
        return;
      }
      g.vy += GRAVITY;
      if (g.vy > MAX_FALL) g.vy = MAX_FALL;
      const minX = g.range[0] * TILE, maxX = g.range[1] * TILE;
      if (g.x <= minX) g.vx = Math.abs(g.vx);
      if (g.x + g.w >= maxX) g.vx = -Math.abs(g.vx);
      g.moveAndCollide((c, r) => isSolid(tileAt(c, r)));
      if (g.x < minX) g.x = minX;
      if (g.x + g.w > maxX) g.x = maxX - g.w;
    });
  }

  function aabb(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  function checkGoombaCollisions() {
    if (player.dying) return;
    goombas.forEach(g => {
      if (g.dead || g.squashed) return;
      if (!aabb(player, g)) return;
      const stomping = player.vy > 1 && player.bottom - g.top < 18;
      if (stomping) {
        g.squashed = true;
        g.squashTimer = 20;
        g.vx = 0;
        player.vy = JUMP_VELOCITY * 0.55;
        score += 200;
        popups.push({ x: g.x + g.w / 2, y: g.y, text: '+200', life: 40 });
        spawnParticles(g.x + g.w / 2, g.y, '#8b5a2b', 8);
      } else if (player.invincible <= 0) {
        damagePlayer();
      }
    });
  }

  function checkCoinCollisions() {
    coins.forEach(c => {
      if (c.taken) return;
      const dx = (player.x + player.w / 2) - c.x;
      const dy = (player.y + player.h / 2) - c.y;
      if (Math.abs(dx) < 24 && Math.abs(dy) < 26) {
        c.taken = true;
        coinCount++;
        score += 50;
        spawnParticles(c.x, c.y, '#ffd54a', 6);
        if (coinCount % 100 === 0) lives++;
      }
    });
  }

  function damagePlayer() {
    lives--;
    updateHud();
    if (lives <= 0) {
      player.dying = true;
      player.vy = -10;
      player.vx = 0;
      gameState = 'dying';
      setTimeout(() => showOverlay('Game Over', `Score final : ${score}`, 'Rejouer', () => {
        resetLevel(false);
        gameState = 'ready';
        hideOverlay();
      }), 1200);
    } else {
      player.invincible = 90;
      player.vy = JUMP_VELOCITY * 0.6;
      player.vx = player.facing * -3;
    }
  }

  function endLife() {
    if (gameState !== 'playing') return;
    lives--;
    updateHud();
    if (lives <= 0) {
      gameState = 'over';
      showOverlay('Game Over', `Score final : ${score}`, 'Rejouer', () => {
        resetLevel(false);
        gameState = 'ready';
        hideOverlay();
      });
    } else {
      const keepScore = true;
      const s = score, cc = coinCount, l = lives;
      resetLevel(keepScore);
      score = s; coinCount = cc; lives = l;
      gameState = 'playing';
    }
  }

  function winLevel() {
    gameState = 'won';
    score += 1000;
    showOverlay('Bravo !', `Niveau terminé — Score : ${score}`, 'Rejouer', () => {
      resetLevel(false);
      gameState = 'ready';
      hideOverlay();
    });
  }

  function showOverlay(title, text, btnLabel, onClick) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    overlayBtn.textContent = btnLabel;
    overlay.classList.remove('hidden');
    overlayBtn.onclick = onClick;
  }
  function hideOverlay() { overlay.classList.add('hidden'); }

  function startGame() {
    gameState = 'playing';
    hideOverlay();
  }
  overlayBtn.onclick = startGame;

  function updateCamera() {
    const target = player.x - canvas.width / 2 + player.w / 2;
    camX += (target - camX) * 0.15;
    camX = Math.max(0, Math.min(LEVEL_W - canvas.width, camX));
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, '#7ec0ee');
    g.addColorStop(1, '#c6e8ff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 6; i++) {
      const bx = ((i * 340 - camX * 0.3) % (canvas.width + 300)) - 150;
      const by = 60 + (i % 3) * 40;
      drawCloud(bx, by);
    }
    ctx.fillStyle = '#4caf50';
    for (let i = 0; i < 8; i++) {
      const hx = ((i * 260 - camX * 0.5) % (canvas.width + 400)) - 200;
      ctx.beginPath();
      ctx.arc(hx, canvas.height - 20, 90, Math.PI, 0);
      ctx.fill();
    }
  }

  function drawCloud(x, y) {
    ctx.beginPath();
    ctx.arc(x, y, 20, 0, Math.PI * 2);
    ctx.arc(x + 22, y - 10, 24, 0, Math.PI * 2);
    ctx.arc(x + 46, y, 20, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTile(type, x, y) {
    switch (type) {
      case GROUND:
        ctx.fillStyle = '#c96a3c';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = '#8b4a26';
        ctx.fillRect(x, y, TILE, 6);
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
        break;
      case BRICK:
        ctx.fillStyle = '#b5502e';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.strokeRect(x, y, TILE, TILE / 2);
        ctx.strokeRect(x, y + TILE / 2, TILE, TILE / 2);
        ctx.strokeRect(x + TILE / 2, y, 0, TILE / 2);
        break;
      case QBLOCK: {
        ctx.fillStyle = '#f5b942';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = '#c98a1f';
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
        ctx.fillStyle = '#c98a1f';
        ctx.font = 'bold 22px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('?', x + TILE / 2, y + TILE / 2 + 8);
        ctx.lineWidth = 1;
        break;
      }
      case USED:
        ctx.fillStyle = '#9c7a4a';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
        break;
      case PIPE:
      case PIPE_TOP:
        ctx.fillStyle = '#3fae4a';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = '#256e2d';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
        if (type === PIPE_TOP) {
          ctx.fillStyle = '#2f8f3a';
          ctx.fillRect(x - 3, y, TILE + 6, 12);
        }
        ctx.lineWidth = 1;
        break;
    }
  }

  function drawLevel() {
    const c1 = Math.max(0, Math.floor(camX / TILE) - 1);
    const c2 = Math.min(COLS - 1, Math.ceil((camX + canvas.width) / TILE) + 1);
    for (let r = 0; r < ROWS; r++) {
      for (let c = c1; c <= c2; c++) {
        const type = level.grid[r][c];
        if (type === EMPTY) continue;
        drawTile(type, c * TILE - camX, r * TILE);
      }
    }
  }

  function drawFlag() {
    const x = level.flagCol * TILE - camX;
    ctx.fillStyle = '#cfd8dc';
    ctx.fillRect(x + TILE / 2 - 3, 2 * TILE, 6, 8 * TILE);
    const flagUp = gameState === 'won';
    const fy = flagUp ? 2 * TILE + 10 : 8 * TILE;
    ctx.fillStyle = '#4caf50';
    ctx.beginPath();
    ctx.moveTo(x + TILE / 2, fy);
    ctx.lineTo(x + TILE / 2 + 34, fy + 14);
    ctx.lineTo(x + TILE / 2, fy + 28);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#795548';
    ctx.fillRect(x + TILE / 2 - 14, 9 * TILE, 30, 3 * TILE);
  }

  function drawCoins() {
    coins.forEach(c => {
      if (c.taken) return;
      c.anim += 0.15;
      const scale = Math.abs(Math.cos(c.anim));
      const sx = c.x - camX;
      ctx.fillStyle = '#ffd54a';
      ctx.beginPath();
      ctx.ellipse(sx, c.y, 9 * scale + 2, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#c98a1f';
      ctx.stroke();
    });
  }

  function drawGoombas() {
    goombas.forEach(g => {
      if (g.dead) return;
      const sx = g.x - camX;
      const sy = g.squashed ? g.y + g.h * 0.6 : g.y;
      const h = g.squashed ? g.h * 0.4 : g.h;
      ctx.fillStyle = '#8b5a2b';
      ctx.beginPath();
      ctx.ellipse(sx + g.w / 2, sy + h / 2, g.w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      if (!g.squashed) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(sx + 6, sy + 10, 6, 6);
        ctx.fillRect(sx + g.w - 12, sy + 10, 6, 6);
        ctx.fillStyle = '#000';
        ctx.fillRect(sx + 8, sy + 12, 3, 3);
        ctx.fillRect(sx + g.w - 10, sy + 12, 3, 3);
        ctx.fillStyle = '#5c3a1a';
        ctx.fillRect(sx + 2, sy + g.h - 8, 10, 8);
        ctx.fillRect(sx + g.w - 12, sy + g.h - 8, 10, 8);
      }
    });
  }

  function drawPlayer() {
    if (player.invincible > 0 && Math.floor(player.invincible / 4) % 2 === 0) return;
    const sx = player.x - camX;
    const sy = player.y;
    ctx.save();
    ctx.translate(sx + player.w / 2, sy + player.h / 2);
    ctx.scale(player.facing, 1);
    ctx.fillStyle = '#e53935';
    ctx.fillRect(-player.w / 2, -player.h / 2, player.w, 14);
    ctx.fillStyle = '#ffccbc';
    ctx.fillRect(-player.w / 2 + 4, -player.h / 2 + 10, player.w - 8, 12);
    ctx.fillStyle = '#1565c0';
    ctx.fillRect(-player.w / 2, -player.h / 2 + 20, player.w, player.h - 20);
    ctx.fillStyle = '#3e2723';
    ctx.fillRect(player.w / 2 - 10, -player.h / 2 + 8, 8, 6);
    ctx.restore();
  }

  function drawParticles() {
    particles.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - camX - 3, p.y - 3, 6, 6);
      ctx.globalAlpha = 1;
    });
  }

  function drawPopups() {
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    popups.forEach(p => {
      ctx.fillStyle = `rgba(255,213,74,${Math.max(0, p.life / 40)})`;
      ctx.fillText(p.text, p.x - camX, p.y);
    });
  }

  function updateParticles() {
    particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.3; p.life--; });
    particles = particles.filter(p => p.life > 0);
    popups.forEach(p => { p.y -= 0.8; p.life--; });
    popups = popups.filter(p => p.life > 0);
  }

  function update() {
    if (gameState === 'playing') {
      updatePlayer();
      updateGoombas();
      checkGoombaCollisions();
      checkCoinCollisions();
    } else if (gameState === 'dying') {
      updatePlayer();
    }
    updateParticles();
    updateCamera();
    updateHud();
  }

  function render() {
    drawBackground();
    drawLevel();
    drawFlag();
    drawCoins();
    drawGoombas();
    drawParticles();
    if (!player.dying || Math.floor(animT / 4) % 2 === 0) drawPlayer();
    drawPopups();
  }

  function loop() {
    animT++;
    update();
    render();
    requestAnimationFrame(loop);
  }

  fullReset();
  showOverlay('Super Plombier', 'Flèches / QSD pour bouger, Espace ou Haut pour sauter. Écrase les Goombas, ramasse les pièces, atteins le drapeau !', 'Jouer', startGame);
  requestAnimationFrame(loop);
})();
