// Fit a scene's timeline to its text. Translating the on-screen copy to another language changes its
// length — English headlines run longer than Turkish ones — so a scene that was legible in Turkish can
// fail the reading-speed check (src/engine/scene.ts CPS) once translated. refit() scales every time in
// the scene (each beat's start, the duration, and the camera path) by the single factor that makes the
// slowest block fit, keeping the motion's shape and order. The narration is retimed to the voice later
// (tools/audio/retime.mjs); this only guarantees the words can be read.
import { CPS, MIN_BLOCK, beatText } from '../../src/engine/scene.ts';

/** Characters a block shows (the hook, or one beat), matching validate()'s own counting. */
function hookChars(scene) {
  return [...scene.hook.lines, scene.hook.sub.replace(/\{[^}]*\}/g, '000')].join(' ').length;
}

/** The factor the timeline must grow by so every block gets chars/CPS seconds (never below 1);
 *  `slack` seconds are added to every block's need. */
export function fitScale(scene, slack = 0) {
  const ends = [...scene.beats.map((b) => b.at), scene.duration];
  let scale = 1;
  const consider = (chars, available) => {
    if (available <= 0) return;
    const needed = Math.max(MIN_BLOCK, chars / CPS) + slack;
    if (needed / available > scale) scale = needed / available;
  };
  consider(hookChars(scene), ends[0]);
  scene.beats.forEach((b, i) => consider(beatText(b).join(' ').length, ends[i + 1] - b.at));
  return scale;
}

/** Scale every time in the scene by `fitScale`, rounded to the frame, so the translated text is
 *  readable. Mutates and returns the scene. A scale of 1 (the text already fits) is a no-op. */
export function refit(scene) {
  const q = 1 / (scene.fps || 60);
  if (fitScale(scene) <= 1) return scene;
  // rounding both ends of a block to the frame can take up to a frame off it, which failed the
  // tightest block by a hair ("needs 5.9 s, it gets 5.9 s", 2026-10-23): plan one frame more
  const scale = fitScale(scene, q);
  const at = (t) => Math.round((t * scale) / q) * q;
  scene.beats.forEach((b) => { b.at = at(b.at); });
  scene.duration = at(scene.duration);
  if (scene.camera) {
    if (typeof scene.camera.seconds === 'number') scene.camera.seconds = at(scene.camera.seconds);
    if (Array.isArray(scene.camera.keys)) scene.camera.keys.forEach((k) => { k.t = at(k.t); });
  }
  return scene;
}
