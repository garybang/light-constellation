// Light Constellation — Multi-Theme Gravity Edition
// 마우스 = 중력 중심 / 클릭 = 중력장 반전 / 입자 간 상호 인력 = 카오스

// ============================================================
// 상수
// ============================================================
const NUM_PARTICLES = 960;
const CONNECTION_DIST = 38;
const MOUSE_GLOW_RADIUS = 350;
const CELL_SIZE = 60;
const MAX_VEL = 3;
const FRICTION = 0.97;
const MAX_ACC = 0.3;

// ============================================================
// 테마 레지스트리
// ============================================================
const THEMES = {
  bauhaus: {
    name: 'Bauhaus',
    background: { h: 0, s: 0, b: 100 },
    palette: [
      { color: { h: 0,   s: 95, b: 95  }, weight: 0.60 },
      { color: { h: 50,  s: 95, b: 100 }, weight: 0.20 },
      { color: { h: 220, s: 90, b: 90  }, weight: 0.20 },
    ],
    colorJitter: 5,
    shapes: [
      { type: 0, weight: 0.55 },
      { type: 1, weight: 0.25 },
      { type: 2, weight: 0.20 },
    ],
    connection: { strokeWeight: 0.6, maxAlpha: 15, color: { h: 0, s: 0, b: 0 } },
    drawShape: null,
    drawCursor: null,
    drawGravityField: null,
    drawPressWave: null,
  },
  basquiat: {
    name: 'Basquiat',
    background: { h: 30, s: 15, b: 8 },
    palette: [
      { color: { h: 55,  s: 95, b: 100 }, weight: 0.30 },
      { color: { h: 0,   s: 90, b: 90  }, weight: 0.25 },
      { color: { h: 195, s: 70, b: 90  }, weight: 0.20 },
      { color: { h: 25,  s: 60, b: 40  }, weight: 0.10 },
      { color: { h: 0,   s: 0,  b: 100 }, weight: 0.15 },
    ],
    colorJitter: 8,
    shapes: [
      { type: 0, weight: 0.40 },
      { type: 1, weight: 0.35 },
      { type: 2, weight: 0.25 },
    ],
    connection: { strokeWeight: 1.0, maxAlpha: 20, color: { h: 0, s: 0, b: 100 } },
    drawShape: '_drawShapeBasquiat',
    drawCursor: '_drawCursorBasquiat',
    drawGravityField: '_drawGravityFieldBasquiat',
    drawPressWave: '_drawPressWaveBasquiat',
  },
  margiela: {
    name: 'Margiela',
    background: { h: 40, s: 5, b: 96 },
    palette: [
      { color: { h: 30, s: 10, b: 38  }, weight: 0.30 },   // warm dark gray
      { color: { h: 0,  s: 0,  b: 28  }, weight: 0.25 },   // charcoal
      { color: { h: 35, s: 15, b: 50  }, weight: 0.25 },   // dark taupe
      { color: { h: 0,  s: 0,  b: 60  }, weight: 0.20 },   // mid gray
    ],
    colorJitter: 5,
    shapes: [
      { type: 0, weight: 0.40 },
      { type: 1, weight: 0.35 },
      { type: 2, weight: 0.25 },
    ],
    connection: { strokeWeight: 0.6, maxAlpha: 22, color: { h: 0, s: 0, b: 40 } },
    drawShape: '_drawShapeMargiela',
    drawCursor: '_drawCursorMargiela',
    drawGravityField: '_drawGravityFieldMargiela',
    drawPressWave: '_drawPressWaveMargiela',
  },
};

// ============================================================
// 글로벌 상태
// ============================================================
let particles = [];
let spatialGrid;
let time = 0;

let gravityField = 1;
let gravityStrength = 1;
let targetGravity = 1;

let mouseActivity = 0;
let _prevMouseX = -1;
let _prevMouseY = -1;

let isPressed = false;
let pressWave = 0;
let pressX = 0, pressY = 0;

// 숫자 캐시 (Margiela 성능 최적화)
let _digitCache = [];

