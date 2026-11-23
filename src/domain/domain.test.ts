/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBrief, titleFromBrief } from './brief';
import { buildTimeline, cropRectFor, suggestTrim, buildExportSpec, segmentAt, framingFromCropCenter } from './timeline';
import { classifyAudio, localAnalysis, metricsFromRaw, terryLineFor, featuresFromMetrics, cutsFromDiffs, defaultFeatures } from './style';
import { articleFor, generateHooksLocal, regenerateSceneLocal } from './scriptLocal';
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
  assert.match(hs[0].scenes[0].instruction, /Abre com a costela na chapa/);
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

test('concordância: artigo certo para ingredientes', () => {
  assert.deepEqual(['costela', 'xis', 'hambúrguer', 'batatas', 'pizza', 'pastel'].map(articleFor), ['a', 'o', 'o', 'as', 'a', 'o']);
});

test('roteiro com prato feminino concorda em gênero', () => {
  const hs = generateHooksLocal({ brief: 'Vou provar uma pizza de calabresa por R$ 50', features: defaultFeatures(), targetDuration: 60, audioModes: ['fala'] });
  const text = JSON.stringify(hs);
  assert.ok(!/ o pizza| do pizza| no pizza|esse pizza|Abrir o pizza/.test(text), text);
  assert.match(text, /Abrir a pizza ao meio|Abre a calabresa no forno/);
});

import { chunkText, draftCaptions, timelineCaptions } from './captions';
import { detectGenre, GENRE_INFO, GENRES } from './genres';
import { subjectFromBrief } from './brief';

test('legendas: blocos curtos, sem palavra sozinha no fim', () => {
  assert.deepEqual(chunkText('Que tamanho de xis vem por 38 reais?'), ['Que tamanho de xis', 'vem por 38 reais?']);
  const c = chunkText('Isso aqui é um teste com sete palavras');
  assert.ok(c.every((x) => x.split(' ').length >= 2));
});

test('legendas: rascunho dentro do trecho do clipe e seguindo a montagem', () => {
  const c = clip('a', 10, { trimStart: 2, trimEnd: 6 });
  const cues = draftCaptions(c, { line: 'Que tamanho de xis vem por 38 reais?' }, 2.5);
  assert.equal(cues[0].start, 2.5);
  assert.ok(cues.every((q) => q.start >= 2 && q.end <= 6));
  const scenes = [
    { id: 's0', role: 'detalhe' as const, title: '', instruction: '', duration: 3, audio: '', clipId: 'b' },
    { id: 's1', role: 'gancho' as const, title: '', instruction: '', duration: 3, audio: '', clipId: 'a' },
  ];
  const p = { scenes, clips: { a: { ...c, captions: cues }, b: clip('b', 3) }, skippedSceneIds: [] };
  const out = timelineCaptions(p);
  // o clipe "a" começa em 3 s na montagem; a fala em 2,5 s do arquivo vira 3,5 s
  assert.equal(out[0].start, 3.5);
  // aparar corta a legenda que ficou de fora
  const trimmed = timelineCaptions({ ...p, clips: { ...p.clips, a: { ...p.clips.a, trimEnd: 3 } } });
  assert.ok(trimmed.every((q) => q.end <= 4.01));
});

test('gêneros: briefing de exemplo de cada gênero é reconhecido', () => {
  for (const g of GENRES) assert.equal(detectGenre(GENRE_INFO[g].example).genre, g, g);
  assert.equal(subjectFromBrief(GENRE_INFO.review.example, 'produto'), 'fone bluetooth');
  assert.equal(subjectFromBrief(GENRE_INFO.opiniao.example, 'tema'), 'nova lei do IPTU');
});

