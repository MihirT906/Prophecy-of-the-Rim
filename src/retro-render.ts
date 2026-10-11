import { rasterPanel } from './raster-ui';
import { makeRng } from './rng';
import type { State, Vec } from './state';

/** Cached, deliberately low resolution surfaces: no gameplay RNG is consumed. */
const surfaces = new Map<string, HTMLCanvasElement>();
export function planetSprite(key: string, radius: number): HTMLCanvasElement {
  const id = `${key}:${Math.round(radius)}`;
  const cached = surfaces.get(id); if (cached) return cached;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d')!, rng = makeRng(id), phase = rng() * 20;
  const palettes = [[146, 107, 65], [69, 119, 126], [120, 87, 118], [138, 137, 101]];
  const stellar = key === 'stellar-furnace';
  const base = stellar ? [255, 185, 82] : palettes[Math.floor(rng() * palettes.length)];
  const pixels = ctx.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const nx = (x - 63.5) / 61, ny = (y - 63.5) / 61, d = nx * nx + ny * ny;
    if (d > 1) continue;
    const nz = Math.sqrt(1 - d), light = stellar ? .78 + nz * .22 : Math.max(.08, -.52 * nx - .4 * ny + .72 * nz);
    const terrain = Math.sin(nx * 14 + phase + Math.sin(ny * 9)) * Math.cos(ny * 17 + phase) + Math.sin(ny * 36 + nx * 5) * .3;
    const cloud = Math.max(0, Math.sin(ny * 23 + nx * 7 + Math.sin(nx * 12) + phase) - .6) * 70;
    const grain = (rng() - .5) * 19 + ((x + y) % 2 ? 3 : -3);
    const offset = (y * 128 + x) * 4;
    for (let k = 0; k < 3; k++) pixels.data[offset + k] = Math.round(((base[k] + terrain * 25 + cloud) * light + grain + (1 - nz) ** 9 * 28) / 7) * 7;
    pixels.data[offset + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  if (surfaces.size >= 96) surfaces.delete(surfaces.keys().next().value!);
  surfaces.set(id, c); return c;
}
export function drawPlanet(ctx: CanvasRenderingContext2D, at: Vec, radius: number, key: string): void {
  ctx.save(); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(planetSprite(key, radius), Math.round(at.x - radius), Math.round(at.y - radius), radius * 2, radius * 2);
  ctx.restore();
}

export function metalPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  if (w >= 160 && h >= 24 && rasterPanel(ctx, h < 40 ? 'notice' : w > 700 && h < 120 ? 'hudTop' : w < 350 ? 'radar' : 'terminal', x, y, w, h)) return;
  ctx.fillStyle = '#080a0c'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#736451'; ctx.fillRect(x, y, w, 3); ctx.fillRect(x, y, 3, h);
  ctx.fillStyle = '#302d29'; ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
  ctx.fillStyle = '#14191a'; ctx.fillRect(x + 8, y + 8, w - 16, h - 16);
  for (let row = y + 10; row < y + h - 8; row += 4) { ctx.fillStyle = '#ffffff04'; ctx.fillRect(x + 8, row, w - 16, 1); }
  for (const dx of [5, w - 7]) for (const dy of [5, h - 7]) {
    ctx.fillStyle = '#9b8970'; ctx.fillRect(x + dx, y + dy, 3, 3);
    ctx.fillStyle = '#171513'; ctx.fillRect(x + dx, y + dy + 1, 3, 1);
  }
}
export function drawStation(ctx: CanvasRenderingContext2D, at: Vec, key: string, time: number): void {
  const rng = makeRng(key), arms = 4 + Math.floor(rng() * 3);
  ctx.save(); ctx.translate(at.x, at.y); ctx.scale(1, .76);
  ctx.strokeStyle = '#080a10'; ctx.lineWidth = 17;
  ctx.beginPath(); ctx.arc(0, 8, 43, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#746d60'; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.arc(0, 0, 43, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#b2a080'; ctx.lineWidth = 2; ctx.stroke();
  for (let i = 0; i < arms; i++) {
    ctx.save(); ctx.rotate(i / arms * Math.PI * 2 + .2);
    metalPanel(ctx, 15, -7, 57, 14); metalPanel(ctx, 57, -21, 25, 42);
    ctx.fillStyle = '#435e65'; ctx.fillRect(61, -16, 17, 32);
    for (let j = -13; j < 16; j += 6) { ctx.fillStyle = '#8c9b89'; ctx.fillRect(62, j, 15, 1); }
    ctx.fillStyle = Math.sin(time * 2 + i) > 0 ? '#ebbb65' : '#624329'; ctx.fillRect(81, -3, 3, 6);
    ctx.restore();
  }
  metalPanel(ctx, -20, -22, 40, 44);
  ctx.fillStyle = '#90bab0'; ctx.fillRect(-9, -12, 18, 7);
  ctx.fillStyle = '#05080a'; ctx.fillRect(-10, 3, 20, 13);
  ctx.restore();
}

let dustCloud: HTMLCanvasElement | undefined;
function cloudSprite(): HTMLCanvasElement {
  if (dustCloud) return dustCloud;
  const c = document.createElement('canvas'); c.width = c.height = 96;
  const g = c.getContext('2d')!, data = g.createImageData(96, 96), rng = makeRng('interstellar-cloud');
  for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
    const d = Math.hypot((x - 48) / 48, (y - 48) / 48), i = (y * 96 + x) * 4;
    const turbulence = Math.sin(x * .1 + Math.sin(y * .14) * 2) * Math.cos(y * .09) + Math.sin(x * .31 + y * .18) * .25;
    data.data[i] = 83; data.data[i + 1] = 69; data.data[i + 2] = 100;
    data.data[i + 3] = Math.max(0, 1 - d) ** 2 * Math.max(0, turbulence + .7) * (18 + rng() * 10);
  }
  g.putImageData(data, 0, 0); dustCloud = c; return c;
}

