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

async function accessToken(refreshToken) {
  const body = new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID,
    client_secret: process.env.YOUTUBE_CLIENT_SECRET,
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

async function upload(sceneId, metadataFile, videoFile, lang = 'tr') {
  // Each channel has its own refresh token under the same client id/secret: the Turkish channel
  // (@ConflictGridTR) is YOUTUBE_REFRESH_TOKEN, the English one (@Conflict-Grid) is
  // YOUTUBE_REFRESH_TOKEN_EN. Mint them with tools/post/youtube-oauth.mjs, once per channel.
  const tokenKey = lang === 'en' ? 'YOUTUBE_REFRESH_TOKEN_EN' : 'YOUTUBE_REFRESH_TOKEN';
  const channel = lang === 'en' ? '@Conflict-Grid (English)' : '@ConflictGridTR (Turkish)';
  const required = ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', tokenKey];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.includes(tokenKey) && !process.env.YOUTUBE_CLIENT_ID && !process.env.YOUTUBE_CLIENT_SECRET) {
    const message = `YouTube upload skipped for ${channel}: OAuth secrets are not configured, so no channel is connected. Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET and ${tokenKey} (and optionally YOUTUBE_PRIVACY_STATUS) to publish. Mint the token with tools/post/youtube-oauth.mjs.`;
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

  const token = await accessToken(process.env[tokenKey]);
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
  const [sceneId, metadataFile, videoFile, lang] = process.argv.slice(2);
  if (!sceneId || !metadataFile || !videoFile) throw new Error('Usage: youtube-upload.mjs <scene> <meta.json> <video.mp4> [tr|en]');
  upload(sceneId, metadataFile, videoFile, lang === 'en' ? 'en' : 'tr').catch((error) => {
    console.error(error.message);
    summary(`YouTube upload failed: ${error.message}`);
    process.exitCode = 1;
  });
}