// 테마 상태
let currentThemeKey = 'bauhaus';
let currentTheme = THEMES.bauhaus;
let themeTransition = 0;
let _bgCurrent = { h: 0, s: 0, b: 100 };
let _bgFrom = { h: 0, s: 0, b: 100 };
let _bgTarget = { h: 0, s: 0, b: 100 };

// ============================================================
// 유틸리티
// ============================================================
function _pickFromWeighted(items) {
  let r = random();
  let cumulative = 0;
  for (let item of items) {
    cumulative += item.weight;
    if (r < cumulative) return item;
  }
  return items[items.length - 1];
}

function _dispatchDraw(key, defaultFn, ...args) {
  let fnName = currentTheme[key];
  if (fnName && typeof window[fnName] === 'function') {
    window[fnName](...args);
  } else {
    defaultFn(...args);
  }
}

function lerpHue(h1, h2, t) {
  let diff = h2 - h1;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return (h1 + diff * t + 360) % 360;
}

// ============================================================
// SpatialGrid 클래스
// ============================================================
class SpatialGrid {
  constructor(cellSize) {
    this.cellSize = cellSize;
    this.cells = {};
  }

  clear() {
    this.cells = {};
  }

  _key(cx, cy) {
    return cx + ',' + cy;
  }

  insert(index, px, py) {
    let cx = Math.floor(px / this.cellSize);
    let cy = Math.floor(py / this.cellSize);
    let key = this._key(cx, cy);
    if (!this.cells[key]) this.cells[key] = [];
    this.cells[key].push(index);
  }

  getNeighbors(px, py) {
    let cx = Math.floor(px / this.cellSize);
    let cy = Math.floor(py / this.cellSize);
    let result = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        let key = this._key(cx + dx, cy + dy);
        if (this.cells[key]) {
          for (let idx of this.cells[key]) result.push(idx);
        }
      }
    }
    return result;
  }

  getCells() {
    return this.cells;
  }
}

// ============================================================
// Particle 클래스
// ============================================================
class Particle {
  constructor(index) {
    this.index = index;

    this.pos = createVector(random(width), random(height));
    this.drawPos = this.pos.copy();
    this.vel = createVector(random(-0.5, 0.5), random(-0.5, 0.5));
    this.acc = createVector(0, 0);

    let sizeRoll = random();
    if (sizeRoll < 0.70) this.baseSize = random(3, 6);
    else if (sizeRoll < 0.95) this.baseSize = random(7, 12);
    else this.baseSize = random(14, 20);
    this.mass = this.baseSize * 0.15;
    this.speedFactor = map(this.baseSize, 3, 20, 1.4, 0.4);

    this.noiseOffX = random(10000);
    this.noiseOffY = random(10000);

    this.rotation = random(TWO_PI);
    this.rotSpeed = random(-0.012, 0.012);

    // 도형/색상: currentTheme 참조
    this.shape = _pickFromWeighted(currentTheme.shapes).type;
    let picked = _pickFromWeighted(currentTheme.palette);
    this.color = {
      h: picked.color.h + random(-currentTheme.colorJitter, currentTheme.colorJitter),
      s: picked.color.s,
      b: picked.color.b,
    };

    // Margiela 숫자용
    this._digit = floor(random(10));

    // 전환용
    this._fromColor = null;
    this._targetColor = null;
    this._targetShape = this.shape;

    // Idle 구형 배치용
    this._idleTheta = random(TWO_PI);
    this._idlePhi   = random(PI);
    this._idleSpeed = random(0.002, 0.006);
  }
}

