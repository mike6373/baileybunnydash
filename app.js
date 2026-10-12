const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d', { alpha: false });
const scoreNode = document.querySelector('#score');
const carrotsNode = document.querySelector('#carrots');
const overlay = document.querySelector('#overlay');
const panel = document.querySelector('#panel');
const startButton = document.querySelector('#start');
const bunny = new Image();
bunny.src = 'uploads/bailey.png';
const sounds = {
  carrot: new Audio('sfx/carrot.wav'),
  jump: new Audio('sfx/jump.wav'),
  hit: new Audio('sfx/hit.wav')
};
Object.values(sounds).forEach(sound => { sound.preload = 'auto'; sound.volume = 0.55; });
function playSound(name) {
  const sound = sounds[name];
  sound.currentTime = 0;
  sound.play().catch(() => {});
}

const W = 360, H = 640;
let dpr = 1;
let mode = 'ready';
let last = 0, elapsed = 0, score = 0, carrots = 0, spawnClock = 0;
let lane = 1, jump = 0, slide = 0, world = 0, speed = 1;
let objects = [];
let touchStart = null;

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize);
resize();

function roadPoint(l, y) {
  const t = Math.max(0, Math.min(1, (y - 142) / (H - 142)));
  const half = 75 + t * 94;
  const center = W / 2;
  return { x: center + (l - 1) * half * .66, half, t };
}
function laneX(l, y) { return roadPoint(l, y).x; }
function rect(x,y,w,h,color) { ctx.fillStyle=color; ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h)); }

function drawBackground() {
  rect(0,0,W,H,'#201d50');
  rect(0,0,W,190,'#29255e');
  // sunset bands and blocky skyline
  rect(22,78,316,4,'#ff786c'); rect(43,91,274,4,'#ff786c');
  rect(0,123,36,82,'#3c3876'); rect(8,108,24,17,'#3c3876');
  rect(37,147,34,83,'#34316c'); rect(44,132,19,15,'#34316c');
  rect(285,128,35,99,'#34316c'); rect(292,112,20,16,'#34316c');
  rect(325,147,35,68,'#3c3876');
  for (let x=8;x<360;x+=13) { rect(x,140+((x*17)%48),3,3,'#f9d44b'); }
  // distant mountains
  ctx.fillStyle='#514985'; ctx.beginPath(); ctx.moveTo(0,198); ctx.lineTo(78,142); ctx.lineTo(135,198); ctx.lineTo(211,135); ctx.lineTo(285,199); ctx.lineTo(328,160); ctx.lineTo(360,190); ctx.lineTo(360,245); ctx.lineTo(0,245); ctx.fill();
  // track perspective
  ctx.fillStyle='#292453'; ctx.beginPath(); ctx.moveTo(105,142); ctx.lineTo(255,142); ctx.lineTo(360,640); ctx.lineTo(0,640); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#38315e'; ctx.beginPath(); ctx.moveTo(110,142); ctx.lineTo(250,142); ctx.lineTo(331,640); ctx.lineTo(29,640); ctx.closePath(); ctx.fill();
  // sleepers moving toward the player
  for (let i=0;i<12;i++) {
    const y=154+((i*48+world*170)%500), t=(y-142)/(H-142), p=roadPoint(0,y);
    const w=12+t*205;
    rect(W/2-w/2,y,w,Math.max(2,2+t*8),'#4c416f');
  }
  // rails and lane dashes
  for (const side of [-1,1]) {
    const x1=W/2+side*72, x2=W/2+side*169;
    rect(x1,142,3,498,'#f9d44b'); rect(x2,142,4,498,'#f9d44b');
    rect(x1-4,142,2,498,'#ff786c'); rect(x2+4,142,2,498,'#ff786c');
  }
  for (const divider of [-.5,.5]) {
    for(let i=0;i<9;i++) {
      const y=160+((i*66+world*155)%470), t=(y-142)/(H-142), x=W/2+divider*(75+t*94)*.66;
      rect(x,y,Math.max(2,2+t*3),Math.max(5,5+t*12),'#8074a2');
    }
  }
  // tiny verge blocks
  for(let i=0;i<8;i++) {
    const y=160+((i*73+world*110)%480), t=(y-142)/(H-142), offset=174+t*125;
    rect(W/2-offset,y,Math.max(3,4+t*6),Math.max(3,4+t*6),i%2?'#ff786c':'#f9d44b');
    rect(W/2+offset,y,Math.max(3,4+t*6),Math.max(3,4+t*6),i%2?'#71e3d5':'#ff786c');
  }
}

