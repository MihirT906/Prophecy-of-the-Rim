import { placePlayerBomb, updatePlayerBombs } from './player-bomb';
import { installFeedback } from './input-feedback';
import { cycleGameSpeed, damageAssist, gameSpeed, musicEnabled, reducedMotion, setDamageAssist, setMusicEnabled, setReducedMotion } from './accessibility';
import { pauseMusic, resumeMusic, syncMusicSetting, unlockMusic, updateMusic } from './music';
import { unlockVoice, stopVoice, toggleVoice } from './alien-voice';
import { ARENA_H, ARENA_W, MAX_DT, STEP, TILE } from './data';
import { updateBullets } from './bullets';
import { updateEnemies } from './enemies';
import { updateFx } from './fx';
import { installInput, installPointer, takeClick, takeHover, takePress } from './input';
import { newPlayer, updatePlayer } from './player';
import { repairState } from './integrity';
import { guardFrame } from './recovery';
import { render } from './render';
import { applySave, createSave, deleteSave, listSaves, loadSave, selectSave, writeSave } from './save';
import { openShop, updateShop } from './shop';
import { newState, type Screen, type State } from './state';
import { updateComms, chooseOnMap, closeMap, resetNavigation, startVoyage, updateVoyage } from './voyage';
import { updateArms, useArms } from './arms';
import { updateMarket } from './market';
import { moveMapSelection } from './universe';
import { starAt } from './space-render';

const W = ARENA_W * TILE, H = ARENA_H * TILE;

const canvas = document.getElementById('game') as HTMLCanvasElement;
canvas.width = W;
canvas.height = H;
const ctx = canvas.getContext('2d')!;

/** Letterbox: scale the fixed-size canvas to fit the window, keeping aspect. */
function fit(): void {
  const k = Math.min(innerWidth / W, innerHeight / H);
  canvas.style.width = `${Math.floor(W * k)}px`;
  canvas.style.height = `${Math.floor(H * k)}px`;
}
addEventListener('resize', fit);
fit();

const input = installInput(window);
installPointer(canvas, input);
addEventListener('keydown', unlockVoice);
addEventListener('pointerdown', unlockVoice);
addEventListener('blur', stopVoice);
addEventListener('visibilitychange', () => { if (document.hidden) stopVoice(); });
// The score starts with the page; browsers that block autoplay release it on the first gesture.
unlockMusic();
for (const gesture of ['keydown', 'pointerdown', 'click', 'touchstart']) addEventListener(gesture, unlockMusic);
addEventListener('blur', pauseMusic);
addEventListener('focus', resumeMusic);
addEventListener('visibilitychange', () => { if (document.hidden) pauseMusic(); else if (document.hasFocus()) resumeMusic(); });
const toggleMusic = () => { setMusicEnabled(!musicEnabled()); syncMusicSetting(); };
const s = newState(input, String(Date.now()));
const feedback = installFeedback(window, s);
(window as any).__state = s;  // for tests and debugging from the console

/** Restore an unfinished run or its result screen. */
function respawn(s: State): void {
  const p = s.player;
  const save = loadSave() ?? { id: '', name: s.name, bestArena: s.arenaN, kills: p.kills };
  applySave(s, save);
  startVoyage(s, `${s.seed}:${save.id}`, save.voyage);
  writeSave(s);
}

function restart(s: State): void {
  const seed = s.voyage?.universe.seed ?? s.seed;
  s.player = newPlayer();
  startVoyage(s, seed);
  writeSave(s);
}

/** Up/Down or W/S moves the cursor, wrapping over n rows. */
function moveCursor(s: State, n: number): void {
  const d = Number(takePress(s.input, 'ArrowDown', 'KeyS')) - Number(takePress(s.input, 'ArrowUp', 'KeyW'));
  if (n) s.cursor = (s.cursor + d + n) % n;
}

function go(s: State, screen: Screen, cursor = 0): void {
  s.screen = screen;
  s.cursor = cursor;
}

