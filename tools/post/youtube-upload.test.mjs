import assert from 'node:assert/strict';
import test from 'node:test';
import { CHANNELS, withLink, youtubePost, youtubeResource } from './youtube-upload.mjs';

test('the Conflict Grid channels keep their client; the Greater Türkiye family uses its own', () => {
  assert.deepEqual([CHANNELS.tr.token, CHANNELS.tr.client], ['YOUTUBE_REFRESH_TOKEN', 'YOUTUBE']);
  assert.deepEqual([CHANNELS.en.token, CHANNELS.en.client], ['YOUTUBE_REFRESH_TOKEN_EN', 'YOUTUBE']);
  for (const k of ['gt', 'defence', 'numbers', 'earth']) {
    assert.equal(CHANNELS[k].client, 'YOUTUBE_GT');
    assert.equal(CHANNELS[k].lang, 'en');
    assert.match(CHANNELS[k].token, /^YOUTUBE_[A-Z]+_REFRESH_TOKEN$/);
  }
});

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

test('adds factual metadata and hashtags, no AI label on code-drawn video', () => {
  const resource = youtubeResource(
    { voice: 'synthetic' },
    { title: 'Girit tatbikatı #Shorts', description: 'Kaynak: örnek #Girit #OSINT' },
    'unlisted',
  );

  assert.equal(resource.snippet.categoryId, '25');
  assert.deepEqual(resource.snippet.tags, ['Shorts', 'Girit', 'OSINT']);
  assert.equal(resource.status.containsSyntheticMedia, false);
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
test('the YouTube link is added to the release metadata per channel', () => {
  const a = withLink({ id: 'x', youtube: { tr: 'https://www.youtube.com/shorts/a' } }, 'en', 'https://www.youtube.com/shorts/b');
  assert.deepEqual(a.youtube, { tr: 'https://www.youtube.com/shorts/a', en: 'https://www.youtube.com/shorts/b' });
  assert.equal(a.id, 'x');
});
