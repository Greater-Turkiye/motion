import assert from 'node:assert/strict';
import test from 'node:test';
import { youtubePost, youtubeResource } from './youtube-upload.mjs';

test('extracts the factual Shorts title and description', () => {
  const post = youtubePost([
    '=== INSTAGRAM ===',
    'Not for YouTube',
    '=== YOUTUBE SHORTS ===',
    'Başlık: Sumy yakınlarında saldırı #Shorts',
    '',
    'Açıklama:',
    'Sumy yakınlarında saldırı.',
    'Durum: Doğrulanmadı',
    'Kaynak: Ukrinform (https://example.test)',
    '#Sumy #OSINT #GreaterTürkiye',
    '=== X ===',
    'Not part of description',
  ].join('\n'));

  assert.equal(post.title, 'Sumy yakınlarında saldırı #Shorts');
  assert.match(post.description, /Durum: Doğrulanmadı/);
  assert.doesNotMatch(post.description, /Not part of description/);
});

test('adds factual metadata, hashtags and synthetic-media disclosure', () => {
  const resource = youtubeResource(
    { voice: 'synthetic' },
    { title: 'Girit tatbikatı #Shorts', description: 'Kaynak: örnek #Girit #OSINT' },
    'unlisted',
  );

  assert.equal(resource.snippet.categoryId, '25');
  assert.deepEqual(resource.snippet.tags, ['Shorts', 'Girit', 'OSINT']);
  assert.equal(resource.status.containsSyntheticMedia, true);
  assert.equal(resource.status.privacyStatus, 'unlisted');
  assert.throws(() => youtubeResource({}, { title: 'x', description: 'y' }, 'everyone'), /must be private/);
});

test('reads the English caption markers for the English channel', () => {
  const post = youtubePost([
    '=== YOUTUBE SHORTS ===',
    'Title: Attack near Sumy #Shorts',
    '',
    'Description:',
    'Attack near Sumy.',
    'Status: Unverified',
    '=== X ===',
    'tail',
  ].join('\n'));

  assert.equal(post.title, 'Attack near Sumy #Shorts');
  assert.match(post.description, /Status: Unverified/);
});

test('sets the snippet language from the track', () => {
  const en = youtubeResource({}, { title: 'x', description: 'y' }, 'unlisted', 'en');
  assert.equal(en.snippet.defaultLanguage, 'en');
  assert.equal(en.snippet.defaultAudioLanguage, 'en');
  const tr = youtubeResource({}, { title: 'x', description: 'y' }, 'unlisted');
  assert.equal(tr.snippet.defaultLanguage, 'tr');
});