test('gêneros: o roteiro muda com o tipo de conteúdo e respeita as regras', () => {
  const ctx = (g: (typeof GENRES)[number], voice: number | null) => ({
    brief: GENRE_INFO[g].example, features: { ...defaultFeatures(), voiceOnset: voice }, targetDuration: 30 as const, audioModes: ['fala' as const], genre: g,
  });
  const review = generateHooksLocal(ctx('review', 0.4));
  assert.match(review[0].scenes[0].instruction, /Segura o fone bluetooth ao lado do rosto/);
  assert.equal(review[0].scenes[0].line, 'Fone bluetooth de 150 reais: vale a pena?');
  assert.ok(review[0].scenes.some((s) => s.role === 'prova'));
  // veredito e opinião sem fala escrita
  for (const g of ['review', 'opiniao', 'beleza'] as const) {
    const last = generateHooksLocal(ctx(g, 0.4))[0].scenes.at(-1)!;
    assert.equal(last.line, undefined, g);
  }
  const mk = generateHooksLocal(ctx('marketing', null));
  assert.equal(mk[0].scenes.at(-1)!.role, 'chamada');
  const op = JSON.stringify(generateHooksLocal(ctx('opiniao', 0.3)));
  assert.match(op, /fonte/i);
  // referências que abrem pela imagem trocam o gancho principal
  const visual = generateHooksLocal(ctx('beleza', null));
  const talk = generateHooksLocal(ctx('beleza', 0.3));
  assert.notEqual(visual[0].scenes[0].instruction, talk[0].scenes[0].instruction);
  // tutorial não vira roteiro de comida
  assert.ok(!/mordida|chapa|xis/.test(JSON.stringify(generateHooksLocal(ctx('tutorial', 0.3)))));
});

import { captionPalette, fromHex, rgbToHsl } from './palette';
import { combineLook, lookDefaults, zoomFor } from './look';
import { structureFromMetrics } from './style';

test('estrutura: o roteiro segue os planos da referência (quantidade, fala e duração)', () => {
  // referência de 12 s: 2 planos sem fala, depois 3 com fala, 1 sem
  const structure = [
    { duration: 2, voice: false }, { duration: 1.5, voice: false }, { duration: 3, voice: true },
    { duration: 2, voice: true }, { duration: 2, voice: true }, { duration: 1.5, voice: false },
  ];
  const ctx = { brief: GENRE_INFO.review.example, features: defaultFeatures(), targetDuration: 15 as const, audioModes: ['fala' as const], genre: 'review' as const, structure };
  const [h] = generateHooksLocal(ctx);
  assert.equal(h.scenes.length, 8); // 6 planos em 12 s → 8 em 15 s
  assert.match(h.why, /Segue a referência: 6 planos/);
  // abre sem fala, como a referência
  assert.ok(!h.scenes[0].line && !/^Fala pra câmera/.test(h.scenes[0].audio), h.scenes[0].audio);
  const total = h.scenes.reduce((a, s) => a + s.duration, 0);
  assert.ok(total >= 13 && total <= 17, String(total));
  // referência que abre falando muda o gancho
  const talkFirst = generateHooksLocal({ ...ctx, structure: [{ duration: 3, voice: true }, ...structure.slice(1)] });
  assert.ok(talkFirst[0].scenes[0].line, 'abre com fala');
  // comida também segue a estrutura
  const food = generateHooksLocal({ ...ctx, brief: BRIEF, genre: 'gastronomia' });
  assert.equal(food[0].scenes.length, 8);
});

test('estrutura: planos-relâmpago (< 0,6 s) se juntam ao anterior', () => {
  const m = refWith(false, 'r').metrics!;
  const st = structureFromMetrics({ ...m, shots: [{ start: 0, end: 2, voice: false }, { start: 2, end: 2.3, voice: true }, { start: 2.3, end: 5, voice: true }] });
  assert.equal(st.length, 2);
  assert.equal(st[0].voice, true);
});

test('paleta: tira cores vivas e diferentes do vídeo, legíveis como texto', () => {
  const px: number[] = [];
  for (let i = 0; i < 400; i++) px.push(0x101010); // fundo escuro
  for (let i = 0; i < 200; i++) px.push(0xe8501a); // laranja
  for (let i = 0; i < 150; i++) px.push(0x1aa0e8); // azul
  for (let i = 0; i < 120; i++) px.push(0xe8d21a); // amarelo
  for (let i = 0; i < 300; i++) px.push(0x808080); // cinza
  const pal = captionPalette(px);
  assert.equal(pal.length, 3);
  const hues = pal.map((h) => rgbToHsl(fromHex(h))[0]);
  assert.ok(hues.some((h) => h < 0.08), 'laranja');
  assert.ok(hues.some((h) => h > 0.5 && h < 0.62), 'azul');
  assert.ok(pal.every((h) => rgbToHsl(fromHex(h))[2] >= 0.6), 'claras o bastante');
});