// ============================================================
// 테마 전환
// ============================================================
function switchTheme(themeKey) {
  if (currentThemeKey === themeKey) return;

  let newTheme = THEMES[themeKey];

  for (let p of particles) {
    p._fromColor = { h: p.color.h, s: p.color.s, b: p.color.b };
    let picked = _pickFromWeighted(newTheme.palette);
    p._targetColor = {
      h: picked.color.h + random(-newTheme.colorJitter, newTheme.colorJitter),
      s: picked.color.s,
      b: picked.color.b,
    };
    p._targetShape = _pickFromWeighted(newTheme.shapes).type;
  }

  _bgFrom = { h: _bgCurrent.h, s: _bgCurrent.s, b: _bgCurrent.b };
  _bgTarget = { h: newTheme.background.h, s: newTheme.background.s, b: newTheme.background.b };

  currentThemeKey = themeKey;
  currentTheme = newTheme;
  themeTransition = 1.0;

  _updateThemeSwitcherUI();
}

function _updateThemeSwitcherUI() {
  let keys = Object.keys(THEMES);
  let isDark = currentThemeKey === 'basquiat';
  for (let key of keys) {
    let td = document.getElementById('btn-' + key);
    if (!td) continue;
    if (key === currentThemeKey) {
      td.className = 'active';
    } else {
      td.className = '';
    }
  }
  let table = document.querySelector('#theme-switcher table');
  if (table) {
    table.className = isDark ? 'dark' : '';
  }
}

// ============================================================
// 기본(Bauhaus) 렌더러
// ============================================================
function _drawShapeDefault(p, size, hue, sat, bri, alpha) {
  if (p.baseSize >= 14) {
    stroke(0, 0, 0, 80);
    strokeWeight(2);
  } else if (p.baseSize >= 7) {
    stroke(0, 0, 0, 60);
    strokeWeight(0.8);
  } else {
    noStroke();
  }

  fill(hue, sat, bri, alpha);
  if (p.shape === 0) {
    ellipse(0, 0, size * 1.3);
  } else if (p.shape === 1) {
    let r = size * 0.8;
    triangle(0, -r, -r * 0.866, r * 0.5, r * 0.866, r * 0.5);
  } else {
    rectMode(CENTER);
    rect(0, 0, size * 1.2, size * 1.2);
  }
}

function _drawCursorDefault() {
  let cursorHue = gravityStrength > 0 ? 0 : 220;
  let pressed = isPressed;

  push();
  translate(mouseX, mouseY);

  noFill();
  stroke(0, 0, 0, 80);
  strokeWeight(pressed ? 1.8 : 1.2);
  ellipse(0, 0, pressed ? 32 : 22);

  let ext = pressed ? 24 : 16;
  let gap = pressed ? 18 : 13;
  stroke(0, 0, 0, 60);
  strokeWeight(pressed ? 1.2 : 0.8);
  line(-ext, 0, -gap, 0);
  line(gap, 0, ext, 0);
  line(0, -ext, 0, -gap);
  line(0, gap, 0, ext);

  noStroke();
  fill(cursorHue, 90, 95, 90);
  let tr = pressed ? 5 : 3.5;
  triangle(0, -tr, -tr * 0.866, tr * 0.5, tr * 0.866, tr * 0.5);

  fill(0, 0, 0, 90);
  ellipse(0, 0, pressed ? 3 : 2);

  pop();
}

function _drawGravityFieldDefault() {
  let hue = gravityStrength > 0 ? 0 : 220;
  let intensity = abs(gravityStrength);
  noFill();

  rectMode(CENTER);
  for (let i = 0; i < 4; i++) {
    let size = 80 + i * 70;
    let alpha = map(i, 0, 3, 12 * intensity, 2 * intensity);
    stroke(hue, 25, 50, alpha);
    strokeWeight(0.5);
    push();
    translate(mouseX, mouseY);
    rotate(i * PI / 16 + time * 0.3);
    rect(0, 0, size, size);
    pop();
  }

  stroke(0, 0, 50, 6 * intensity);
  strokeWeight(0.3);
  line(mouseX - 200, mouseY, mouseX + 200, mouseY);
  line(mouseX, mouseY - 200, mouseX, mouseY + 200);
}

