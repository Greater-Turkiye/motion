import { parse } from 'yaml';

export type LonLat = [number, number];
export const STYLE_IDS = ['A', 'B', 'C', 'D', 'E', 'G', 'H', 'I', 'K'] as const;
export type StyleId = (typeof STYLE_IDS)[number];

export interface Camera { center: LonLat; zoom: number }
export interface Key extends Camera { t: number }

/** What follows the hook, one block of text at a time (PLAN.md section 14, research/02 beat sheet). */
export type Beat =
  | { kind: 'place'; at: number; title: string; text?: string }
  | { kind: 'facts'; at: number; kicker?: string; lines: string[] }
  | { kind: 'distance'; at: number; from: { at: LonLat; label: string }; to: { at: LonLat; label: string }; text?: string }
  | { kind: 'status'; at: number; text?: string }
  | { kind: 'close'; at: number; kicker?: string; lines: string[] }
  /** the parties linked on the map, capital to capital; title is what joins them (a meeting, an agreement) */
  | { kind: 'link'; at: number; title: string; text?: string }
  /** our own records around the place in the last days, lit one by one, with their count */
  | { kind: 'recent'; at: number; title: string; points: { at: LonLat; days: number }[]; text?: string }
  /** the parties as a list of flags and names (an exercise's participants) */
  | { kind: 'roster'; at: number; title: string; text?: string }
  /** what a party said, in the source's own words, under its flag */
  | { kind: 'quote'; at: number; speaker?: number; lines: string[] };

export interface Scene {
  id: string;
  format: 'vertical';
  fps: number;
  duration: number;
  style: StyleId;
  record?: string;
  /** The source's own words (the record's title, the headlines it cites): every content word of the
   *  hook and the facts must be found here, so a hook can never say what the source does not. */
  source_text: string[];
  camera: { from: Camera; to: Camera; seconds: number; ease: string; keys?: Key[] };
  event?: { at: LonLat; precision: 'region' | 'locality' | 'exact' };
  subject?: { country: string; emblem?: string; label?: string };
  /** the countries of a two- or many-sided story (talks, an agreement, an exercise): lit together, linked, listed */
  parties?: { country: string; label: string; at: LonLat; emblem?: string }[];
  /** `alts`: other points on the ground where the label may sit instead (one is chosen per video) */
  labels: { text: string; at: LonLat; kind?: 'country' | 'sea' | 'home'; alts?: LonLat[] }[];
  hook: { kicker: string; lines: string[]; sub: string; status: string; source: string };
  beats: Beat[];
  /** How it moves (all optional): text entrance, camera path, a stories-style progress bar, and
   *  sub-frame motion blur on export (on unless false). The page's URL can override each one. */
  anim?: { text?: 'rise' | 'wipe' | 'type' | 'pop'; camera?: 'glide' | 'fly' | 'snap'; progress?: boolean; blur?: boolean };
  /** which order of the same facts this is, for testing what holds viewers (tools/scene/generate.mjs VARIANTS) */
  variant?: 'standart' | 'yakinlik' | 'kisa' | 'oruntu';
  /** 'synthetic': the video carries a machine-read narration and says so on screen in every frame */
  voice?: 'synthetic';
}

/** Reading speed ceiling: 15 characters a second is about two Turkish words (research/01, rule 4). */
export const CPS = 15;
/** No block of text is on screen for less than this, however short (research/01, rule 4). */
export const MIN_BLOCK = 1.2;

/** Words that make a video angrier, not truer (research/01, rule 12). Matched as word prefixes. */
const BANNED = ['hain', 'rezil', 'küstah', 'alçak', 'namussuz', 'şerefsiz', 'vahşi', 'barbar', 'terörist devlet', 'katliamcı',
  'şok', 'inanılmaz', 'bomba gibi', 'flaş', 'son dakika'];
/** Words that carry no claim, so they need no match in the source. */
const STOP = new Set(['ve', 'ile', 'bir', 'bu', 'şu', 'o', 'da', 'de', 'ki', 'mi', 'göre', 'için', 'gibi', 'kadar', 'daha', 'en',
  'çok', 'az', 'ya', 'veya', 'ama', 'fakat', 'ise', 'olarak', 'olan', 'yeni']);