export function drawAsteroid(ctx: CanvasRenderingContext2D, at: Vec, radius: number, key: string): void {
  const rng = makeRng(key);
  ctx.save(); ctx.translate(Math.round(at.x), Math.round(at.y));
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, r = radius * (.82 + rng() * .18);
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath(); ctx.clip(); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(planetSprite(`rock:${key}`, radius), -radius, -radius, radius * 2, radius * 2);
  for (let i = 0; i < 7; i++) {
    const x = (rng() - .5) * radius * 1.3, y = (rng() - .5) * radius * 1.3, r = 2 + rng() * radius * .2;
    ctx.fillStyle = '#03060960'; ctx.beginPath(); ctx.ellipse(x, y, r, r * .65, -.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#a2977030'; ctx.stroke();
  }
  ctx.restore();
}

export function drawDeepSpace(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  const left = s.player.x - w / 2, top = s.player.y - h / 2;
  ctx.fillStyle = '#080b12'; ctx.fillRect(left, top, w, h);
  for (let layer = 0; layer < 3; layer++) {
    const parallax = .16 + layer * .29, cell = 180;
    const ox = s.player.x * parallax, oy = s.player.y * parallax;
    for (let cy = Math.floor(oy / cell) - 4; cy <= Math.floor(oy / cell) + Math.ceil(h / cell); cy++) {
      for (let cx = Math.floor(ox / cell) - 5; cx <= Math.floor(ox / cell) + Math.ceil(w / cell); cx++) {
        const rng = makeRng(`${s.voyage?.universe.seed}:dust:${layer}:${cx}:${cy}`);
        for (let i = 0; i < 9; i++) {
          const x = Math.round(left + w / 2 + cx * cell - ox + rng() * cell);
          const y = Math.round(top + h / 2 + cy * cell - oy + rng() * cell);
          if (i < 6) { ctx.fillStyle = ['#19202d', '#252632', '#38353a'][layer]; ctx.fillRect(x, y, 2 + layer, 1); }
          else { ctx.fillStyle = ['#555966', '#928573', '#b2b7b4'][layer]; ctx.fillRect(x, y, 1 + Number(layer === 2), 1 + Number(layer === 2)); }
        }
        if (layer === 0) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(cloudSprite(), left + w / 2 + cx * cell - ox - 140, top + h / 2 + cy * cell - oy - 100, 420, 360);
        }
      }
    }
  }
}