function _drawPressWaveDefault() {
  let waveAlpha = map(pressWave, 0, 300, 0, 60);
  noFill();
  rectMode(CENTER);

  for (let i = 0; i < 3; i++) {
    let size = (300 - pressWave) * 1.8 + i * 40;
    if (size > 0) {
      stroke(0, 0, 0, waveAlpha * (1 - i * 0.25));
      strokeWeight(1.8 - i * 0.5);
      push();
      translate(pressX, pressY);
      rotate(i * PI / 12);
      rect(0, 0, size, size);
      pop();
    }
  }
}

// ============================================================
// Basquiat 렌더러
// ============================================================
function _drawShapeBasquiat(p, size, hue, sat, bri, alpha) {
  if (p.shape === 0) {
    // 불규칙 원
    noStroke();
    fill(hue, sat, bri, alpha);
    beginShape();
    let steps = 8;
    for (let i = 0; i < steps; i++) {
      let a = (TWO_PI / steps) * i;
      let r = size * 0.7 * (1 + (noise(p.index * 0.1 + i * 0.5) - 0.5) * 0.6);
      vertex(cos(a) * r, sin(a) * r);
    }
    endShape(CLOSE);
  } else if (p.shape === 1) {
    // 찌그러진 사각형
    noStroke();
    fill(hue, sat, bri, alpha);
    let s = size * 0.6;
    let n = p.index * 0.1;
    let j = size * 0.25;
    quad(
      -s + (noise(n, 0) - 0.5) * j, -s + (noise(n, 1) - 0.5) * j,
       s + (noise(n, 2) - 0.5) * j, -s + (noise(n, 3) - 0.5) * j,
       s + (noise(n, 4) - 0.5) * j,  s + (noise(n, 5) - 0.5) * j,
      -s + (noise(n, 6) - 0.5) * j,  s + (noise(n, 7) - 0.5) * j
    );
  } else {
    // 거친 X마크
    stroke(hue, sat, bri, alpha);
    strokeWeight(max(size * 0.15, 1.2));
    noFill();
    let s = size * 0.5;
    let jx = (noise(p.index * 0.2) - 0.5) * 3;
    let jy = (noise(p.index * 0.3) - 0.5) * 3;
    line(-s + jx, -s + jy, s - jx, s - jy);
    line(-s - jy, s + jx, s + jy, -s - jx);
  }
}

function _drawCursorBasquiat() {
  push();
  translate(mouseX, mouseY);
  let s = isPressed ? 1.4 : 1;
  scale(s);

  // 크라운
  stroke(55, 95, 100, 90);
  strokeWeight(1.8);
  noFill();
  beginShape();
  vertex(-12, 6);
  vertex(-12, -2);
  vertex(-7, 2);
  vertex(0, -8);
  vertex(7, 2);
  vertex(12, -2);
  vertex(12, 6);
  endShape(CLOSE);

  // 꼭짓점 점
  fill(55, 95, 100, 90);
  noStroke();
  ellipse(0, -10, 3);
  ellipse(-8, 1, 3);
  ellipse(8, 1, 3);

  pop();
}

function _drawGravityFieldBasquiat() {
  let intensity = abs(gravityStrength);
  noFill();

  for (let i = 0; i < 3; i++) {
    let radius = 60 + i * 50;
    let alpha = map(i, 0, 2, 15 * intensity, 4 * intensity);
    stroke(0, 0, 100, alpha);
    strokeWeight(1.2);

    beginShape();
    let steps = 24;
    for (let j = 0; j <= steps; j++) {
      let a = (TWO_PI / steps) * j + time * 0.5;
      let r = radius + (noise(i * 10 + j * 0.3 + time) - 0.5) * 20;
      vertex(mouseX + cos(a) * r, mouseY + sin(a) * r);
    }
    endShape();
  }
}

function _drawPressWaveBasquiat() {
  let waveAlpha = map(pressWave, 0, 300, 0, 80);
  noFill();

  let rays = 12;
  for (let i = 0; i < rays; i++) {
    let angle = (TWO_PI / rays) * i;
    let len = (300 - pressWave) * 2;
    if (len <= 0) continue;

    stroke(55, 95, 100, waveAlpha);
    strokeWeight(1.5);

    let segments = 4;
    let segLen = len / segments;
    let px = pressX, py = pressY;
    for (let s = 1; s <= segments; s++) {
      let r = segLen * s;
      let jitter = (s % 2 === 0 ? 1 : -1) * 8;
      let perpAngle = angle + HALF_PI;
      let nx = pressX + cos(angle) * r + cos(perpAngle) * jitter;
      let ny = pressY + sin(angle) * r + sin(perpAngle) * jitter;
      line(px, py, nx, ny);
      px = nx;
      py = ny;
    }
  }
}

