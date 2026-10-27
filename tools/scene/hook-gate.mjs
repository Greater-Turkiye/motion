// No video with a label for a hook (owner, 2026-10-27: "GAZZE / RESMİ AÇIKLAMA", "IRAK / GELİŞME" have a 0 %
// chance). After the copy editor (nim-copy.mjs): when it could not write the hook and the generator's hook
// ends on a type word, exit 4 so the production stops before the voice and nothing is published; the next
// scheduled run tries again, by when the editor's model is usually free.
//   node tools/scene/hook-gate.mjs scenes/auto/auto-<id>.yaml
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

export const LABEL = /^(GELİŞME|SALDIRI|SALDIRISI|İHA SALDIRISI|FÜZE SALDIRISI|HAVA SALDIRISI|TOPÇU ATIŞI|ÇATIŞMA|RESMİ AÇIKLAMA|AÇIKLAMA|KONUŞLANMA|TATBİKAT|YAPTIRIM|YAPTIRIMLAR|ANLAŞMA|GÖRÜŞME|OLAY)$/u;
export const labelHook = (hook) => !hook.edited && (LABEL.test(hook.lines.at(-1)?.trim() ?? '') || /\b(SALDIRISI|SALDIRI|GELİŞME)$/u.test(hook.lines.at(-1)?.trim() ?? ''));

if (process.argv[1]?.endsWith('hook-gate.mjs')) {
  const scene = parse(readFileSync(process.argv[2], 'utf8'));
  if (labelHook(scene.hook)) {
    console.log(`::error::no video: the hook is a label ("${scene.hook.lines.join(' / ')}") and the copy editor could not write one; the next run tries again`);
    process.exit(4);
  }
  console.log(`hook: ${scene.hook.lines.join(' / ')}${scene.hook.edited ? ' (edited)' : ''}`);
}