function drawCarrot(x,y,s) {
  const u=s/10;
  rect(x-3*u,y-4*u,6*u,3*u,'#f9d44b');
  rect(x-4*u,y-2*u,8*u,3*u,'#ff786c');
  rect(x-3*u,y+u,6*u,2*u,'#ff786c');
  rect(x-2*u,y+3*u,4*u,2*u,'#ff786c');
  rect(x-1*u,y+5*u,2*u,2*u,'#ff786c');
  rect(x-2*u,y-7*u,2*u,3*u,'#71e3d5'); rect(x+1*u,y-7*u,2*u,3*u,'#71e3d5');
}
function drawObject(o) {
  const t=Math.max(.15,(o.y-142)/(H-142)), x=laneX(o.lane,o.y), s=.32+t*.95;
  if(o.kind==='carrot') { drawCarrot(x,o.y,12*s); return; }
  const w=(o.kind==='train'?54:42)*s, h=(o.kind==='train'?95:38)*s;
  if(o.kind==='barrier') {
    rect(x-w/2,o.y-h,w,h,'#ff786c'); rect(x-w/2,o.y-h,w,Math.max(3,6*s),'#f9d44b');
    rect(x-w/2+5*s,o.y-h+10*s,w-10*s,5*s,'#f9d44b');
    rect(x-w/2+4*s,o.y-5*s,7*s,7*s,'#17143d'); rect(x+w/2-11*s,o.y-5*s,7*s,7*s,'#17143d');
  } else if(o.kind==='train') {
    rect(x-w/2,o.y-h,w,h,'#e95668'); rect(x-w/2+5*s,o.y-h+7*s,w-10*s,18*s,'#f9d44b');
    rect(x-w/2+10*s,o.y-h+11*s,8*s,8*s,'#292453'); rect(x+w/2-18*s,o.y-h+11*s,8*s,8*s,'#292453');
    rect(x-w/2+8*s,o.y-h+34*s,w-16*s,25*s,'#b94468');
    rect(x-w/2-4*s,o.y-6*s,w+8*s,7*s,'#f9d44b');
  } else {
    rect(x-w/2,o.y-h,w,8*s,'#71e3d5'); rect(x-w/2+5*s,o.y-h+8*s,7*s,h-8*s,'#f9d44b');
    rect(x+w/2-12*s,o.y-h+8*s,7*s,h-8*s,'#f9d44b');
    rect(x-w/2+5*s,o.y-h+20*s,w-10*s,5*s,'#ff786c');
  }
}
function drawBunny() {
  const y=477 - Math.sin(jump*Math.PI)*72;
  const x=laneX(lane,570), width=91, height=147;
  if(jump>0) {
    const shadow=1-jump*.55; ctx.globalAlpha=shadow;
    rect(x-26,617,52,7,'#19163f'); ctx.globalAlpha=1;
  }
  if(bunny.complete && bunny.naturalWidth) {
    if(slide>0) { ctx.drawImage(bunny, x-width/2, y+52, width, height*.57); }
    else ctx.drawImage(bunny, x-width/2, y, width, height);
  } else {
    rect(x-19,y,38,66,'#f9d44b'); rect(x-15,y-19,11,24,'#ff786c'); rect(x+4,y-19,11,24,'#ff786c');
  }
}
function render() {
  ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0); ctx.imageSmoothingEnabled=false;
  drawBackground();
  const sorted=[...objects].sort((a,b)=>a.y-b.y);
  for(const o of sorted) drawObject(o);
  drawBunny();
  // scanline texture
  ctx.globalAlpha=.10;
  for(let y=2;y<H;y+=4) rect(0,y,W,1,'#10102d');
  ctx.globalAlpha=1;
}