// ============================================================
// Margiela 렌더러
// ============================================================
function _drawShapeMargiela(p, size, hue, sat, bri, alpha) {
  let a = alpha * 0.9;

  if (p.baseSize >= 14) {
    // 대형: 숫자 + 원형 아웃라인 + 택킹 스티치 4개
    noFill();
    stroke(hue, sat, bri, a * 0.4);
    strokeWeight(0.6);
    let r = size * 0.8;
    ellipse(0, 0, size * 1.6);
    // 사방 택킹 스티치
    let tick = 3;
    line(-r - tick, 0, -r + tick, 0);
    line(r - tick, 0, r + tick, 0);
    line(0, -r - tick, 0, -r + tick);
    line(0, r - tick, 0, r + tick);
    // 숫자 (캐시 이미지)
    let s = size * 1.1;
    drawingContext.globalAlpha = a / 100;
    drawingContext.drawImage(_digitCache[p._digit].canvas, -s / 2, -s / 2, s, s);
    drawingContext.globalAlpha = 1;
  } else if (p.baseSize >= 7) {
    // 중형: 원 + 십자 스티치
    noFill();
    stroke(hue, sat, bri, a);
    strokeWeight(0.9);
    ellipse(0, 0, size * 0.9);
    let cr = size * 0.3;
    line(-cr, -cr, cr, cr);
    line(-cr, cr, cr, -cr);
  } else {
    // 소형: 십자 스티치 마크
    stroke(hue, sat, bri, a);
    strokeWeight(1.0);
    let cr = size * 0.35;
    line(-cr, 0, cr, 0);
    line(0, -cr, 0, cr);
  }
}

function _drawCursorMargiela() {
  push();
  translate(mouseX, mouseY);
  let pressed = isPressed;
  let sc = pressed ? 1.3 : 1;

  // 중앙 점
  fill(0, 0, 25, 90);
  noStroke();
  ellipse(0, 0, 3 * sc);

  // 십자 크로스헤어 (택킹 스티치 스타일)
  stroke(0, 0, 25, 75);
  strokeWeight(1.0 * sc);
  let g = 5 * sc, ext = 15 * sc;
  line(-ext, 0, -g, 0);
  line(g, 0, ext, 0);
  line(0, -ext, 0, -g);
  line(0, g, 0, ext);

  // 끝점 수직 틱 마크 (재단 표시)
  strokeWeight(0.8 * sc);
  let tick = 2.5 * sc;
  line(-ext, -tick, -ext, tick);
  line(ext, -tick, ext, tick);
  line(-tick, -ext, tick, -ext);
  line(-tick, ext, tick, ext);

  pop();
}

function _drawGravityFieldMargiela() {
  let intensity = abs(gravityStrength);
  noFill();

  // 패턴 재단 마크: 원 + 틱 마크
  let radius = 80;
  stroke(0, 0, 55, 8 * intensity);
  strokeWeight(0.4);
  ellipse(mouseX, mouseY, radius * 2);

  // 눈금 틱
  stroke(0, 0, 50, 12 * intensity);
  strokeWeight(0.6);
  let ticks = 12;
  for (let i = 0; i < ticks; i++) {
    let ang = (TWO_PI / ticks) * i + time * 0.2;
    let inner = radius - 4;
    let outer = radius + 4;
    line(
      mouseX + cos(ang) * inner, mouseY + sin(ang) * inner,
      mouseX + cos(ang) * outer, mouseY + sin(ang) * outer
    );
  }

  // 중심 십자
  stroke(0, 0, 50, 5 * intensity);
  strokeWeight(0.3);
  line(mouseX - 40, mouseY, mouseX + 40, mouseY);
  line(mouseX, mouseY - 40, mouseX, mouseY + 40);
}

