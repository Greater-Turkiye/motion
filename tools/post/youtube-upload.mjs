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
  const titleLine = lines.find((line) => line.startsWith('Başlık: '));
  const descriptionIndex = lines.indexOf('Açıklama:');
  if (!titleLine || descriptionIndex < 0) throw new Error('YouTube title or description is missing');
  const title = titleLine.slice('Başlık: '.length).trim();
  const description = lines.slice(descriptionIndex + 1).join('\n').trim();
  if (!title || title.length > 100) throw new Error(`YouTube title must be 1-100 characters, got ${title.length}`);
  if (!description || Buffer.byteLength(description, 'utf8') > 5000) throw new Error('YouTube description must be 1-5000 bytes');
  return { title, description };
}

export function youtubeResource(scene, post, privacyStatus) {
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
      defaultLanguage: 'tr',
      defaultAudioLanguage: 'tr',
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

async function accessToken() {
  const body = new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID,
    client_secret: process.env.YOUTUBE_CLIENT_SECRET,
    refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
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

async function upload(sceneId, metadataFile, videoFile) {
  const required = ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REFRESH_TOKEN'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length === required.length) {
    const message = 'YouTube upload skipped: OAuth repository secrets are not configured.';
    console.log(message);
    summary(message);
    return;
  }
  if (missing.length) throw new Error(`Incomplete YouTube OAuth configuration: missing ${missing.join(', ')}`);

  const scene = parse(sceneFile(ROOT, sceneId));
  const meta = JSON.parse(readFileSync(metadataFile, 'utf8'));
  const post = youtubePost(captions(scene, meta));
  const privacyStatus = process.env.YOUTUBE_PRIVACY_STATUS || 'unlisted';
  const resource = youtubeResource(scene, post, privacyStatus);
  const size = statSync(videoFile).size;
  if (!size) throw new Error(`Video is empty: ${videoFile}`);

  const token = await accessToken();
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
  console.log(`Uploaded ${path.basename(videoFile)} as ${privacyStatus}: ${url}`);
  summary(`YouTube upload (${privacyStatus}): ${url}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [sceneId, metadataFile, videoFile] = process.argv.slice(2);
  if (!sceneId || !metadataFile || !videoFile) throw new Error('Usage: youtube-upload.mjs <scene> <meta.json> <video.mp4>');
  upload(sceneId, metadataFile, videoFile).catch((error) => {
    console.error(error.message);
    summary(`YouTube upload failed: ${error.message}`);
    process.exitCode = 1;
  });
}