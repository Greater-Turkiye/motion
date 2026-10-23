import { appendFileSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { sceneFile } from '../../export/score.mjs';
import { captions } from './captions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function youtubePost(text) {
  const section = text.split('=== YOUTUBE SHORTS ===')[1]?.split('=== X ===')[0];
  if (!section) throw new Error('YouTube section is missing from the generated captions');
  const lines = section.trim().split(/\r?\n/);
  // The caption file is Turkish ("Başlık:"/"Açıklama:") or English ("Title:"/"Description:")
  // depending on the track; accept either so one uploader serves both channels.
  const titleLine = lines.find((line) => line.startsWith('Başlık: ') || line.startsWith('Title: '));
  const descriptionIndex = lines.findIndex((line) => line === 'Açıklama:' || line === 'Description:');
  if (!titleLine || descriptionIndex < 0) throw new Error('YouTube title or description is missing');
  const title = titleLine.slice(titleLine.indexOf(' ') + 1).trim();
  const description = lines.slice(descriptionIndex + 1).join('\n').trim();
  if (!title || title.length > 100) throw new Error(`YouTube title must be 1-100 characters, got ${title.length}`);
  if (!description || Buffer.byteLength(description, 'utf8') > 5000) throw new Error('YouTube description must be 1-5000 bytes');
  return { title, description };
}

export function youtubeResource(scene, post, privacyStatus, lang = 'tr') {
  if (!['private', 'unlisted', 'public'].includes(privacyStatus)) {
    throw new Error('YOUTUBE_PRIVACY_STATUS must be private, unlisted, or public');
  }
  const hashtags = `${post.title}\n${post.description}`.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  const tags = [...new Set(hashtags)].map((tag) => tag.slice(1)).slice(0, 20);
  return {
    snippet: {
      title: post.title,
      description: post.description,
      tags,
      categoryId: '25',
      defaultLanguage: lang,
      defaultAudioLanguage: lang,
    },
    status: {
      privacyStatus,
      selfDeclaredMadeForKids: false,
      containsSyntheticMedia: scene.voice === 'synthetic',
    },
  };
}

async function responseJson(response, label) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${label} failed (${response.status}): ${JSON.stringify(body)}`);
  return body;
}

/** The channels, by the uploader's last argument. The two Conflict Grid channels share the original
 *  OAuth client; the Greater Türkiye family was authorized through a second client of the same Google
 *  project (YOUTUBE_GT_CLIENT_ID / _SECRET), and a refresh token only works with the client that minted it. */
export const CHANNELS = {
  tr: { token: 'YOUTUBE_REFRESH_TOKEN', client: 'YOUTUBE', lang: 'tr', name: '@ConflictGridTR (Turkish)' },
  en: { token: 'YOUTUBE_REFRESH_TOKEN_EN', client: 'YOUTUBE', lang: 'en', name: '@Conflict-Grid (English)' },
  gt: { token: 'YOUTUBE_GT_REFRESH_TOKEN', client: 'YOUTUBE_GT', lang: 'en', name: '@greaterturkiye (English)' },
  defence: { token: 'YOUTUBE_DEFENCE_REFRESH_TOKEN', client: 'YOUTUBE_GT', lang: 'en', name: '@greaterdefence (English)' },
  numbers: { token: 'YOUTUBE_NUMBERS_REFRESH_TOKEN', client: 'YOUTUBE_GT', lang: 'en', name: '@geocompetitions (English)' },
  earth: { token: 'YOUTUBE_EARTH_REFRESH_TOKEN', client: 'YOUTUBE_GT', lang: 'en', name: '@greaterearth (English)' },
};

async function accessToken(refreshToken, client = 'YOUTUBE') {
  const body = new URLSearchParams({
    client_id: process.env[`${client}_CLIENT_ID`],
    client_secret: process.env[`${client}_CLIENT_SECRET`],
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const token = await responseJson(response, 'YouTube OAuth refresh');
  if (!token.access_token) throw new Error('YouTube OAuth refresh returned no access token');
  return token.access_token;
}

function summary(text) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
}

async function upload(sceneId, metadataFile, videoFile, key = 'tr') {
  // Each channel has its own refresh token (CHANNELS above); mint one with tools/post/youtube-oauth.mjs,
  // once per channel, with the client the channel belongs to.
  const ch = CHANNELS[key];
  const tokenKey = ch.token, channel = ch.name, lang = ch.lang;
  const clientId = `${ch.client}_CLIENT_ID`, clientSecret = `${ch.client}_CLIENT_SECRET`;
  const required = [clientId, clientSecret, tokenKey];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.includes(tokenKey)) {
    const message = `YouTube upload skipped for ${channel}: ${tokenKey} is not configured, so the channel is not connected. Set ${clientId}, ${clientSecret} and ${tokenKey} (and optionally YOUTUBE_PRIVACY_STATUS) to publish. Mint the token with tools/post/youtube-oauth.mjs.`;
    console.log(`::warning::${message}`);
    summary(message);
    return;
  }
  if (missing.length) throw new Error(`Incomplete YouTube OAuth configuration for ${channel}: missing ${missing.join(', ')}`);

  const scene = parse(sceneFile(ROOT, sceneId));
  const meta = JSON.parse(readFileSync(metadataFile, 'utf8'));
  const post = youtubePost(captions(scene, meta));
  const privacyStatus = process.env.YOUTUBE_PRIVACY_STATUS || 'unlisted';
  const resource = youtubeResource(scene, post, privacyStatus, lang);
  const size = statSync(videoFile).size;
  if (!size) throw new Error(`Video is empty: ${videoFile}`);

  const token = await accessToken(process.env[tokenKey], ch.client);
  const initUrl = new URL('https://www.googleapis.com/upload/youtube/v3/videos');
  initUrl.searchParams.set('uploadType', 'resumable');
  initUrl.searchParams.set('part', 'snippet,status');
  const initResponse = await fetch(initUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json; charset=UTF-8',
      'x-upload-content-type': 'video/mp4',
      'x-upload-content-length': String(size),
    },
    body: JSON.stringify(resource),
  });
  if (!initResponse.ok) await responseJson(initResponse, 'YouTube upload initialization');
  const uploadUrl = initResponse.headers.get('location');
  if (!uploadUrl) throw new Error('YouTube did not return a resumable upload URL');

  const uploaded = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'video/mp4', 'content-length': String(size) },
    body: readFileSync(videoFile),
  });
  const result = await responseJson(uploaded, 'YouTube video upload');
  if (!result.id) throw new Error('YouTube upload completed without a video ID');
  const url = `https://www.youtube.com/shorts/${result.id}`;
  console.log(`Uploaded ${path.basename(videoFile)} to ${channel} as ${privacyStatus}: ${url}`);
  summary(`YouTube upload ${channel} (${privacyStatus}): ${url}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [sceneId, metadataFile, videoFile, key = 'tr'] = process.argv.slice(2);
  if (!sceneId || !metadataFile || !videoFile || !CHANNELS[key]) throw new Error(`Usage: youtube-upload.mjs <scene> <meta.json> <video.mp4> [${Object.keys(CHANNELS).join('|')}]`);
  upload(sceneId, metadataFile, videoFile, key).catch((error) => {
    console.error(error.message);
    summary(`YouTube upload failed: ${error.message}`);
    process.exitCode = 1;
  });
}