function reset() { elapsed=0; score=0; carrots=0; spawnClock=.45; lane=1; jump=0; slide=0; world=0; speed=1; objects=[]; updateHud(); }
function updateHud() { scoreNode.textContent=String(Math.floor(score)).padStart(6,'0'); carrotsNode.textContent=String(carrots).padStart(2,'0'); }
function start() { reset(); mode='playing'; overlay.classList.add('hidden'); last=performance.now(); requestAnimationFrame(loop); }
function endGame() {
  mode='over';
  panel.innerHTML=`<div class="eyebrow">★ RUN OVER ★</div><h1>${Math.floor(score)}<br><span>PTS</span></h1><p class="prompt">CARROTS: ${String(carrots).padStart(2,'0')}</p><button id="restart">RUN AGAIN</button><div class="controls">TAP TO TRY AGAIN</div>`;
  overlay.classList.remove('hidden'); document.querySelector('#restart').addEventListener('click',start,{once:true});
}
function spawn() {
  const laneIndex=Math.floor(Math.random()*3), roll=Math.random();
  const hazard=()=>({kind:Math.random()<.48?'barrier':Math.random()<.55?'train':'arch',y:145});
  if(roll<.24) objects.push({kind:'carrot',lane:laneIndex,y:145});
  else objects.push({...hazard(),lane:laneIndex});
  if(Math.random()<.2) objects.push({kind:'carrot',lane:(laneIndex+1+Math.floor(Math.random()*2))%3,y:145});
  // Later runs sometimes close two tracks at once, always leaving one clear path.
  const wallChance=Math.min(.34,Math.max(0,(elapsed-12)*.004));
  if(elapsed>12 && roll>=.24 && Math.random()<wallChance) {
    const safeLane=(laneIndex+1+Math.floor(Math.random()*2))%3;
    for(let l=0;l<3;l++) if(l!==laneIndex && l!==safeLane) objects.push({...hazard(),lane:l});
  }
}
function loop(now) {
  if(mode!=='playing') return;
  const dt=Math.min(.04,(now-last)/1000); last=now; elapsed+=dt; world+=dt*speed;
  const pressure=Math.min(elapsed/90,1);
  speed=1+pressure*.68; score+=dt*12*speed;
  if(jump>0) jump=Math.max(0,jump-dt/0.72);
  if(slide>0) slide=Math.max(0,slide-dt/0.68);
  spawnClock-=dt;
  if(spawnClock<=0) {
    spawn();
    spawnClock=1.22-pressure*.42+Math.random()*.2;
  }
  const obstacleSpeed=260+pressure*175;
  for(const o of objects) o.y+=dt*obstacleSpeed;
  for(const o of objects) {
    if(o.hit || Math.abs(o.y-570)>22 || o.lane!==lane) continue;
    if(o.kind==='carrot') { o.hit=true; carrots++; score+=50; playSound('carrot'); }
    else if(o.kind==='barrier' && jump>0.22) continue;
    else if(o.kind==='arch' && slide>0.2) continue;
    else if(o.kind==='train') { playSound('hit'); endGame(); render(); return; }
    else if(o.kind==='barrier' || o.kind==='arch') { playSound('hit'); endGame(); render(); return; }
  }
  objects=objects.filter(o=>o.y<690&&!o.hit);
  updateHud(); render(); requestAnimationFrame(loop);
}
function move(dx,dy=0) {
  if(mode!=='playing') return;
  if(dx) lane=Math.max(0,Math.min(2,lane+dx));
  if(dy<0) { if(jump===0) { jump=1; slide=0; playSound('jump'); } }
  if(dy>0) { slide=1; jump=0; }
}
startButton.addEventListener('click',start);
overlay.addEventListener('click',e=>{ if(mode==='over' && e.target===overlay) start(); });
window.addEventListener('keydown',e=>{
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)) e.preventDefault();
  if(mode!=='playing' && (e.key==='Enter'||e.key===' ')) { start(); return; }
  if(e.key==='ArrowLeft'||e.key==='a') move(-1);
  if(e.key==='ArrowRight'||e.key==='d') move(1);
  if(e.key==='ArrowUp'||e.key==='w'||e.key===' ') move(0,-1);
  if(e.key==='ArrowDown'||e.key==='s') move(0,1);
});
canvas.addEventListener('pointerdown',e=>{ touchStart={x:e.clientX,y:e.clientY}; });
canvas.addEventListener('pointerup',e=>{
  if(!touchStart) return;
  const dx=e.clientX-touchStart.x, dy=e.clientY-touchStart.y;
  if(Math.max(Math.abs(dx),Math.abs(dy))<22) { if(mode!=='playing') start(); else move(0,-1); }
  else if(Math.abs(dx)>Math.abs(dy)) move(dx>0?1:-1); else move(0,dy>0?1:-1);
  touchStart=null;
});
reset(); render();