function _drawPressWaveMargiela() {
  let waveAlpha = map(pressWave, 0, 300, 0, 35);
  noFill();

  for (let i = 0; i < 3; i++) {
    let size = (300 - pressWave) * 2 + i * 35;
    if (size > 0) {
      stroke(0, 0, 50, waveAlpha * (1 - i * 0.3));
      strokeWeight(0.5);
      ellipse(pressX, pressY, size);
    }
  }
}

// ============================================================
// 메인 렌더링 (디스패치)
// ============================================================
function drawParticle(p) {
  let mouseDist = dist(mouseX, mouseY, p.drawPos.x, p.drawPos.y);
  let isNear = mouseDist < MOUSE_GLOW_RADIUS;

  let brightness = isNear
    ? map(mouseDist, 0, MOUSE_GLOW_RADIUS, min(p.color.b + 10, 100), p.color.b)
    : p.color.b;
  let saturation = isNear
    ? map(mouseDist, 0, MOUSE_GLOW_RADIUS, min(p.color.s + 10, 100), p.color.s)
    : p.color.s;

  if (gravityStrength < 0) {
    brightness = min(brightness * 1.3, 100);
  }

  let speed = p.vel.mag();
  let size = p.baseSize + min(speed * 0.4, 1.5);
  let hue = ((p.color.h % 360) + 360) % 360;
  let baseAlpha = 100;

  push();
  translate(p.drawPos.x, p.drawPos.y);
  rotate(p.rotation);

  _dispatchDraw('drawShape', _drawShapeDefault, p, size, hue, saturation, brightness, baseAlpha);

  pop();
}

function drawConnections() {
  let connDist2 = CONNECTION_DIST * CONNECTION_DIST;
  let cells = spatialGrid.getCells();
  let conn = currentTheme.connection;
  strokeWeight(conn.strokeWeight);


  for (let key in cells) {
    let cell = cells[key];
    let parts = key.split(',');
    let cx = Number(parts[0]);
    let cy = Number(parts[1]);

    for (let dx = 0; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy <= 0 && !(dx === 0 && dy === 0)) continue;
        let nKey = (cx + dx) + ',' + (cy + dy);
        let neighbor = cells[nKey];
        if (!neighbor) continue;

        let isSame = (dx === 0 && dy === 0);
        for (let a = 0; a < cell.length; a++) {
          let connCount = 0;
          let startB = isSame ? a + 1 : 0;
          for (let b = startB; b < neighbor.length && connCount < 1; b++) {
            let pi = particles[cell[a]];
            let pj = particles[neighbor[b]];

            let ddx = pi.drawPos.x - pj.drawPos.x;
            let ddy = pi.drawPos.y - pj.drawPos.y;
            let d2 = ddx * ddx + ddy * ddy;

            if (d2 < connDist2) {
              let alpha = map(d2, 0, connDist2, conn.maxAlpha, 0);
              stroke(conn.color.h, conn.color.s, conn.color.b, alpha);

              line(pi.drawPos.x, pi.drawPos.y, pj.drawPos.x, pj.drawPos.y);
              connCount++;
            }
          }
        }
      }
    }
  }

}

// ============================================================
// p5.js 메인 루프
// ============================================================
function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB, 360, 100, 100, 100);
  smooth();

  _bgCurrent = { h: currentTheme.background.h, s: currentTheme.background.s, b: currentTheme.background.b };

  textFont('monospace');
  textAlign(CENTER, CENTER);

  // Margiela 숫자 캐시: 0-9를 오프스크린 버퍼에 사전 렌더링
  let dSz = 64;
  for (let d = 0; d < 10; d++) {
    let g = createGraphics(dSz, dSz);
    g.fill(80);
    g.noStroke();
    g.textFont('Palatino, Palatino Linotype, serif');
    g.textAlign(CENTER, CENTER);
    g.textSize(dSz * 0.75);
    g.text(d, dSz / 2, dSz / 2);
    _digitCache.push(g);
  }

  spatialGrid = new SpatialGrid(CELL_SIZE);
  for (let i = 0; i < NUM_PARTICLES; i++) {
    particles.push(new Particle(i));
  }
}