function update(s: State, dt: number): void {
  s.time += dt;
  const i = s.input, from = s.screen;
  switch (s.screen) {
    case 'title':
      if (takePress(i, 'Enter', 'Space')) go(s, 'menu');
      break;
    case 'menu':  // Play, Characters, Settings
      moveCursor(s, 3);
      if (takePress(i, 'Escape')) go(s, 'title');
      else if (takePress(i, 'Enter', 'Space')) {
        if (s.cursor === 1) go(s, 'characters', Math.max(0, listSaves().findIndex(c => c.id === loadSave()?.id)));
        else if (s.cursor === 2) go(s, 'settings');
        else if (loadSave()) respawn(s);
        else { s.nameInput = ''; s.screen = 'naming'; }
      }
      break;
    case 'characters': {
      const list = listSaves();
      moveCursor(s, list.length);
      const c = list[s.cursor];
      if (takePress(i, 'Escape')) go(s, 'menu', 1);
      else if (takePress(i, 'KeyN')) {
        i.typed.splice(0, i.typed.findIndex(ch => ch.toLowerCase() === 'n') + 1);  // the N itself is not part of the name
        s.nameInput = '';
        s.screen = 'naming';
      } else if (c && takePress(i, 'Enter', 'Space')) {
        selectSave(c.id);
        respawn(s);
      } else if (c && takePress(i, 'Delete', 'KeyX')) {
        deleteSave(c.id);
        s.cursor = Math.max(0, Math.min(s.cursor, list.length - 2));
      }
      break;
    }
    case 'settings':
      if (takePress(i, 'Escape')) go(s, 'menu', 2);
      else if (takePress(i, 'KeyR', 'Enter', 'Space')) setReducedMotion(!reducedMotion());
      else if (takePress(i, 'KeyG')) cycleGameSpeed();
      else if (takePress(i, 'KeyH')) setDamageAssist(!damageAssist());
      else if (takePress(i, 'KeyU')) toggleMusic();
      break;
    case 'naming':
      if (takePress(i, 'Escape') && loadSave()) { go(s, 'menu'); break; }
      s.nameInput = (s.nameInput + i.typed.splice(0).join('')).slice(0, 16);
      if (takePress(i, 'Backspace')) s.nameInput = s.nameInput.slice(0, -1);
      if (takePress(i, 'Enter') && s.nameInput.trim()) {
        applySave(s, createSave(s.nameInput.trim()));
        startVoyage(s, `${s.seed}:${s.name}`);
        writeSave(s);
        i.pressed.length = 0;  // letters typed into the callsign must not fire flight hotkeys on the first tick
      }
      break;
    case 'playing':
      if (takePress(i, 'KeyV')) toggleVoice();
      if (takePress(i, 'Escape')) { go(s, 'paused'); break; }
      if (takePress(i, 'KeyM') && s.voyage && !s.voyage.lane) { go(s, 'map', s.voyage.navTarget); break; }
      if (takePress(i, 'KeyB')) placePlayerBomb(s);
      if (takePress(i, 'KeyF') && openShop(s)) break;
      if (takePress(i, 'KeyH')) s.guide = !s.guide;
      for (let k = 0; k < 4; k++) if (takePress(i, `Digit${k + 1}`)) useArms(s, k);  // armory slots 1-4
      // Death, comms or the departure map freezes the world at once: later systems wait for the next playing tick.
      for (const f of [updatePlayer, updateEnemies, updateBullets, updatePlayerBombs, updateArms, updateVoyage, updateFx]) if (s.screen === 'playing') f(s, dt);
      repairState(s);
      break;
    case 'comms': updateComms(s, dt); break;
    case 'shop': updateShop(s); break;
    case 'market': updateMarket(s, dt); break;
    case 'map':
      if (takePress(i, 'Escape', 'KeyM')) { closeMap(s); break; }
      if (s.voyage) {
        const u = s.voyage.universe, hover = takeHover(i), click = takeClick(i);
        // Hovering previews a star; clicking it acts exactly like selecting it and pressing Enter.
        if (hover) s.cursor = starAt(s.voyage, hover) ?? s.cursor;
        if (takePress(i, 'ArrowRight', 'KeyD')) s.cursor = moveMapSelection(u, s.cursor, 'right');
        if (takePress(i, 'ArrowLeft', 'KeyA')) s.cursor = moveMapSelection(u, s.cursor, 'left');
        if (takePress(i, 'ArrowDown', 'KeyS')) s.cursor = moveMapSelection(u, s.cursor, 'out');
        if (takePress(i, 'ArrowUp', 'KeyW')) s.cursor = moveMapSelection(u, s.cursor, 'in');
        const clicked = click ? starAt(s.voyage, click) : null;
        if (click && clicked === null) feedback.ack('CLICK A STAR TO CHOOSE IT', 'select');
        if (clicked !== null) s.cursor = clicked;
        if (takePress(i, 'Enter') || clicked !== null) {
          const choice = chooseOnMap(s, s.cursor);
          feedback.ack(choice.label, choice.cue);
          break;
        }
        if (takePress(i, 'KeyR')) {
          resetNavigation(s.voyage);
          s.cursor = s.voyage.navTarget;
        }
      }
      break;
    case 'dead':  // save was written in damagePlayer
    case 'transcended':
      if (takePress(i, 'Enter', 'Space')) restart(s);
      else if (takePress(i, 'Escape')) go(s, 'menu');
      break;
    case 'paused':  // Resume, Main menu
      moveCursor(s, 2);
      if (takePress(i, 'KeyU')) toggleMusic();
      if (takePress(i, 'Escape') || (s.cursor === 0 && takePress(i, 'Enter', 'Space'))) s.screen = 'playing';
      else if (takePress(i, 'Enter', 'Space')) {
        writeSave(s);
        go(s, 'menu');
      }
      break;
  }
  // Leftover presses are dropped each tick, except when the screen just changed: fast typists
  // (and tests) can press Enter, type and Enter again inside one tick.
  if (s.screen === from) i.pressed.length = 0;
  if (s.screen !== 'naming') i.typed.length = 0;
  if (i.pointer) {
    // Only the nav chart takes the mouse; elsewhere a click still gets an answer.
    if (s.screen === from && from !== 'map' && i.pointer.clicks.length) feedback.ack('USE KEYS HERE / MOUSE: NAV CHART', 'select');
    if (s.screen === from) i.pointer.clicks.length = 0;
    i.pointer.moved = false;
  }
}

let last = performance.now(), acc = 0;
const faults: number[] = [];
function frame(now: number): void {
  const ok = guardFrame(s, faults, now / 1000, () => {
    // Game speed assist slows play itself; menus and screens stay at full speed.
    acc += Math.min((now - last) / 1000, MAX_DT) * (s.screen === 'playing' ? gameSpeed() : 1);
    last = now;
    while (acc >= STEP) {
      update(s, STEP);
      acc -= STEP;
    }
    render(ctx, s, W, H);
    feedback.draw(ctx, W, H);
    canvas.style.cursor = s.screen === 'map' && s.voyage && input.pointer?.over && starAt(s.voyage, input.pointer) !== null ? 'pointer' : '';
    updateMusic(s);
  }, respawn);
  if (!ok) acc = 0;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

addEventListener('pagehide', () => { if (s.voyage) writeSave(s); });
addEventListener('blur', () => { if (s.voyage) writeSave(s); });
