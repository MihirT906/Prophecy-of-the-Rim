import { OLD_SAVE_KEY, SAVE_KEY, WEAPONS } from './data';
import type { WeaponId } from './data';
import { newPlayer } from './player';
import type { State } from './state';
import { captureVoyage, readVoyageSave, type VoyageSave } from './voyage';

export interface Save { id: string; name: string; bestArena: number; kills: number; voyage?: VoyageSave;
  weapon?: { id: WeaponId; ammo: number } }  // a bought or salvaged weapon; absent while the pistol is mounted
interface Store { current: string; list: Save[] }

function valid(v: Save | null): boolean {
  return !!v && typeof v.id === 'string' && v.id.length > 0 && typeof v.name === 'string'
    && [v.bestArena, v.kills].every(n => Number.isSafeInteger(n) && n >= 0);
}

/** Pilots saved before ship upgrades were removed still carry level, xp and upgrades; drop them so they are not written back. */
function strip(v: Save): Save {
  const { level, xp, upgrades, ...save } = v as Save & Record<'level' | 'xp' | 'upgrades', unknown>;
  void level; void xp; void upgrades;
  return save;
}

/** Last store that was written successfully; it repairs a corrupted or missing primary record. */
export const BACKUP_KEY = `${SAVE_KEY}.backup`;

function write(st: Store): boolean {
  const raw = JSON.stringify(st);
  try { localStorage.setItem(SAVE_KEY, raw); } catch { return false; }
  try { localStorage.setItem(BACKUP_KEY, raw); } catch { /* the primary record still saved */ }
  return true;
}

function parseStore(raw: string | null): Store | null {
  try {
    const v = JSON.parse(raw ?? 'null');
    if (v && Array.isArray(v.list)) {
      const ids = new Set<string>();
      const list: Save[] = v.list.filter((entry: Save) => {
        if (!valid(entry) || ids.has(entry.id)) return false;
        ids.add(entry.id);
        return true;
      }).map(strip).map((entry: Save) => {
      const voyage = readVoyageSave(entry.voyage);
      if (voyage) return { ...entry, voyage };
      const { voyage: ignored, ...character } = entry;
      void ignored;
      return character;
      });
      // A populated but wholly invalid store is corruption, not an intentional deletion.
      if (v.list.length && !list.length) return null;
      const current = list.some(entry => entry.id === v.current) ? v.current : list[0]?.id ?? '';
      return { current, list };
    }
  } catch { /* malformed */ }
  return null;
}

/** Falls back to the backup when the primary record is missing or malformed, else empty. Migrates the old single-character key once. */
function read(): Store {
  // Reads and repair writes can fail independently (for example, a full storage quota).
  const get = (key: string): string | null => {
    try { return localStorage.getItem(key); } catch { return null; }
  };
  const primary = parseStore(get(SAVE_KEY));
  if (primary) return primary;
  const backup = get(BACKUP_KEY), restored = parseStore(backup);
  if (restored) {
    try { localStorage.setItem(SAVE_KEY, backup!); } catch { /* still usable in memory */ }
    return restored;
  }
  // Prefer the current backup to legacy data; never delete the only copy on a failed write.
  const old = get(OLD_SAVE_KEY);
  if (old !== null) {
    try {
      const v = { ...JSON.parse(old), id: '1' };
      if (valid(v)) {
        const pilot = strip(v);
        const migrated = { current: pilot.id, list: [pilot] };
        if (write(migrated)) {
          try { localStorage.removeItem(OLD_SAVE_KEY); } catch { /* retry cleanup later */ }
        }
        return migrated;
      }
    } catch { /* malformed legacy data must not interrupt loading */ }
  }
  return { current: '', list: [] };
}

export function listSaves(): Save[] {
  return read().list;
}

/** The current character, null if none. */
export function loadSave(): Save | null {
  const st = read();
  return st.list.find(c => c.id === st.current) ?? null;
}

/** Updates the current character's entry. */
export function writeSave(s: State): void {
  const st = read(), cur = st.list.find(c => c.id === st.current), p = s.player;
  if (!cur) { if (s.voyage) s.voyage.storageError = true; return; }
  Object.assign(cur, { name: s.name, bestArena: Math.max(cur.bestArena, s.arenaN), kills: p.kills });
  if (p.weapon === 'pistol') delete cur.weapon; else cur.weapon = { id: p.weapon, ammo: p.ammo };
  const voyage = captureVoyage(s);
  if (voyage) cur.voyage = voyage;
  const saved = write(st);
  if (s.voyage) s.voyage.storageError = !saved;
}

/** New character, made current. */
export function createSave(name: string): Save {
  const st = read();
  const save: Save = { id: String(Math.max(0, ...st.list.map(c => Number(c.id) || 0)) + 1), name, bestArena: 0, kills: 0 };
  st.list.push(save);
  st.current = save.id;
  write(st);
  return save;
}

export function selectSave(id: string): void {
  const st = read();
  if (st.list.some(c => c.id === id)) write({ ...st, current: id });
}

/** Deleting the current character makes the first remaining one current (none if the list is empty). */
export function deleteSave(id: string): void {
  const st = read(), list = st.list.filter(c => c.id !== id);
  write({ list, current: st.current === id ? list[0]?.id ?? '' : st.current });
}

/** Fresh player with the saved kills and weapon. */
export function applySave(s: State, save: Save): void {
  const p = newPlayer();
  p.kills = save.kills;
  const w = save.weapon;
  if (w && w.id !== 'pistol' && Object.hasOwn(WEAPONS, w.id) && Number.isFinite(w.ammo) && w.ammo > 0) { p.weapon = w.id; p.ammo = w.ammo; }
  s.player = p;
  s.name = save.name;
  s.voyage = null;
}
