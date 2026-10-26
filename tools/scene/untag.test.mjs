import assert from 'node:assert/strict';
import test from 'node:test';
import { tidy } from './generate.mjs';

test("a news site's media tag leaves the headline", () => {
  assert.equal(tidy('Ermenistan ve Çekya askeri işbirliğini görüştü (FOTOĞRAFLAR)'), 'Ermenistan ve Çekya askeri işbirliğini görüştü');
  assert.equal(tidy('Tatbikat sona erdi [VIDEO]'), 'Tatbikat sona erdi');
  assert.equal(tidy('Bakan ziyaret etti - FOTO GALERİ'), 'Bakan ziyaret etti');
  // a parenthesis that is part of the story stays
  assert.equal(tidy('F-16 (Blok 70) teslim edildi'), 'F-16 (Blok 70) teslim edildi');
});