function draw() {
  // 테마 전환 lerp
  if (themeTransition > 0) {
    themeTransition = max(themeTransition - 0.05, 0);
    let t = 1 - themeTransition;

    _bgCurrent.h = lerpHue(_bgFrom.h, _bgTarget.h, t);
    _bgCurrent.s = lerp(_bgFrom.s, _bgTarget.s, t);
    _bgCurrent.b = lerp(_bgFrom.b, _bgTarget.b, t);

    for (let p of particles) {
      if (p._fromColor) {
        p.color.h = lerpHue(p._fromColor.h, p._targetColor.h, t);
        p.color.s = lerp(p._fromColor.s, p._targetColor.s, t);
        p.color.b = lerp(p._fromColor.b, p._targetColor.b, t);

        if (t >= 0.5 && p.shape !== p._targetShape) {
          p.shape = p._targetShape;
        }
      }
    }

    if (themeTransition === 0) {
      for (let p of particles) {
        p._fromColor = null;
        p._targetColor = null;
      }
    }
  }

  background(_bgCurrent.h, _bgCurrent.s, _bgCurrent.b);

  // 1. 중력장 전환 lerp
  gravityStrength = lerp(gravityStrength, targetGravity, 0.08);

  // 2. 공간 해시 구축
  spatialGrid.clear();
  for (let i = 0; i < particles.length; i++) {
    let p = particles[i];
    spatialGrid.insert(i, p.pos.x, p.pos.y);
  }

  // 3. 물리 업데이트
  time += 0.004;
  _handleIdle();
  for (let p of particles) {
    _applyMouseGravity(p);
    _applyParticleGravity(p);
    _updateParticle(p);
  }

  // 4. 클릭 파동
  if (pressWave > 0) {
    _dispatchDraw('drawPressWave', _drawPressWaveDefault);
    pressWave *= 0.96;
    if (pressWave < 1) pressWave = 0;
  }

  // 5. 연결선
  drawConnections();

  // 6. 중력장
  _dispatchDraw('drawGravityField', _drawGravityFieldDefault);

  // 7. 입자
  for (let p of particles) {
    drawParticle(p);
  }

  // 8. 커서
  _dispatchDraw('drawCursor', _drawCursorDefault);
}

// ============================================================
// 물리 내부 함수들
// ============================================================
function _applyMouseGravity(p) {
  let dx = mouseX - p.pos.x;
  let dy = mouseY - p.pos.y;
  let d  = sqrt(dx * dx + dy * dy);
  if (d < 5) d = 5;

  let G = 400 * gravityStrength;
  let force;
  if (d < 30) {
    force = map(d, 5, 30, -0.08, 0.02) * gravityStrength;
  } else {
    force = G * p.mass / pow(d, 1.3);
  }
  force = constrain(force, -0.1, 0.25);
  force *= p.speedFactor;

  let angle = atan2(dy, dx);
  p.acc.x += cos(angle) * force;
  p.acc.y += sin(angle) * force;
}

function _applyParticleGravity(p) {
  let neighbors = spatialGrid.getNeighbors(p.pos.x, p.pos.y);

  for (let idx of neighbors) {
    if (idx === p.index) continue;
    let other = particles[idx];

    let dx = other.pos.x - p.pos.x;
    let dy = other.pos.y - p.pos.y;
    let d2 = dx * dx + dy * dy;

    if (d2 < 10) d2 = 10;
    if (d2 > CELL_SIZE * CELL_SIZE * 4) continue;

    let d = sqrt(d2);
    let force;
    if (d < 45) {
      force = -0.25 * (45 - d) / 45;
    } else if (d < 80) {
      force = (other.mass * 0.05) / d2 * 10;
    } else {
      force = (other.mass * 0.02) / d2 * 10;
    }
    force = constrain(force, -0.12, 0.02);
    force *= p.speedFactor;

    let angle = atan2(dy, dx);
    p.acc.x += cos(angle) * force;
    p.acc.y += sin(angle) * force;
  }

  let wanderAngle = noise(p.noiseOffX + time * 1.5, p.noiseOffY) * TWO_PI * 2;
  p.acc.x += cos(wanderAngle) * 0.08;
  p.acc.y += sin(wanderAngle) * 0.08;
}

