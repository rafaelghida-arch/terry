/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBrief, titleFromBrief } from './brief';
import { buildTimeline, cropRectFor, suggestTrim, buildExportSpec, segmentAt, framingFromCropCenter } from './timeline';
import { classifyAudio, localAnalysis, metricsFromRaw, terryLineFor, featuresFromMetrics, cutsFromDiffs, defaultFeatures } from './style';
import { generateHooksLocal, regenerateSceneLocal } from './scriptLocal';
import type { Clip, Project, Reference, StyleFeatures } from './types';

const BRIEF = 'Vou provar um xis de costela de R$ 38 em Porto Alegre. Quero mostrar o tamanho e contar se compraria de novo.';

test('briefing: extrai prato, preço, lugar e intenções', () => {
  const f = parseBrief(BRIEF);
  assert.equal(f.dish, 'xis de costela');
  assert.equal(f.dishShort, 'xis');
  assert.equal(f.price, '38 reais');
  assert.equal(f.place, 'Porto Alegre');
  assert.ok(f.wantsScale && f.wantsVerdict && f.isTasting);
  assert.equal(titleFromBrief(BRIEF), 'Xis de costela · Porto Alegre');
});

test('enquadramento: vídeo horizontal recorta 9:16 e respeita deslocamento', () => {
  const c = cropRectFor(1920, 1080, { x: 0, y: 0, zoom: 1 });
  assert.ok(Math.abs(c.height - 1) < 1e-9);
  assert.ok(Math.abs(c.width * 1920 / 1080 - 9 / 16) < 1e-9);
  assert.ok(Math.abs(c.left - (1 - c.width) / 2) < 1e-9);
  const left = cropRectFor(1920, 1080, { x: -1, y: 0, zoom: 1 });
  assert.equal(left.left, 0);
  const right = cropRectFor(1920, 1080, { x: 1, y: 0, zoom: 1 });
  assert.ok(Math.abs(right.left + right.width - 1) < 1e-9);
  const vertical = cropRectFor(1080, 1920, { x: 0.5, y: 0, zoom: 1 });
  assert.deepEqual([vertical.left, vertical.width], [0, 1]);
  const zoom = cropRectFor(1080, 1920, { x: 0, y: 0, zoom: 2 });
  assert.ok(Math.abs(zoom.width - 0.5) < 1e-9 && Math.abs(zoom.left - 0.25) < 1e-9);
});

const clip = (id: string, duration: number, extra: Partial<Clip> = {}): Clip => ({
  id, uri: `file:///${id}.mp4`, origin: 'camera', duration, width: 1080, height: 1920, hasAudio: true,
  trimStart: 0, trimEnd: duration, framing: { x: 0, y: 0, zoom: 1 }, createdAt: 0, ...extra,
});

test('linha do tempo: ordem do roteiro, cenas vazias e dispensadas, reordenação mantém associação', () => {
  const hooks = generateHooksLocal({ brief: BRIEF, features: defaultFeatures(), targetDuration: 30, audioModes: ['fala', 'ambiente'] });
  const scenes = hooks[0].scenes.map((s) => ({ ...s }));
  const clips: Record<string, Clip> = {};
  // grava a última cena primeiro (ex.: fachada por último ou primeiro, tanto faz)
  scenes[0].clipId = 'a'; clips.a = clip('a', 4);
  scenes[2].clipId = 'b'; clips.b = clip('b', 10, { trimStart: 2, trimEnd: 5 });
  const p = { scenes, clips, skippedSceneIds: [scenes[1].id] };
  const tl = buildTimeline(p);
  assert.equal(tl.segments.length, 2);
  assert.equal(tl.total, 7);
  assert.equal(tl.skipped.length, 1);
  assert.equal(tl.missing.length, scenes.length - 3);
  // reordena: cena 2 vai para o topo — o clipe vai junto
  const reordered = [scenes[2], scenes[0], ...scenes.slice(1, 2), ...scenes.slice(3)];
  const tl2 = buildTimeline({ ...p, scenes: reordered });
  assert.equal(tl2.segments[0].clip.id, 'b');
  assert.equal(tl2.segments[1].offset, 3);
  assert.deepEqual(segmentAt(tl2, 3.5), { index: 1, local: 0.5 });
});

