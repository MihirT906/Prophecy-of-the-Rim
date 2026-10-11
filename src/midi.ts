/** Minimal Standard MIDI File reader: notes, pitch bend, program and tempo, flattened to seconds. */
export interface MidiNote { kind: 'note'; time: number; duration: number; channel: number; pitch: number; velocity: number }
export interface MidiBend { kind: 'bend'; time: number; channel: number; semitones: number }
export type MidiEvent = MidiNote | MidiBend;
export interface MidiSong { title: string; length: number; events: MidiEvent[]; programs: Record<number, number> }

interface Raw { tick: number; order: number; status: number; a: number; b: number; tempo?: number; title?: string }

export function decodeBase64(text: string): Uint8Array {
  const bin = atob(text), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function parseMidi(bytes: Uint8Array): MidiSong {
  let pos = 0;
  const u8 = () => { if (pos >= bytes.length) throw new Error('truncated MIDI'); return bytes[pos++]; };
  const u16 = () => (u8() << 8) | u8();
  const u32 = () => ((u16() << 16) | u16()) >>> 0;
  const vlq = () => { let n = 0, b: number; do { b = u8(); n = (n << 7) | (b & 127); } while (b & 128); return n; };
  const id = () => String.fromCharCode(u8(), u8(), u8(), u8());

  if (id() !== 'MThd') throw new Error('not a MIDI file');
  const headerEnd = u32() + pos; u16(); const tracks = u16(), division = u16(); pos = headerEnd;
  if (division & 0x8000) throw new Error('SMPTE time unsupported');
  const raw: Raw[] = []; let endTick = 0, order = 0;
  for (let t = 0; t < tracks; t++) {
    if (id() !== 'MTrk') throw new Error('bad track chunk');
    const end = u32() + pos; let tick = 0, running = 0;
    while (pos < end) {
      tick += vlq();
      let status = bytes[pos];
      if (status & 0x80) pos++; else status = running;
      if (status === 0xff) {
        const type = u8(), len = vlq(), data = bytes.subarray(pos, pos + len); pos += len;
        if (type === 0x51) raw.push({ tick, order: order++, status, a: 0, b: 0, tempo: (data[0] << 16) | (data[1] << 8) | data[2] });
        if (type === 0x03 && t === 0) raw.push({ tick, order: order++, status, a: 0, b: 0, title: String.fromCharCode(...data) });
        if (type === 0x2f) endTick = Math.max(endTick, tick);
      } else if (status === 0xf0 || status === 0xf7) pos += vlq();
      else {
        running = status;
        const hi = status & 0xf0, a = u8(), b = hi === 0xc0 || hi === 0xd0 ? 0 : u8();
        raw.push({ tick, order: order++, status, a, b });
      }
    }
    pos = end;
  }
  raw.sort((x, y) => x.tick - y.tick || x.order - y.order);

  // Tempo map: ticks to seconds.
  let lastTick = 0, lastTime = 0, perTick = 0.5 / division;
  const seconds = (tick: number) => lastTime + (tick - lastTick) * perTick;
  const events: MidiEvent[] = [], open = new Map<number, MidiNote[]>(), programs: Record<number, number> = {};
  let title = '';
  for (const e of raw) {
    const time = seconds(e.tick);
    if (e.tempo) { lastTime = time; lastTick = e.tick; perTick = e.tempo / 1e6 / division; continue; }
    if (e.title !== undefined) { title = e.title; continue; }
    const hi = e.status & 0xf0, channel = e.status & 15, key = channel * 128 + e.a;
    if (hi === 0x90 && e.b > 0) {
      const note: MidiNote = { kind: 'note', time, duration: 0, channel, pitch: e.a, velocity: e.b / 127 };
      events.push(note); open.set(key, [...(open.get(key) ?? []), note]);
    } else if (hi === 0x80 || hi === 0x90) {
      const note = open.get(key)?.shift();
      if (note) note.duration = Math.max(.01, time - note.time);
    } else if (hi === 0xe0) events.push({ kind: 'bend', time, channel, semitones: (((e.b << 7) | e.a) - 8192) / 8192 * 2 });
    else if (hi === 0xc0) programs[channel] = e.a;
  }
  const length = seconds(endTick);
  for (const notes of open.values()) for (const n of notes) n.duration ||= Math.max(.01, length - n.time);
  return { title, length, events, programs };
}
