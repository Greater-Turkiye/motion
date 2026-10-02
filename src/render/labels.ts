/**
 * Map labels that stay put. Where a label sits is chosen once for the whole video, from sample
 * moments of the camera path, and never changes from one frame to the next: a label that hops
 * between spots reads as a glitch (the owner saw exactly that). A label with several anchors on the
 * ground (TÜRKİYE: centre, Black Sea coast, west, east) gets one of them, so it moves with its
 * country at every zoom; a label with one anchor gets one of a few small offsets around it. When the chosen spot is covered at some moment, by the event ring, the emblem,
 * the text block or a more important label, the label fades in proportion to how much is covered,
 * and near the edge of the frame it fades out instead of vanishing. Every value is a function of
 * the frame's own geometry, so the result is the same in any order and in any browser process.
 */
export interface Box { x: number; y: number; w: number; h: number }
export interface Label { key: string; text: string; x: number; y: number; size: number; color: string; spacing: number; weight?: number; priority: number; alpha?: number;
  /** never faded by another label (TÜRKİYE): only by the text block, the emblem or leaving the frame */
  sticky?: boolean;
  /** a thin outline in the map's paper colour, so a name stays readable where it runs over a
   *  neighbour's fill or a border (BULGARİSTAN over the edge of Türkiye) */
  halo?: string;
  /** screen positions of alternative anchors on the ground (null when behind the globe); x, y is the first */
  alts?: ([number, number] | null)[] }

/** Candidate spots, in units of the label's own height (dy) and width (dx). */
// the farthest two clear the event ring's keep-out (190 px) when a capital and the event coincide
const SPOTS: [number, number][] = [[0, 0], [0, -1.4], [0, 1.4], [0.35, 0], [-0.35, 0], [0, -2.6], [0, 2.6], [0, -3.4], [0, 3.4]];

/** How many places a label can take: its ground anchors, or the offsets around its only anchor. */
const choices = (l: Label) => (l.alts && l.alts.length > 1 ? l.alts.length : SPOTS.length);

function boxOf(ctx: CanvasRenderingContext2D, l: Label, choice: number): Box {
  ctx.font = `${l.weight ?? 500} ${l.size}px X`;
  ctx.letterSpacing = `${l.spacing * l.size}px`;
  const w = ctx.measureText(l.text).width, h = l.size * 1.3;
  ctx.letterSpacing = '0px';
  if (l.alts && l.alts.length > 1) {
    const p = l.alts[choice] ?? [-1e5, -1e5]; // behind the globe: far off the frame, so it costs and fades
    return { x: p[0] - w / 2 - 6, y: p[1] - h / 2 - 4, w: w + 12, h: h + 8 };
  }
  const [sx, sy] = SPOTS[choice];
  return { x: l.x + sx * w - w / 2 - 6, y: l.y + sy * h - h / 2 - 4, w: w + 12, h: h + 8 };
}

const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** How much of the box lies outside the frame's usable area (20 px margin), as a share. */
function offFrame(b: Box, W: number, H: number) {
  const inside = Math.max(0, Math.min(b.x + b.w, W - 20) - Math.max(b.x, 20)) * Math.max(0, Math.min(b.y + b.h, H) - Math.max(b.y, 20));
  return 1 - inside / (b.w * b.h);
}

/**
 * The spot for each label, chosen from sample moments: the one with the least covered area summed
 * over all samples, labels planned in priority order so an important label claims its spot first.
 */
export function planSpots(ctx: CanvasRenderingContext2D, samples: { labels: Label[]; obstacles: Box[] }[], W: number, H: number): Map<string, number> {
  const plan = new Map<string, number>();
  const keys = [...new Map(samples.flatMap((s) => s.labels).map((l) => [l.key, l])).values()].sort((a, b) => a.priority - b.priority);
  for (const { key } of keys) {
    let best = 0, bestCost = Infinity;
    const n = choices(samples.flatMap((s) => s.labels).find((x) => x.key === key)!);
    for (let spot = 0; spot < n; spot++) {
      let cost = spot * 0.02; // prefer the natural spot on a tie
      for (const s of samples) {
        const l = s.labels.find((x) => x.key === key);
        if (!l) continue;
        const b = boxOf(ctx, l, spot);
        const area = b.w * b.h;
        const taken = [...s.obstacles, ...s.labels.filter((o) => plan.has(o.key)).map((o) => boxOf(ctx, o, plan.get(o.key)!))];
        cost += taken.reduce((a, o) => a + overlap(b, o), 0) / area + offFrame(b, W, H);
      }
      if (cost < bestCost) { bestCost = cost; best = spot; }
    }
    plan.set(key, best);
  }
  return plan;
}

/** Labels at their planned spots, each faded by what covers it at this moment. */
export function placeLabels(ctx: CanvasRenderingContext2D, labels: Label[], obstacles: Box[], plan: Map<string, number>, W: number, H: number) {
  const placed: { label: Label; box: Box }[] = [];
  for (const l of [...labels].sort((a, b) => a.priority - b.priority)) {
    const box = boxOf(ctx, l, plan.get(l.key) ?? 0);
    const area = box.w * box.h;
    const cover = (bs: Box[]) => bs.reduce((a, o) => Math.max(a, overlap(box, o) / area), 0);
    const byText = cover(obstacles);
    // a steep fade: half-covered labels that linger read as ghosts. A sticky label (TÜRKİYE) gives way
    // to no other label, but it does give way to the text block and the emblem: the country's own
    // fill still says where Türkiye is, and "KİEV · 30 EYLÜLTÜRKİYE" reads as one broken line
    // another name touching this one at all makes it give way entirely: two names stacked a few
    // pixels apart (UKRAYNA over KARADENİZ) read as one garbled word
    const byLabel = cover(placed.filter((p) => (p.label.alpha ?? 1) > 0.3).map((p) => p.box));
    const vis = (l.sticky ? 1 - smooth(0.02, 0.08, byText) : (1 - smooth(0.02, 0.12, byText)) * (1 - smooth(0.0, 0.03, byLabel))) * (1 - smooth(0.0, 0.45, offFrame(box, W, H)));
    const alpha = (l.alpha ?? 1) * vis;
    if (alpha <= 0.01) continue;
    placed.push({ label: { ...l, alpha, x: box.x + 6 + (box.w - 12) / 2, y: box.y + 4 + (box.h - 8) / 2 }, box });
  }
  return placed;
}

const smooth = (a: number, b: number, x: number) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

export function drawLabels(ctx: CanvasRenderingContext2D, placed: { label: Label }[]) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const { label: l } of placed) {
    ctx.font = `${l.weight ?? 500} ${l.size}px X`;
    ctx.letterSpacing = `${l.spacing * l.size}px`;
    ctx.globalAlpha = l.alpha ?? 1;
    if (l.halo) {
      ctx.strokeStyle = l.halo; ctx.lineWidth = l.size * 0.22; ctx.lineJoin = 'round';
      ctx.strokeText(l.text, l.x, l.y);
    }
    ctx.fillStyle = l.color;
    ctx.fillText(l.text, l.x, l.y);
  }
  ctx.globalAlpha = 1;
  ctx.letterSpacing = '0px';
}
