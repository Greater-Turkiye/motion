import assert from 'node:assert/strict';
import test from 'node:test';
import { labelHook } from './hook-gate.mjs';

test('a label hook is refused unless the editor wrote it', () => {
  assert.equal(labelHook({ lines: ['GAZZE', 'RESMİ AÇIKLAMA'] }), true);
  assert.equal(labelHook({ lines: ['ÇERNİHİV BÖLGESİ', 'İHA SALDIRISI'] }), true);
  assert.equal(labelHook({ lines: ['IRAK', 'GELİŞME'] }), true);
  assert.equal(labelHook({ lines: ['BM RAPORTÖRÜ:', 'BİZ CEHENNEME DÜŞERKEN'], edited: true }), false);
  assert.equal(labelHook({ lines: ['3 KİŞİ', 'HAYATINI KAYBETTİ'] }), false);
});
