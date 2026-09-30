/**
 * Map labels without collisions. Labels are placed in priority order; each tries its own spot and
 * a few nearby ones, and is left out if all of them overlap something already placed (another
 * label, the emblem, the event ring, the text block). A dropped label is better than two unreadable
 * ones: the reference frames' "UKRAYNA" printed across "RUSYA FEDERASYONU" was exactly that.
 */
export interface Box { x: number; y: number; w: number; h: number }
export interface Label { text: string; x: number; y: number; size: number; color: string; spacing: number; weight?: number; priority: number; alpha?: number }

const hit = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function placeLabels(ctx: CanvasRenderingContext2D, labels: Label[], obstacles: Box[]): { label: Label; box: Box }[] {
  const placed: Box[] = [...obstacles];
  const out: { label: Label; box: Box }[] = [];
  for (const l of [...labels].sort((a, b) => a.priority - b.priority)) {
    ctx.font = `${l.weight ?? 500} ${l.size}px X`;
    ctx.letterSpacing = `${l.spacing * l.size}px`;
    const w = ctx.measureText(l.text).width, h = l.size * 1.3;
    const tries: [number, number][] = [[0, 0], [0, -1.4 * h], [0, 1.4 * h], [w * 0.35, 0], [-w * 0.35, 0], [0, -2.6 * h], [0, 2.6 * h]];
    for (const [dx, dy] of tries) {
      const box = { x: l.x + dx - w / 2 - 6, y: l.y + dy - h / 2 - 4, w: w + 12, h: h + 8 };
      if (box.x < 20 || box.x + box.w > 1060 || box.y < 20) continue;
      if (placed.some((p) => hit(p, box))) continue;
      placed.push(box);
      out.push({ label: { ...l, x: l.x + dx, y: l.y + dy }, box });
      break;
    }
  }
  return out;
}

export function drawLabels(ctx: CanvasRenderingContext2D, placed: { label: Label }[]) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const { label: l } of placed) {
    ctx.font = `${l.weight ?? 500} ${l.size}px X`;
    ctx.letterSpacing = `${l.spacing * l.size}px`;
    ctx.globalAlpha = l.alpha ?? 1;
    ctx.fillStyle = l.color;
    ctx.fillText(l.text, l.x, l.y);
  }
  ctx.globalAlpha = 1;
  ctx.letterSpacing = '0px';
}