test('aparar: sugere trecho só quando o clipe é longo e respeita entrada da voz', () => {
  assert.equal(suggestTrim(4, { duration: 3, role: 'escala' }).trimmed, false);
  const t = suggestTrim(20, { duration: 3, role: 'escala' });
  assert.ok(t.trimmed && Math.abs(t.end - t.start - 3) < 0.01);
  const v = suggestTrim(20, { duration: 3, role: 'gancho' }, 6);
  assert.equal(v.start, 5.5);
  const m = suggestTrim(30, { duration: 5, role: 'mordida' });
  assert.ok(m.end - m.start > 5);
});

test('exportação: spec com recorte, volumes e narração só quando escolhida', () => {
  const scenes = [{ id: 's1', role: 'gancho' as const, title: '', instruction: '', duration: 3, audio: '', clipId: 'a' }];
  const base: Project = {
    id: 'p', version: 1, title: '', createdAt: 0, updatedAt: 0, isDemo: false, stage: 'edit', brief: '', targetDuration: 15,
    audioModes: ['fala'], references: [], scriptApproved: true, scenes, clips: { a: clip('a', 5, { width: 1920, height: 1080 }) },
    skippedSceneIds: [], edit: { originalVolume: 0.6, narrationVolume: 1, narration: { uri: 'file:///n.m4a', duration: 9 } },
  };
  const spec = buildExportSpec(base, '/tmp/out.mp4');
  assert.equal(spec.segments[0].volume, 0.6);
  assert.ok(spec.segments[0].crop.width < 0.5);
  assert.equal(spec.narration, undefined);
  const spec2 = buildExportSpec({ ...base, audioModes: ['narracao'] }, '/tmp/out.mp4');
  assert.equal(spec2.narration?.duration, 5);
});

function synthAudio(kind: 'voz' | 'chiado' | 'silencio', seconds: number, win = 0.1) {
  const rms: number[] = [];
  const zcr: number[] = [];
  for (let i = 0; i < seconds / win; i++) {
    if (kind === 'silencio') { rms.push(-70); zcr.push(0.01); }
    if (kind === 'chiado') { rms.push(-24 + Math.sin(i) * 0.5); zcr.push(0.4); }
    if (kind === 'voz') { rms.push(i % 3 === 0 ? -42 : -20 + (i % 2) * 3); zcr.push(0.08); }
  }
  return { rms, zcr };
}

test('áudio: chiado constante não conta como voz; fala modulada conta', () => {
  const a = synthAudio('silencio', 1);
  const b = synthAudio('chiado', 4);
  const c = synthAudio('voz', 5);
  const res = classifyAudio([...a.rms, ...b.rms, ...c.rms], [...a.zcr, ...b.zcr, ...c.zcr], 0.1);
  assert.ok(res.voiceOnset !== null && res.voiceOnset >= 4.5 && res.voiceOnset <= 5.5, `onset ${res.voiceOnset}`);
  assert.ok(res.ambientShare > 0.3);
});

function refWith(voiceFirst: boolean, id: string): Reference {
  const s = voiceFirst ? synthAudio('voz', 12) : (() => { const x = synthAudio('chiado', 5); const y = synthAudio('voz', 7); return { rms: [...x.rms, ...y.rms], zcr: [...x.zcr, ...y.zcr] }; })();
  const metrics = metricsFromRaw({ duration: 12, width: 1080, height: 1920, hasAudio: true, cuts: voiceFirst ? [4, 8] : [1.5, 3, 4.5, 6, 7.5, 9, 10.5], rmsDb: s.rms, zcr: s.zcr, audioWindow: 0.1, frames: [] });
  return { id, uri: '', name: id, duration: 12, width: 1080, height: 1920, metrics };
}

