// The studio: one recent story of each family, drawn in every style, so the default style of each
// family can be chosen by looking (PLAN.md section 15; config/styles.yaml holds the choice).
//
//   node tools/scene/studio.mjs --datasets ../datasets [--out out/studio]
//
// For each family (strike, deal, exercise, statement, count) it takes the newest record whose scene
// uses that family's template, and draws three stills in each style: the hook, the family's own beat
// (the link, the roster, the quote, the pattern or the distance) and the status. Stills are 360x640
// JPEGs; studio.json lists them with the record, its title and the family's current default.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';
import { parse, stringify } from 'yaml';
import { generate, records, styleFor } from './generate.mjs';
import { STYLE_IDS } from '../../src/engine/scene.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FAMILIES = ['strike', 'deal', 'exercise', 'statement', 'count'];
const args = new Map();
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) args.set(a.slice(2), process.argv[i + 1]?.startsWith('--') ? true : process.argv[++i]); }
const datasets = args.get('datasets');
const OUT = path.resolve(ROOT, args.get('out') || 'out/studio');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

/** The moments worth a still: the hook, the family's own beat, the status. */
function moments(scene) {
  const fps = scene.fps;
  const own = scene.beats.find((b) => ['link', 'roster', 'quote', 'recent', 'distance'].includes(b.kind)) ?? scene.beats.find((b) => b.kind === 'facts');
  const status = scene.beats.find((b) => b.kind === 'status');
  return [1.0, own ? own.at + 1.6 : 4, status ? status.at + 1.0 : scene.duration - 3].map((t) => Math.round(t * fps));
}

const newest = [...records(datasets)].sort((a, b) => String(b.reported_at ?? b.time.start).localeCompare(String(a.reported_at ?? a.time.start)));
const picks = [];
for (const family of FAMILIES) {
  for (const r of newest) {
    let scene;
    try { scene = generate(r, { datasets }); } catch { continue; }
    if (scene.template !== family) continue;
    scene.id = `studio-${family}`;
    mkdirSync(path.join(ROOT, 'scenes', 'auto'), { recursive: true });
    writeFileSync(path.join(ROOT, 'scenes', 'auto', `${scene.id}.yaml`), stringify(scene, { flowLevel: 3, lineWidth: 0 }));
    picks.push({ family, record: r, scene });
    break;
  }
}
console.log(`families: ${picks.map((p) => p.family).join(', ')}`);

execFileSync('npx', ['vite', 'build', '--logLevel', 'warn'], { cwd: ROOT, stdio: 'inherit', shell: true });
const out = [];
for (const { family, record, scene } of picks) {
  const frames = moments(scene);
  const stills = {};
  for (const style of STYLE_IDS) {
    const tmp = path.join(OUT, '_tmp');
    rmSync(tmp, { recursive: true, force: true });
    execFileSync(process.execPath, ['export/render.mjs', '--no-build', '--scene', scene.id, '--style', style, '--frames', frames.join(','), '--save-frames', '--workers', '1', '--out', tmp],
      { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
    const dir = path.join(tmp, readdirSync(tmp).find((d) => d.endsWith('-frames')));
    mkdirSync(path.join(OUT, family), { recursive: true });
    stills[style] = readdirSync(dir).sort().map((f, k) => {
      const rel = `${family}/${style}-${k}.jpg`;
      execFileSync(ffmpegPath, ['-loglevel', 'error', '-y', '-i', path.join(dir, f), '-vf', 'scale=360:640:flags=lanczos', '-q:v', '4', path.join(OUT, rel)]);
      return rel;
    });
  }
  rmSync(path.join(OUT, '_tmp'), { recursive: true, force: true });
  out.push({ family, record: record.id, title: record.title?.tr, date: String(record.time.start).slice(0, 10), type: record.event_type, default: styleFor(record.event_type ?? ''), stills });
  console.log(`${family}: ${record.id} (${Object.keys(stills).length} styles)`);
}
const config = parse(readFileSync(path.join(ROOT, 'config', 'styles.yaml'), 'utf8'));
writeFileSync(path.join(OUT, 'studio.json'), JSON.stringify({ generated: new Date().toISOString(), config, families: out }, null, 1) + '\n');
console.log(`${out.length} families -> ${path.relative(ROOT, OUT)}`);