function _updateParticle(p) {
  let accMag = p.acc.mag();
  if (accMag > MAX_ACC) p.acc.mult(MAX_ACC / accMag);

  p.vel.add(p.acc);
  p.acc.set(0, 0);
  p.vel.mult(FRICTION - (1 - p.speedFactor) * 0.01);
  p.vel.limit(MAX_VEL * p.speedFactor);
  p.pos.add(p.vel);

  let margin = 30;
  let wallForce = 0.3;
  if (p.pos.x < margin)          p.vel.x += wallForce;
  if (p.pos.x > width - margin)  p.vel.x -= wallForce;
  if (p.pos.y < margin)          p.vel.y += wallForce;
  if (p.pos.y > height - margin) p.vel.y -= wallForce;

  p.drawPos.lerp(p.pos, 0.5);

  if (p.vel.mag() > 0.3) {
    let targetRot = p.vel.heading();
    let diff = targetRot - p.rotation;
    if (diff >  PI) diff -= TWO_PI;
    if (diff < -PI) diff += TWO_PI;
    p.rotation += diff * 0.04;
  }
  p.rotation += p.rotSpeed;
}

function _handleIdle() {
  let moved = (mouseX !== _prevMouseX || mouseY !== _prevMouseY);
  _prevMouseX = mouseX;
  _prevMouseY = mouseY;

  if (moved) {
    mouseActivity = min(mouseActivity + 0.08, 1);
  } else {
    mouseActivity = max(mouseActivity - 0.0005, 0);
  }

  let idleBlend = 1 - mouseActivity;
  idleBlend = idleBlend * idleBlend;

  if (idleBlend > 0.01) {
    let idleStrength = idleBlend * 0.005;
    let cx = width  * 0.5;
    let cy = height * 0.5;
    let sphereRadius = min(width, height) * 0.38;

    for (let p of particles) {
      p._idleTheta += p._idleSpeed;
      let sinPhi = sin(p._idlePhi);
      let tx = cx + sphereRadius * sinPhi * cos(p._idleTheta);
      let ty = cy + sphereRadius * cos(p._idlePhi);

      let dx = tx - p.pos.x;
      let dy = ty - p.pos.y;
      p.acc.x += dx * idleStrength * p.speedFactor;
      p.acc.y += dy * idleStrength * p.speedFactor;
    }
  }
}

// ============================================================
// 이벤트 핸들러
// ============================================================
function mousePressed(event) {
  if (event && event.target && event.target.closest('#theme-switcher')) return;

  isPressed = true;
  pressWave = 300;
  pressX = mouseX;
  pressY = mouseY;
  targetGravity = -1.5;

  for (let p of particles) {
    let dx = p.pos.x - mouseX;
    let dy = p.pos.y - mouseY;
    let d = sqrt(dx * dx + dy * dy);
    if (d < 5) d = 5;

    if (d < 300) {
      let strength = map(d, 0, 300, 4, 0.2);
      let angle = atan2(dy, dx);
      p.vel.x += cos(angle) * strength;
      p.vel.y += sin(angle) * strength;
    }
  }
}

function mouseReleased() {
  isPressed = false;
  targetGravity = 1;
}

function keyPressed() {
  let themeKeys = Object.keys(THEMES);
  if (key === '1' && themeKeys[0]) switchTheme(themeKeys[0]);
  if (key === '2' && themeKeys[1]) switchTheme(themeKeys[1]);
  if (key === '3' && themeKeys[2]) switchTheme(themeKeys[2]);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
