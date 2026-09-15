(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  const hpFill = document.getElementById('hp-fill');
  const hpText = document.getElementById('hp-text');
  const xpFill = document.getElementById('xp-fill');
  const waveEl = document.getElementById('wave');
  const levelEl = document.getElementById('level');
  const killsEl = document.getElementById('kills');
  const waveBanner = document.getElementById('wave-banner');
  const levelupOverlay = document.getElementById('levelup-overlay');
  const cardsEl = document.getElementById('cards');
  const startOverlay = document.getElementById('start-overlay');
  const startBtn = document.getElementById('start-btn');
  const gameoverOverlay = document.getElementById('gameover-overlay');
  const gameoverStats = document.getElementById('gameover-stats');
  const restartBtn = document.getElementById('restart-btn');

  const ABILITIES = [
    { id: 'hp', name: 'Vitalité', icon: '❤', desc: '+20 PV max et soin complet', apply: (p) => { p.maxHp += 20; p.hp = Math.min(p.maxHp, p.hp + 20); } },
    { id: 'dmg', name: 'Puissance', icon: '⚔', desc: '+25% de dégâts', apply: (p) => { p.damageMult *= 1.25; } },
    { id: 'rate', name: 'Cadence', icon: '⚡', desc: '+18% de cadence de tir', apply: (p) => { p.fireRateMult *= 1.18; } },
    { id: 'speed', name: 'Vitesse', icon: '👟', desc: '+12% de vitesse de déplacement', apply: (p) => { p.speedMult *= 1.12; } },
    { id: 'multi', name: 'Multi-tir', icon: '✳', desc: '+1 projectile tiré', apply: (p) => { p.projectileCount += 1; } },
    { id: 'pierce', name: 'Perforation', icon: '➶', desc: 'Les projectiles traversent 1 ennemi de plus', apply: (p) => { p.pierce += 1; } },
    { id: 'magnet', name: 'Aimant', icon: '🧲', desc: '+45% de rayon de ramassage', apply: (p) => { p.magnetMult *= 1.45; } },
    { id: 'regen', name: 'Régénération', icon: '✚', desc: '+0.35 PV par seconde', apply: (p) => { p.regen += 0.35; } },
  ];

  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  let player, enemies, projectiles, orbs, particles, abilityCount;
  let wave, kills, gameState, spawnTimer, waveEnemiesToSpawn, waveEnemiesAlive, bannerTimer, bannerText;
  let keys = {};
  let stick = { active: false, dx: 0, dy: 0 };

  function newPlayer() {
    return {
      x: W / 2, y: H / 2, r: 15,
      hp: 100, maxHp: 100,
      baseSpeed: 190, speedMult: 1,
      baseDamage: 11, damageMult: 1,
      baseFireRate: 1.8, fireRateMult: 1,
      projectileCount: 1, pierce: 0,
      baseMagnet: 70, magnetMult: 1,
      regen: 0,
      level: 1, xp: 0, xpToNext: 6,
      fireCooldown: 0,
      invincible: 0,
      facing: { x: 1, y: 0 },
    };
  }

  function resetGame() {
    player = newPlayer();
    enemies = [];
    projectiles = [];
    orbs = [];
    particles = [];
    abilityCount = {};
    wave = 0;
    kills = 0;
    spawnTimer = 0;
    waveEnemiesToSpawn = 0;
    waveEnemiesAlive = 0;
    bannerTimer = 0;
    bannerText = '';
    gameState = 'ready';
    startWave();
  }

  function startWave() {
    wave++;
    const isBossWave = wave % 5 === 0;
    waveEnemiesToSpawn = 6 + wave * 3;
    waveEnemiesAlive = 0;
    spawnTimer = 0;
    showBanner(isBossWave ? `Manche ${wave} — Vague d'élite !` : `Manche ${wave}`);
    gameState = 'playing';
  }

  function showBanner(text) {
    bannerText = text;
    bannerTimer = 1.8;
    waveBanner.textContent = text;
    waveBanner.classList.remove('hidden');
  }

  function spawnEnemy(elite) {
    const side = Math.floor(rand(0, 4));
    let x, y;
    if (side === 0) { x = rand(0, W); y = -30; }
    else if (side === 1) { x = W + 30; y = rand(0, H); }
    else if (side === 2) { x = rand(0, W); y = H + 30; }
    else { x = -30; y = rand(0, H); }

    const scale = 1 + wave * 0.12;
    const e = {
      x, y,
      r: elite ? 30 : 14,
      hp: elite ? 90 * scale : 12 * scale,
      maxHp: elite ? 90 * scale : 12 * scale,
      speed: elite ? 65 + wave * 1.4 : 78 + wave * 1.8,
      damage: elite ? 20 + wave * 1.3 : 5 + wave * 0.8,
      elite,
      hitFlash: 0,
      xpValue: elite ? 8 : 1,
    };
    enemies.push(e);
    waveEnemiesAlive++;
  }

  function updateSpawning(dt) {
    if (waveEnemiesToSpawn <= 0) {
      if (waveEnemiesAlive <= 0 && gameState === 'playing') {
        gameState = 'wave-clear';
        bannerTimer = 1.2;
        setTimeout(() => { if (gameState === 'wave-clear') startWave(); }, 1200);
      }
      return;
    }
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      const eliteSlot = wave % 5 === 0 && waveEnemiesToSpawn === 1;
      spawnEnemy(eliteSlot);
      waveEnemiesToSpawn--;
      spawnTimer = Math.max(0.25, 0.9 - wave * 0.03);
    }
  }

  function inputDir() {
    let dx = 0, dy = 0;
    if (keys['ArrowLeft'] || keys['KeyA'] || keys['KeyQ']) dx -= 1;
    if (keys['ArrowRight'] || keys['KeyD']) dx += 1;
    if (keys['ArrowUp'] || keys['KeyW'] || keys['KeyZ']) dy -= 1;
    if (keys['ArrowDown'] || keys['KeyS']) dy += 1;
    if (stick.active) { dx += stick.dx; dy += stick.dy; }
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    return { dx, dy };
  }

  function updatePlayer(dt) {
    const { dx, dy } = inputDir();
    const speed = player.baseSpeed * player.speedMult;
    player.x = clamp(player.x + dx * speed * dt, player.r, W - player.r);
    player.y = clamp(player.y + dy * speed * dt, player.r, H - player.r);
    if (dx !== 0 || dy !== 0) player.facing = { x: dx, y: dy };

    if (player.regen > 0) player.hp = Math.min(player.maxHp, player.hp + player.regen * dt);
    if (player.invincible > 0) player.invincible -= dt;

    player.fireCooldown -= dt;
    if (player.fireCooldown <= 0) {
      const target = nearestEnemy(player.x, player.y);
      if (target) {
        fireAt(target);
        player.fireCooldown = 1 / (player.baseFireRate * player.fireRateMult);
      }
    }
  }

  function nearestEnemy(x, y) {
    let best = null, bestD = Infinity;
    for (const e of enemies) {
      const d = dist(x, y, e.x, e.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  function fireAt(target) {
    const baseAngle = Math.atan2(target.y - player.y, target.x - player.x);
    const n = player.projectileCount;
    const spread = Math.min(0.55, 0.14 * (n - 1));
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
      const angle = baseAngle + t * spread;
      projectiles.push({
        x: player.x, y: player.y,
        vx: Math.cos(angle) * 480, vy: Math.sin(angle) * 480,
        damage: player.baseDamage * player.damageMult,
        pierceLeft: player.pierce,
        life: 1.4,
      });
    }
  }

  function updateProjectiles(dt) {
    projectiles.forEach(p => {
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    });
    projectiles = projectiles.filter(p => p.life > 0 && p.x > -20 && p.x < W + 20 && p.y > -20 && p.y < H + 20);
  }

  function updateEnemies(dt) {
    enemies.forEach(e => {
      const dx = player.x - e.x, dy = player.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.x += (dx / d) * e.speed * dt;
      e.y += (dy / d) * e.speed * dt;
      if (e.hitFlash > 0) e.hitFlash -= dt;

      if (d < e.r + player.r && player.invincible <= 0) {
        player.hp -= e.damage;
        player.invincible = 0.75;
        const kx = (player.x - e.x) / d, ky = (player.y - e.y) / d;
        player.x = clamp(player.x + kx * 18, player.r, W - player.r);
        player.y = clamp(player.y + ky * 18, player.r, H - player.r);
        if (player.hp <= 0) triggerGameOver();
      }
    });
  }

  function checkProjectileHits() {
    for (const p of projectiles) {
      if (p.pierceLeft < 0) continue;
      for (const e of enemies) {
        if (e.dead) continue;
        if (dist(p.x, p.y, e.x, e.y) < e.r + 4) {
          e.hp -= p.damage;
          e.hitFlash = 0.12;
          p.pierceLeft--;
          spawnParticles(p.x, p.y, '#ffd54a', 3);
          if (e.hp <= 0) killEnemy(e);
          if (p.pierceLeft < 0) break;
        }
      }
    }
    projectiles = projectiles.filter(p => p.pierceLeft >= 0);
  }

  function killEnemy(e) {
    e.dead = true;
    kills++;
    waveEnemiesAlive--;
    spawnParticles(e.x, e.y, e.elite ? '#ff8a65' : '#8b5a2b', e.elite ? 18 : 8);
    orbs.push({ x: e.x, y: e.y, value: e.xpValue, vx: 0, vy: 0 });
  }

  function updateOrbs(dt) {
    const magnetR = player.baseMagnet * player.magnetMult;
    orbs.forEach(o => {
      const d = dist(o.x, o.y, player.x, player.y);
      if (d < magnetR) {
        const pull = 520 * (1 - d / magnetR) + 80;
        o.x += ((player.x - o.x) / (d || 1)) * pull * dt;
        o.y += ((player.y - o.y) / (d || 1)) * pull * dt;
      }
      if (d < player.r + 6) { o.taken = true; gainXp(o.value); }
    });
    orbs = orbs.filter(o => !o.taken);
  }

  function gainXp(v) {
    player.xp += v;
    while (player.xp >= player.xpToNext) {
      player.xp -= player.xpToNext;
      player.level++;
      player.xpToNext = Math.round(6 + player.level * 3.2);
      openLevelUp();
    }
  }

  function openLevelUp() {
    gameState = 'levelup';
    const pool = [...ABILITIES];
    const picks = [];
    while (picks.length < 3 && pool.length) {
      const i = Math.floor(Math.random() * pool.length);
      picks.push(pool.splice(i, 1)[0]);
    }
    cardsEl.innerHTML = '';
    picks.forEach(ability => {
      const card = document.createElement('button');
      card.className = 'card';
      const level = (abilityCount[ability.id] || 0) + 1;
      card.innerHTML = `<div class="card-icon">${ability.icon}</div>
        <div class="card-name">${ability.name}</div>
        <div class="card-desc">${ability.desc}</div>
        <div class="card-level">Niveau ${level}</div>`;
      card.onclick = () => chooseAbility(ability);
      cardsEl.appendChild(card);
    });
    levelupOverlay.classList.remove('hidden');
  }

  function chooseAbility(ability) {
    ability.apply(player);
    abilityCount[ability.id] = (abilityCount[ability.id] || 0) + 1;
    levelupOverlay.classList.add('hidden');
    gameState = 'playing';
  }

  function spawnParticles(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      particles.push({
        x, y, vx: rand(-140, 140), vy: rand(-140, 140), color,
        life: rand(0.25, 0.5), maxLife: 0.5,
      });
    }
    particles.forEach(p => p.maxLife = p.maxLife || 0.5);
  }

  function updateParticles(dt) {
    particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; p.life -= dt; });
    particles = particles.filter(p => p.life > 0);
  }

  function triggerGameOver() {
    gameState = 'gameover';
    gameoverStats.textContent = `Manche atteinte : ${wave} · Niveau : ${player.level} · Éliminations : ${kills}`;
    gameoverOverlay.classList.remove('hidden');
  }

  function updateHud() {
    hpFill.style.width = `${clamp((player.hp / player.maxHp) * 100, 0, 100)}%`;
    hpText.textContent = `${Math.max(0, Math.round(player.hp))} / ${Math.round(player.maxHp)}`;
    xpFill.style.width = `${clamp((player.xp / player.xpToNext) * 100, 0, 100)}%`;
    waveEl.textContent = wave;
    levelEl.textContent = player.level;
    killsEl.textContent = kills;
  }

  function update(dt) {
    if (gameState === 'playing') {
      updateSpawning(dt);
      updatePlayer(dt);
      updateEnemies(dt);
      updateProjectiles(dt);
      checkProjectileHits();
      updateOrbs(dt);
    }
    updateParticles(dt);
    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) waveBanner.classList.add('hidden');
    }
    updateHud();
  }

  function drawArenaBackground() {
    ctx.fillStyle = '#171a2b';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(124,77,255,0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(124,77,255,0.35)';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, W - 3, H - 3);
  }

  function drawPlayer() {
    const flashing = player.invincible > 0 && Math.floor(player.invincible * 12) % 2 === 0;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(Math.atan2(player.facing.y, player.facing.x));
    ctx.globalAlpha = flashing ? 0.4 : 1;
    ctx.fillStyle = '#7fd3ff';
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-12, 11);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-12, -11);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#4fc3f7';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;

    const magnetR = player.baseMagnet * player.magnetMult;
    ctx.strokeStyle = 'rgba(124,77,255,0.15)';
    ctx.beginPath();
    ctx.arc(player.x, player.y, magnetR, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawEnemies() {
    enemies.forEach(e => {
      if (e.dead) return;
      ctx.fillStyle = e.hitFlash > 0 ? '#fff' : (e.elite ? '#ff5252' : '#e57373');
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.fill();
      const barW = e.r * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(e.x - barW / 2, e.y - e.r - 10, barW, 4);
      ctx.fillStyle = '#4caf50';
      ctx.fillRect(e.x - barW / 2, e.y - e.r - 10, barW * clamp(e.hp / e.maxHp, 0, 1), 4);
    });
  }

  function drawProjectiles() {
    ctx.fillStyle = '#ffd54a';
    projectiles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawOrbs() {
    orbs.forEach(o => {
      ctx.fillStyle = '#7c4dff';
      ctx.beginPath();
      ctx.arc(o.x, o.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#c9b6ff';
      ctx.stroke();
    });
  }

  function drawParticles() {
    particles.forEach(p => {
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
      ctx.globalAlpha = 1;
    });
  }

  function render() {
    drawArenaBackground();
    drawOrbs();
    drawEnemies();
    drawProjectiles();
    drawParticles();
    drawPlayer();
  }

  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  const stickBase = document.getElementById('stick-base');
  const stickKnob = document.getElementById('stick-knob');
  let stickId = null;
  function stickMove(clientX, clientY) {
    const rect = stickBase.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    let dx = clientX - cx, dy = clientY - cy;
    const max = rect.width / 2;
    const len = Math.hypot(dx, dy);
    if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
    stickKnob.style.left = `${28 + dx}px`;
    stickKnob.style.top = `${28 + dy}px`;
    stick.active = true;
    stick.dx = dx / max; stick.dy = dy / max;
  }
  function stickReset() {
    stick.active = false; stick.dx = 0; stick.dy = 0;
    stickKnob.style.left = '28px'; stickKnob.style.top = '28px';
    stickId = null;
  }
  stickBase.addEventListener('touchstart', (e) => {
    e.preventDefault();
    stickId = e.changedTouches[0].identifier;
    stickMove(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
  }, { passive: false });
  stickBase.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === stickId) stickMove(t.clientX, t.clientY);
  }, { passive: false });
  window.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) if (t.identifier === stickId) stickReset();
  });

  startBtn.addEventListener('click', () => {
    startOverlay.classList.add('hidden');
    resetGame();
  });
  restartBtn.addEventListener('click', () => {
    gameoverOverlay.classList.add('hidden');
    resetGame();
  });

  gameState = 'menu';
  let lastT = performance.now();
  function loop(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    if (gameState !== 'menu') update(dt);
    if (gameState !== 'menu') render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
