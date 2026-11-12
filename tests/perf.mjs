import { createCanvas } from '@napi-rs/canvas';
const W=1920,H=1080;
globalThis.document={createElement:(t)=>t==='canvas'?createCanvas(2,2):{},addEventListener(){},body:{}};
globalThis.window={innerWidth:W,innerHeight:H,addEventListener(){},devicePixelRatio:1};
const {Game}=await import('../src/game.js');
const {FX}=await import('../src/fx.js');
const canvas=createCanvas(W,H); const ctx=canvas.getContext('2d'); const fx=new FX();
const input={keys:new Set(),justPressed:new Set(),mouse:{x:900,y:400,down:false},isTouch:false,
 moveStick:{active:false,id:null,ox:0,oy:0,x:0,y:0,mag:0,dx:0,dy:0},aimStick:{active:false,id:null,ox:0,oy:0,x:0,y:0,mag:0,dx:0,dy:0,angle:0},
 down(){return false},pressed(){return false},press(){},endFrame(){}};
const g=new Game({width:W,height:H,fx,audio:null,input,best:0,callbacks:{onUpgrade(){},onBanner(){},onFlash(){},onState(){},onHud(){},onGameOver(){}}});
g.dpr=1; g.startRun();
g.wave=25;
const types=['drifter','spitter','dasher','splitter','bulwark'];
for(let i=0;i<65;i++){ const e=g.spawnEnemy(types[i%types.length], 160+ (i*137)%(W-320), 160+(i*211)%(H-320)); e.spawnT=0; if(i%7===0) e.elite=true; }
g.player.hp=1e9; g.player.maxHp=1e9;
// насыщаем частицами
for(let i=0;i<900;i++) fx.burst(Math.random()*W, Math.random()*H, 1, '#5ef1ff', {speed:200,size:4,life:0.9});
for(let i=0;i<60;i++) g.ebullet(Math.random()*W, Math.random()*H, Math.random()*6.28, 200, 1);
for(let i=0;i<60;i++) g.bullets.push({x:Math.random()*W,y:Math.random()*H,vx:800,vy:-300,angle:0,r:5,damage:1,pierce:1,bounces:0,life:2,explosive:0,color:'#8ffbff',hitSet:null,trailT:0});
for(let i=0;i<40;i++) fx.ring(Math.random()*W,Math.random()*H,'#ffffff',{r1:80,life:1});
for(let i=0;i<30;i++) fx.text(Math.random()*W,Math.random()*H,'99','#fff',14);
for(let i=0;i<25;i++) g.spawnPickup(Math.random()*W,Math.random()*H);
for(let i=0;i<120;i++) g.spawnOrb(Math.random()*W,Math.random()*H,1);

for(let i=0;i<60;i++){ g.update(1/60); g.render(ctx); }
const N=240; const t0=performance.now();
for(let i=0;i<N;i++){ g.update(1/60); g.render(ctx); }
const per=(performance.now()-t0)/N;
console.log('врагов:',g.enemies.length,'частиц:',fx.particles.length,'колец:',fx.rings.length,'пуль:',g.bullets.length+g.ebullets.length,'орбов:',g.orbs.length);
console.log('update+render 1920×1080 (CPU):', per.toFixed(2),'мс →', Math.round(1000/per),'fps');
