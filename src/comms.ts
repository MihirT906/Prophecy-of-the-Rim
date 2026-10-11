import { makeRng } from './rng';
import { SECTOR_CONTENT } from './sector-content';
export type EntityKind = 'navigator' | 'facedancer' | 'ghola' | 'smuggler';
export interface CommsEntity {
  kind: EntityKind; label: string; tint: string; width: number; asymmetry: number;
  ridges: number; tubes: number; pitch: number; rate: number; timbre: number;
}
const entities: { kind: EntityKind; label: string; tint: string; lines: string[] }[] = [
  { kind: 'navigator', label: 'GUILD / TANK TRANSMISSION', tint: '#b59158', lines: [
    'The gas thins... I have seen your empty hold. Bring the melange closer.',
    'Do not interrupt. There is a route... no. That future has closed. We trade now.' ] },
  { kind: 'facedancer', label: 'TLEILAXU / IDENTITY UNVERIFIED', tint: '#93aa87', lines: [
    'You recognize this face? How unfortunate. It belonged to someone else.',
    'A name? A face? Such expensive assurances. Let us discuss the spice instead.' ] },
  { kind: 'ghola', label: 'GHOLA / RETAINER CHANNEL', tint: '#8da8b4', lines: [
    'I remember this exchange. That is impossible... I have never met you.',
    'My eyes were made on Ix. What they have seen... belongs to my master.' ] },
  { kind: 'smuggler', label: 'SMUGGLER / SCRAMBLED MASK', tint: '#b39b8a', lines: [
    'Quiet. No House seals. No names. Twelve measures, and you never saw us.',
    'The Guild takes its share. The Houses take theirs. Move quickly... before they return.' ] },
];
export function generateEntity(seed: string): CommsEntity {
  const r = makeRng(`${seed}:entity`), base = entities[Math.floor(r() * entities.length)];
  return { kind: base.kind, label: base.label, tint: base.tint, width: 64 + r() * 42,
    asymmetry: (r() - .5) * 22, ridges: 3 + Math.floor(r() * 6), tubes: 2 + Math.floor(r() * 4),
    pitch: (base.kind === 'navigator' ? 65 : base.kind === 'facedancer' ? 155 : 100) + r() * 60,
    rate: (base.kind === 'navigator' ? 14 : base.kind === 'smuggler' ? 32 : 22) + r() * 8,
    timbre: Math.floor(r() * 8) };
}
/** Delay after a glyph: punctuation breathes, phrases accelerate, vowels linger. */
export function glyphDelay(c: CommsSession, index: number): number {
  const ch = c.text[index];
  if (/[.!?]/.test(ch)) return c.text[index + 1] === '.' ? .12 : .48;
  if (/[,;:]/.test(ch)) return .22;
  if (ch === ' ') return .025;
  const phrase = .85 + .3 * Math.sin(index * .37 + c.entity.timbre);
  return phrase / c.entity.rate * (/[aeiou]/i.test(ch) ? 1.35 : .85);
}
export function advanceDialogue(c: CommsSession, dt: number, speak: (char: string, index: number) => void): void {
  c.elapsed += dt; c.pulse = Math.max(0, c.pulse - dt * 7);
  c.wait -= Math.min(dt, .1); // Never burst a backlog of syllables after a stalled frame.
  if (c.shown >= c.text.length || c.wait > 0) return;
  const index = c.shown++;
  c.wait = glyphDelay(c, index);
  if (/[a-z0-9]/i.test(c.text[index])) { c.pulse = 1; speak(c.text[index], index); }
}
export interface CommsSession {
  contactId?: string; details: string[]; prompt: string; theftArmed: boolean; canSteal: boolean;
  name: string; seed: string; action: 'collect' | 'sell'; text: string; shown: number; elapsed: number;
  entity: CommsEntity; wait: number; pulse: number; response: boolean; blocked: string | null; pitch: number; eyes: number; faceWidth: number;
}
export function createComms(seed: string, name: string, action: 'collect' | 'sell', blocked: string | null): CommsSession {
  const rng = makeRng(seed), pick = (lines: string[]) => lines[Math.floor(rng() * lines.length)];
  const entity = generateEntity(seed), profile = entities.find(e => e.kind === entity.kind)!;
  return { name, seed, action, blocked, entity, wait: 0, pulse: 0, details: [], prompt: action === 'collect' ? 'ACCEPT CONTRACT' : 'HAND IN SHIPMENT', theftArmed: false, canSteal: false,
    text: `${pick(profile.lines)} ${action === 'collect' ? pick(SECTOR_CONTENT.offers) : 'Leave the cargo sealed. We will weigh it ourselves.'}`,
    shown: 0, elapsed: 0, response: false, pitch: entity.pitch, eyes: 2, faceWidth: entity.width };

}
export function farewell(seed: string): string {
  return SECTOR_CONTENT.farewells[Math.floor(makeRng(`${seed}:farewell`)() * SECTOR_CONTENT.farewells.length)];
}
