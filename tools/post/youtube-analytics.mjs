// The daily analytics pull: every connected channel's per-video numbers and the retention curve of its
// recent videos, written as JSON so the selector and the templates can learn from what people watched.
//
//   node tools/post/youtube-analytics.mjs <out dir> [--days 90] [--curves 20]
//
// Reads the same refresh tokens as tools/post/youtube-upload.mjs (CHANNELS there). A token minted before
// 2026-10-25 carries the upload scope only and cannot read analytics: the channel is then skipped with a
// warning; mint it again with tools/post/youtube-oauth.mjs, which now asks for yt-analytics.readonly.
//
// What is written, per channel, to <out>/<channel>/latest.json (and a dated copy):
//   videos   per video: views (every start and replay since 2025-03-31), engagedViews (the older
//            definition: viewers who chose to keep watching), averageViewPercentage, averageViewDuration,
//            likes, comments, shares, subscribersGained, with the title and publish date
//   days     the channel's daily totals
//   curves   for the newest videos: the audience retention curve (audienceWatchRatio and
//            relativeRetentionPerformance at each 1 % of the video)
// Studio's "viewed vs swiped away" share is not in the Analytics API, so it is not here.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHANNELS, accessToken } from './youtube-upload.mjs';

const API = 'https://youtubeanalytics.googleapis.com/v2/reports';
const DATA = 'https://www.googleapis.com/youtube/v3';
const day = (d) => d.toISOString().slice(0, 10);

async function call(url, token) {
  const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(`${r.status} ${body.error?.message ?? ''}`.trim());
    err.status = r.status;
    throw err;
  }
  return body;
}

/** One report as rows of objects, dropping metrics the API refuses (engagedViews is newer than some
 *  accounts' reporting) rather than losing the whole report. */
async function report(token, params, metrics) {
  let left = [...metrics];
  while (left.length) {
    const q = new URLSearchParams({ ids: 'channel==MINE', ...params, metrics: left.join(',') });
    try {
      const body = await call(`${API}?${q}`, token);
      const cols = (body.columnHeaders ?? []).map((c) => c.name);
      return (body.rows ?? []).map((row) => Object.fromEntries(row.map((v, i) => [cols[i], v])));
    } catch (e) {
      const bad = left.find((m) => e.message.includes(m));
      if (e.status === 400 && bad) { left = left.filter((m) => m !== bad); continue; }
      throw e;
    }
  }
  return [];
}

async function channel(key, conf, { days, curves }) {
  const refresh = process.env[conf.token];
  if (!refresh) return { skipped: `${conf.token} is not set` };
  const token = await accessToken(refresh, conf.client);
  const end = new Date(), start = new Date(Date.now() - days * 864e5);
  const span = { startDate: day(start), endDate: day(end) };
  const videos = await report(token, { ...span, dimensions: 'video', sort: '-views', maxResults: '200' },
    ['views', 'engagedViews', 'averageViewPercentage', 'averageViewDuration', 'likes', 'comments', 'shares', 'subscribersGained']);
  // titles and publish dates, 50 at a time (Data API)
  for (let i = 0; i < videos.length; i += 50) {
    const ids = videos.slice(i, i + 50).map((v) => v.video).join(',');
    const body = await call(`${DATA}/videos?part=snippet,contentDetails&id=${ids}`, token);
    for (const it of body.items ?? []) {
      const v = videos.find((x) => x.video === it.id);
      if (v) Object.assign(v, { title: it.snippet.title, published: it.snippet.publishedAt, duration: it.contentDetails.duration });
    }
  }
  const totals = await report(token, { ...span, dimensions: 'day', sort: 'day' }, ['views', 'engagedViews', 'shares', 'subscribersGained']);
  const newest = [...videos].sort((a, b) => String(b.published).localeCompare(String(a.published))).slice(0, curves);
  const curveOf = {};
  for (const v of newest) {
    curveOf[v.video] = await report(token, { ...span, dimensions: 'elapsedVideoTimeRatio', filters: `video==${v.video}` },
      ['audienceWatchRatio', 'relativeRetentionPerformance']).catch((e) => ({ error: e.message }));
  }
  return { channel: conf.name, fetched: new Date().toISOString(), span, videos, days: totals, curves: curveOf };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2] || 'analytics';
  const opt = (n, d) => (process.argv.includes(`--${n}`) ? Number(process.argv[process.argv.indexOf(`--${n}`) + 1]) : d);
  const days = opt('days', 90), curves = opt('curves', 20);
  let ok = 0;
  for (const [key, conf] of Object.entries(CHANNELS)) {
    try {
      const data = await channel(key, conf, { days, curves });
      if (data.skipped) { console.log(`${key}: skipped (${data.skipped})`); continue; }
      mkdirSync(path.join(out, key), { recursive: true });
      const json = JSON.stringify(data, null, 1);
      writeFileSync(path.join(out, key, 'latest.json'), json);
      writeFileSync(path.join(out, key, `${day(new Date())}.json`), json);
      console.log(`${key}: ${data.videos.length} videos, ${Object.keys(data.curves).length} retention curves`);
      ok++;
    } catch (e) {
      // 403 insufficient scope: a token minted for upload only
      const hint = e.status === 403 ? ' (token lacks yt-analytics.readonly: mint it again with tools/post/youtube-oauth.mjs --save ' + conf.token + ')' : '';
      console.log(`::warning::${key}: ${e.message}${hint}`);
    }
  }
  console.log(`${ok} channel(s) written to ${out}`);
}