test('visual das referências: só liga o que elas mostram', () => {
  const none = lookDefaults({ edit: { originalVolume: 1, narrationVolume: 1 } }, combineLook([{ usesMusic: false }, {}], []));
  assert.equal(none.captions.enabled, false);
  assert.equal(none.zoom, 'off');
  assert.equal(none.musicSuggested, false);
  const look = combineLook([{ hasCaptions: true, captionColor: '#ffd400', usesZoom: true, zoomStyle: 'punch', usesMusic: true }, { hasCaptions: true, usesZoom: true, zoomStyle: 'punch', usesMusic: true }], ['#FF8800']);
  const d = lookDefaults({ edit: { originalVolume: 1, narrationVolume: 1 } }, look);
  assert.equal(d.captions.enabled, true);
  assert.equal(d.captions.color, '#FFD400');
  assert.equal(d.zoom, 'punch');
  assert.equal(d.musicSuggested, true);
  // o que o criador escolheu prevalece
  const mine = lookDefaults({ captions: { enabled: false, style: 'faixa', position: 'meio' }, edit: { originalVolume: 1, narrationVolume: 1, zoom: 'off' } }, look);
  assert.equal(mine.captions.enabled, false);
  assert.equal(mine.zoom, 'off');
  assert.deepEqual(zoomFor(1, 'punch'), { from: 1.15, to: 1.15 });
  assert.equal(zoomFor(0, 'punch'), undefined);
});

import { cuesFromText, cuesFromWords, voicedSpans } from './captions';
test('legendas da transcrição: quebra em pausas e só dentro do trecho usado', () => {
  const w = (text: string, start: number) => ({ text, start, end: start + 0.3 });
  const words = [w('Gente,', 1), w('olha', 1.35), w('o', 1.7), w('tamanho', 2.05), w('disso.', 2.4), w('Sério', 4), w('mesmo', 4.35)];
  const cues = cuesFromWords(words, { start: 0, end: 5 });
  assert.deepEqual(cues.map((c) => c.text), ['Gente, olha o tamanho disso.', 'Sério mesmo']);
  assert.ok(cuesFromWords(words, { start: 3, end: 5 }).every((c) => c.start >= 3));
  const spans = voicedSpans(['silencio', 'voz', 'voz', 'voz', 'silencio', 'silencio', 'silencio', 'silencio', 'silencio', 'silencio', 'voz', 'voz'], 0.5);
  assert.equal(spans.length, 2);
  const fromText = cuesFromText('um dois três quatro', spans, { start: 0, end: 6 });
  assert.ok(fromText[0].start >= 0.5 && fromText.at(-1)!.end <= 6);
});

import { descriptionFromBrief, localPublishIdea } from './publish';
test('publicação: 3 hashtags do nicho, título e descrição só com os fatos do briefing', () => {
  const food = localPublishIdea({ brief: BRIEF, title: 'Xis de costela · Porto Alegre', genre: 'gastronomia' });
  assert.equal(food.hashtags.length, 3);
  assert.ok(food.hashtags.every((h) => h.startsWith('#') && !/fyp|viral/.test(h)));
  assert.equal(food.title, 'Xis de costela de R$ 38 em Porto Alegre');
  assert.equal(food.description, 'Provei um xis de costela de R$ 38 em Porto Alegre. Mostrei o tamanho e contei se compraria de novo.');
  const rv = localPublishIdea({ brief: GENRE_INFO.review.example, title: 'Fone bluetooth', genre: 'review' });
  assert.equal(rv.title, 'Fone bluetooth de R$ 150: vale a pena?');
  assert.equal(descriptionFromBrief(GENRE_INFO.review.example), 'Review de um fone bluetooth de R$ 150. Mostrei o som, a bateria e se vale a pena.');
  assert.ok(rv.sound.search.length > 3);
});

