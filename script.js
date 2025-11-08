// script.js - Hechicero shooter

// Config
const GAME_TIME = 120; // seconds
const ENEMY_SPAWN = 1300; // ms
const ENEMY_SPEED_MIN = 60; // px/s
const ENEMY_SPEED_MAX = 160; // px/s
const PROJ_SPEED = 500; // px/s
const PLAYER_SPEED = 1050; // px/s
const MAX_LIVES = 1;

// DOM
const game = document.getElementById('game');
const player = document.getElementById('player');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const timeEl = document.getElementById('time');
const message = document.getElementById('message');
const startBtn = document.getElementById('start');
const pauseBtn = document.getElementById('pause');
const resetBtn = document.getElementById('reset');
const exportBtn = document.getElementById('export');

const sndShoot = document.getElementById('sndShoot');
const sndHit = document.getElementById('sndHit');
const sndDeath = document.getElementById('sndDeath');
const sndStart = document.getElementById('sndStart');
const sndBg = document.getElementById('sndBg');

let score = 0;
let lives = MAX_LIVES;
let timeLeft = GAME_TIME;
let lastTime = null;
let running = false;
let paused = false;
let keys = {};
let projectiles = [];
let enemies = [];
let enemyTimer = 0;
let spawnInterval = ENEMY_SPAWN;

// load saved best score
const BEST_KEY = 'magic_shooter_best_v1';
let best = parseInt(localStorage.getItem(BEST_KEY) || '0');

// initialize UI
scoreEl.textContent = score;
livesEl.textContent = lives;
timeEl.textContent = timeLeft;

// helpers: create DOM elements
function createProjectile(x,y){
  const el = document.createElement('img');
  el.src = 'proj.svg';
  el.className = 'projectile';
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  game.appendChild(el);
  return {el, x, y, vy: -PROJ_SPEED};
}

function createEnemy(x,y, speed){
  const el = document.createElement('img');
  el.src = 'enemy.svg';
  el.className = 'enemy';
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  game.appendChild(el);
  return {el, x, y, speed};
}

// input
window.addEventListener('keydown', (e) => {
  // evitar que las teclas de juego hagan scroll u otras acciones por defecto
  if (['ArrowLeft','ArrowRight','Space','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyS'].includes(e.code)) {
    e.preventDefault();
  }
  keys[e.code] = true;
});

window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

window.addEventListener('load', () => {
  try {
    // intenta dar foco automáticamente al área de juego
    game.setAttribute('tabindex', '0');
    game.focus();
  } catch(e){}
});

// también enfocar al hacer clic dentro del área (útil en móviles/trackpads)
game.addEventListener('click', () => {
  try { game.focus(); } catch(e){}
});

// start, pause, reset
startBtn.addEventListener('click', ()=>{ if(!running) startGame(); else { paused = false; }});
pauseBtn.addEventListener('click', ()=>{ paused = !paused; if(paused) message.textContent='Pausado'; else message.textContent=''; });
resetBtn.addEventListener('click', resetGame);
exportBtn.addEventListener('click', exportProject);