test('análise local: observação verdadeira e fala do TERRY só quando vale para todas', () => {
  const a = localAnalysis([refWith(false, 'r1'), refWith(false, 'r2')]);
  assert.ok(a.observations.some((o) => o.text.startsWith('Nos dois vídeos, ninguém fala')));
  assert.match(a.terryLine ?? '', /Nos dois vídeos/);
  assert.equal(a.divergent, false);
  const mixed = localAnalysis([refWith(false, 'r1'), refWith(true, 'r2')]);
  assert.equal(mixed.divergent, true);
  assert.ok(!mixed.observations.some((o) => o.text.includes('ninguém fala')));
});

test('fala da comida antes da fala só aparece quando a IA confirma em todas', () => {
  const f = (v: boolean | null): StyleFeatures => ({ ...defaultFeatures(), foodBeforeSpeech: v });
  assert.equal(terryLineFor(f(true), [f(true), f(true)]), 'Nos dois vídeos, a comida aparece antes de alguém falar. Quer abrir o teu assim também?');
  assert.notEqual(terryLineFor(f(null), [f(true), f(false)])?.includes('comida aparece'), true);
});

test('roteiro: referências diferentes mudam a primeira tomada; ganchos mudam o que se grava', () => {
  const sound = featuresFromMetrics(refWith(false, 'x').metrics!);
  const talk = featuresFromMetrics(refWith(true, 'y').metrics!);
  const hs = generateHooksLocal({ brief: BRIEF, features: sound, targetDuration: 30, audioModes: ['fala', 'ambiente'] });
  const ht = generateHooksLocal({ brief: BRIEF, features: talk, targetDuration: 30, audioModes: ['fala'] });
  assert.match(hs[0].scenes[0].instruction, /costela na chapa/);
  assert.match(ht[0].scenes[0].instruction, /Segura o xis ao lado do rosto/);
  assert.equal(ht[0].scenes[0].line, 'Que tamanho de xis vem por 38 reais?');
  assert.notEqual(hs[0].scenes[0].instruction, hs[1].scenes[0].instruction);
  // mordida sem veredito escrito
  const bite = hs[0].scenes.find((s) => s.role === 'mordida')!;
  assert.equal(bite.line, undefined);
  // durações perto do alvo
  const total = hs[0].scenes.reduce((a, s) => a + s.duration, 0);
  assert.ok(total >= 25 && total <= 36, `total ${total}`);
  // regenerar preserva id e clipe
  const s0 = { ...hs[0].scenes[1], clipId: 'c1' };
  const r = regenerateSceneLocal(s0, { brief: BRIEF, features: sound, targetDuration: 30, audioModes: ['fala'] }, 1);
  assert.equal(r.id, s0.id);
  assert.equal(r.clipId, 'c1');
});

test('roteiro: nunca traz preço ou prato que não estão no briefing', () => {
  const hs = generateHooksLocal({ brief: 'Vou mostrar uma pizza de calabresa no centro', features: defaultFeatures(), targetDuration: 15, audioModes: ['ambiente'] });
  const text = JSON.stringify(hs);
  assert.ok(!/R\$|reais|xis|costela/.test(text));
  assert.match(text, /pizza/);
  assert.match(text, /no forno/);
});

test('cortes: picos isolados viram cortes; movimento contínuo não', () => {
  const diffs = Array.from({ length: 40 }, (_, i) => (i === 9 || i === 25 ? 0.4 : 0.03 + (i % 3) * 0.01));
  assert.deepEqual(cutsFromDiffs(diffs, 0.25), [2.5, 6.5]);
  const pan = Array.from({ length: 40 }, () => 0.09);
  assert.deepEqual(cutsFromDiffs(pan, 0.25), []);
});

test('enquadramento: inverso devolve o mesmo deslocamento', () => {
  const f = { x: 0.4, y: 0, zoom: 1.5 };
  const c = cropRectFor(1920, 1080, f);
  const back = framingFromCropCenter(c.left + c.width / 2, c.top + c.height / 2, c, 1.5);
  assert.ok(Math.abs(back.x - 0.4) < 1e-9);
});