// Turkish lower case, then ı folded into i: "UKRINFORM" must match "Ukrinform" (it lower-cases to "ukrınform")
const lower = (s: string) => s.toLocaleLowerCase('tr').replace(/ı/g, 'i');
/** Content words of a line: lower-cased, the suffix after an apostrophe dropped (Odesa'da → odesa). */
export function words(s: string): string[] {
  return lower(s).replace(/\{[^}]*\}/g, ' ').split(/[^\p{L}\p{N}']+/u).map((w) => w.split("'")[0]).filter((w) => w.length > 1);
}
/** Turkish is agglutinative: a word matches when its first five letters (or all of it, if shorter)
 *  begin a word of the source. "öldü" matches "öldürüldü"; "vuruldu" does not match "saldırıya". */
const stem = (w: string) => w.slice(0, Math.min(5, w.length));

/** Every problem with a scene, as sentences; an empty list means the scene may be drawn. */
export function validate(s: Scene): string[] {
  const out: string[] = [];
  const need = (cond: unknown, msg: string) => { if (!cond) out.push(msg); };
  need(typeof s.id === 'string' && s.id, 'id is required');
  need(s.format === 'vertical', 'only the vertical format exists so far');
  need(Number.isInteger(s.fps) && s.fps >= 24 && s.fps <= 120, 'fps must be 24–120');
  need(s.duration > 0 && s.duration <= 90, 'duration must be 0–90 s');
  need((STYLE_IDS as readonly string[]).includes(s.style), `style must be one of ${STYLE_IDS.join(', ')}`);
  need(s.hook && s.hook.lines?.length, 'the hook needs at least one line');
  if (out.length) return out;
  need(s.hook.status?.trim(), 'the verification status must be on screen');
  need(s.hook.source?.trim(), 'the source must be on screen');
  need(!s.hook.lines.some((l) => l.includes('?')), 'no question hooks (research/02, format 14)');

  // timing: each block long enough to be read at CPS
  const ends = [...s.beats.map((b) => b.at), s.duration];
  const hookEnd = ends[0];
  const hookChars = [...s.hook.lines, s.hook.sub.replace(/\{[^}]*\}/g, '000')].join(' ').length;
  need(hookEnd >= Math.max(MIN_BLOCK, hookChars / CPS), `the hook has ${hookChars} characters and needs ${(hookChars / CPS).toFixed(1)} s, it gets ${hookEnd.toFixed(1)} s`);
  s.beats.forEach((b, i) => {
    const dur = ends[i + 1] - b.at;
    need(dur > 0, `beat ${i + 1} (${b.kind}) starts after the next one`);
    const chars = beatText(b).join(' ').length;
    need(dur >= Math.max(MIN_BLOCK, chars / CPS), `beat ${i + 1} (${b.kind}) has ${chars} characters and needs ${Math.max(MIN_BLOCK, chars / CPS).toFixed(1)} s, it gets ${dur.toFixed(1)} s`);
  });
  if (s.camera.keys) {
    const k = s.camera.keys;
    need(k.length >= 2 && k[0].t === 0, 'camera keys start at t = 0');
    need(k.every((x, i) => i === 0 || x.t > k[i - 1].t), 'camera keys are in time order');
  }

  // words: nothing banned anywhere; hook and facts only in the source's own words
  const all = [s.hook.kicker, ...s.hook.lines, s.hook.sub, ...s.beats.flatMap(beatText)];
  for (const line of all) for (const b of BANNED) if (lower(line).includes(b)) out.push(`banned word "${b}" in "${line}"`);
  need(s.source_text?.length, 'source_text is required: the words the hook may use');
  const src = (s.source_text || []).flatMap(words);
  const sourceName = words(s.hook.source.replace(/^.*?:/, ''));
  // a sentence with a {placeholder} is context the engine computes (a distance), not the source's claim
  const sub = s.hook.sub.split(/(?<=[.!])\s+/).filter((x) => !x.includes('{'));
  const checked = [...s.hook.lines, ...sub, ...s.beats.flatMap((b) => (b.kind === 'facts' || b.kind === 'quote' ? b.lines : []))];
  for (const line of checked) for (const w of words(line)) {
    if (STOP.has(w) || sourceName.includes(w)) continue;
    if (/^\d/.test(w) ? !(s.source_text || []).some((t) => t.includes(w)) : !src.some((x) => x.startsWith(stem(w)))) out.push(`"${w}" (in "${line}") is not in the source`);
  }
  return out;
}

export function beatText(b: Beat): string[] {
  switch (b.kind) {
    case 'place': return [b.title, b.text ?? ''];
    case 'facts': return [b.kicker ?? '', ...b.lines];
    case 'distance': return [`${b.from.label} ${b.to.label}`, b.text ?? ''];
    case 'status': return [b.text ?? ''];
    case 'close': return [b.kicker ?? '', ...b.lines];
    case 'link': return [b.title, b.text ?? ''];
    case 'recent': return [b.title, b.text ?? ''];
    case 'roster': return [b.title, b.text ?? ''];
    case 'quote': return b.lines;
  }
}

/**
 * A scene is data, checked before it is drawn: the checks keep a video honest (status and source
 * on screen, hook words from the source, no outrage words) and legible (reading speed).
 */
export function loadScene(text: string): Scene {
  const s = parse(text) as Scene;
  if (!s || typeof s !== 'object') throw new Error('scene: not a scene');
  s.labels ||= [];
  s.beats ||= [];
  const problems = validate(s);
  if (problems.length) throw new Error(`scene ${s.id}: ${problems.join('; ')}`);
  return s;
}