// export project (current state) as index.html that includes the same files structure
function exportProject(){
  const content = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Atrapa la Estrella - Exportado</title><link rel="stylesheet" href="style.css"></head><body>
<div class="container"><header><h1>Hechicero — Juego Exportado</h1></header>
<div class="info"><div>Puntos: <span id="score">0</span></div><div>Vidas: <span id="lives">3</span></div><div>Tiempo: <span id="time">60</span></div></div>
<div id="game" class="game"><img id="player" src="player.svg" class="player"></div>
<script src="script.js"></script></div></body></html>`;
  const blob = new Blob([content], {type:'text/html'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'index.html';
  document.body.appendChild(a); a.click(); a.remove();
}

// game loop and logic
function startGame(){
  running = true; paused=false;
  score=0; lives=MAX_LIVES; timeLeft=GAME_TIME;
  scoreEl.textContent=score; livesEl.textContent=lives; timeEl.textContent=timeLeft;
  message.textContent='';
  // play start sound and bg
  try{ sndStart.currentTime=0; sndStart.play(); sndBg.currentTime=0; sndBg.play(); }catch(e){}
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function resetGame(){
  running=false; paused=false;
  // remove dynamic elements
  projectiles.forEach(p=>p.el.remove()); enemies.forEach(en=>en.el.remove());
  projectiles=[]; enemies=[];
  score=0; lives=MAX_LIVES; timeLeft=GAME_TIME;
  scoreEl.textContent=score; livesEl.textContent=lives; timeEl.textContent=timeLeft;
  message.textContent='Listo. Presiona Iniciar.';
  try{ sndBg.pause(); sndBg.currentTime=0; }catch(e){}
  // center player
  centerPlayer();
}

function centerPlayer(){
  const rect = game.getBoundingClientRect();
  player.style.left = (rect.width/2 - player.clientWidth/2) + 'px';
  player.style.bottom = '18px';
}

function loop(now){
  if(!running || paused){ lastTime=now; requestAnimationFrame(loop); return; }
  const dt = (now - lastTime)/1000; lastTime = now;
  // update time
  timeLeft -= dt;
  if(timeLeft <= 0){ endGame(); return; }
  timeEl.textContent = Math.floor(timeLeft);
  // handle input (left/right)
  handleInput(dt);
  // spawn enemies
  enemyTimer += dt*1000;
  if(enemyTimer >= spawnInterval){
    enemyTimer = 0;
    spawnEnemy();
    if(spawnInterval > 600) spawnInterval -= 8;
  }
  // update projectiles
  updateProjectiles(dt);
  // update enemies
  updateEnemies(dt);
  // collision detection
  checkCollisions();
  requestAnimationFrame(loop);
}

function handleInput(dt){
  const rect = game.getBoundingClientRect();
  let x = player.offsetLeft + player.clientWidth/2;
  if(keys['ArrowLeft'] || keys['KeyA']){
    x -= PLAYER_SPEED * dt;
  }
  if(keys['ArrowRight'] || keys['KeyD']){
    x += PLAYER_SPEED * dt;
  }
  // clamp
  x = Math.max(player.clientWidth/2, Math.min(rect.width - player.clientWidth/2, x));
  player.style.left = (x - player.clientWidth/2) + 'px';
  // shoot with space
  if(keys['Space']){
    if(!player._cooldown || performance.now() - player._cooldown > 220){
      shoot();
      player._cooldown = performance.now();
    }
  }
}

function shoot(){
  const rect = game.getBoundingClientRect();
  const x = player.offsetLeft + player.clientWidth/2;
  const y = rect.height - player.clientHeight - 10;
  const el = document.createElement('img');
  el.src = 'proj.svg';
  el.className = 'projectile';
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  game.appendChild(el);
  const proj = {el, x, y, vy: -PROJ_SPEED};
  projectiles.push(proj);
  try{ sndShoot.currentTime=0; sndShoot.play(); }catch(e){}
}

function updateProjectiles(dt){
  for(let i=projectiles.length-1;i>=0;i--){
    const p = projectiles[i];
    p.y += p.vy * dt;
    p.el.style.top = p.y + 'px';
    if(p.y < -40){
      p.el.remove();
      projectiles.splice(i,1);
    }
  }
}

function spawnEnemy(){
  const rect = game.getBoundingClientRect();
  const x = Math.random()*(rect.width - 80) + 40;
  const y = -40;
  const speed = ENEMY_SPEED_MIN + Math.random()*(ENEMY_SPEED_MAX - ENEMY_SPEED_MIN);
  const el = document.createElement('img');
  el.src = 'enemy.svg';
  el.className = 'enemy';
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  game.appendChild(el);
  enemies.push({el, x, y, speed});
}

function updateEnemies(dt){
  for(let i=enemies.length-1;i>=0;i--){
    const en = enemies[i];
    en.y += en.speed * dt;
    en.el.style.top = en.y + 'px';
    // if reaches bottom -> damage player
    const rect = game.getBoundingClientRect();
    if(en.y > rect.height + 40){
      en.el.remove();
      enemies.splice(i,1);
      loseLife();
    }
  }
}

function checkCollisions(){
  for(let i=enemies.length-1;i>=0;i--){
    const en = enemies[i];
    const er = en.el.getBoundingClientRect();
    for(let j=projectiles.length-1;j>=0;j--){
      const p = projectiles[j];
      const pr = p.el.getBoundingClientRect();
      if(rectsOverlap(er, pr)){
        try{ sndHit.currentTime=0; sndHit.play(); }catch(e){}
        en.el.remove(); enemies.splice(i,1);
        p.el.remove(); projectiles.splice(j,1);
        score += 10; scoreEl.textContent = score;
        break;
      }
    }
    const pr = player.getBoundingClientRect();
    if(rectsOverlap(er, pr)){
      en.el.remove(); enemies.splice(i,1);
      loseLife();
    }
  }
}

function rectsOverlap(a,b){
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

function loseLife(){
  lives -= 1;
  livesEl.textContent = lives;
  try{ sndDeath.currentTime=0; sndDeath.play(); }catch(e){}
  if(lives <= 0){
    endGame();
  }
}

function endGame(){
  running = false;
  message.textContent = `Juego terminado. Puntuación: ${score}`;
  try{ sndBg.pause(); sndBg.currentTime=0; }catch(e){}
  if(score > best){ best = score; localStorage.setItem(BEST_KEY, String(best)); message.textContent += ' — Nuevo récord!'; }
}

// window resize center player
window.addEventListener('resize', centerPlayer);
window.addEventListener('load', centerPlayer);
game.addEventListener('click', ()=> game.focus());
centerPlayer();