import { averageStructure } from './style';
test('média das referências: ritmo médio e fala onde a maioria fala', () => {
  const a = [{ duration: 2, voice: false }, { duration: 2, voice: true }, { duration: 2, voice: true }]; // 3 planos/6 s
  const b = [{ duration: 1, voice: false }, { duration: 1, voice: false }, { duration: 2, voice: true }, { duration: 2, voice: true }, { duration: 2, voice: true }, { duration: 2, voice: true }]; // 6 planos/10 s
  const avg = averageStructure([a, b])!;
  assert.equal(avg.length, 4); // 0,55 plano/s × 8 s ≈ 4
  assert.equal(avg[0].voice, false); // as duas abrem sem fala
  assert.ok(avg.slice(-2).every((x) => x.voice));
  assert.equal(averageStructure([a]), a);
});

import { duplicateItem, moveItem, removeItem, resolveItems, splitItem, trimItem } from './timeline';
test('edição: gilete, excluir, duplicar, mover e aparar trechos; legendas seguem o trecho', () => {
  const scenes = [
    { id: 's1', role: 'gancho' as const, title: 'A', instruction: '', duration: 3, audio: '', clipId: 'a' },
    { id: 's2', role: 'detalhe' as const, title: 'B', instruction: '', duration: 3, audio: '', clipId: 'b' },
    { id: 's3', role: 'detalhe' as const, title: 'C', instruction: '', duration: 3, audio: '' },
  ];
  const a = { ...clip('a', 6), captions: [{ id: 'q1', start: 1, end: 2, text: 'primeira' }, { id: 'q2', start: 4, end: 5, text: 'segunda' }] };
  const clips: Record<string, Clip> = { a, b: clip('b', 4) };
  const base = { scenes, clips, skippedSceneIds: [] as string[] };
  let items = resolveItems(base);
  assert.equal(items.length, 2);
  // gilete no meio do clipe "a"
  items = splitItem(items, items[0].id, 3);
  assert.deepEqual(items.map((i) => [i.clipId, i.start, i.end]), [['a', 0, 3], ['a', 3, 6], ['b', 0, 4]]);
  // exclui a 1ª metade, duplica o "b", move a 2ª metade de "a" pro fim
  items = removeItem(items, items[0].id);
  items = duplicateItem(items, items[2].id);
  items = moveItem(items, items[1].id, 1);
  const p = { ...base, edit: { items } };
  const tl = buildTimeline(p);
  assert.deepEqual(tl.segments.map((s) => [s.clip.id, s.start, s.end]), [['b', 0, 4], ['a', 3, 6], ['b', 0, 4]]);
  assert.equal(tl.total, 11);
  // legenda só do trecho que ficou ("segunda" em 4 s do clipe → 4 + 1 = 5 s na montagem)
  const cues = timelineCaptions(p);
  assert.deepEqual(cues.map((c) => [c.text, c.start]), [['segunda', 5]]);
  // aparar um trecho
  const trimmed = buildTimeline({ ...base, edit: { items: trimItem(items, items[1].id, 0.5, 2) } });
  assert.equal(trimmed.segments[0].duration, 1.5);
  // clipe novo gravado para a cena 3 entra depois dos trechos das cenas anteriores
  const withC = resolveItems({ scenes: [...scenes.slice(0, 2), { ...scenes[2], clipId: 'c' }], clips: { ...clips, c: clip('c', 2) }, skippedSceneIds: [], edit: { items } });
  assert.equal(withC.at(-1)!.clipId, 'c');
  // clipe trocado na cena 2: trechos do clipe antigo saem
  const swapped = resolveItems({ scenes: [scenes[0], { ...scenes[1], clipId: 'b2' }, scenes[2]], clips: { a, b2: clip('b2', 5) }, skippedSceneIds: [], edit: { items } });
  assert.ok(!swapped.some((i) => i.clipId === 'b') && swapped.some((i) => i.clipId === 'b2'));
});
