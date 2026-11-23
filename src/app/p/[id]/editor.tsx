import { router, useLocalSearchParams } from 'expo-router';
import { VideoView, type VideoPlayer } from 'expo-video';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { useScreen } from '../../../ui/simulator';
import { terry } from '../../../domain/terry';
import { buildTimeline, cropRectFor, formatPrecise } from '../../../domain/timeline';
import type { Clip } from '../../../domain/types';
import { updateClip } from '../../../services/flows';
import { keepNarration } from '../../../services/media';
import { removeFile } from '../../../storage/projects';
import { updateProject, useProject } from '../../../state/store';
import * as DocumentPicker from 'expo-document-picker';
import { AudioSheet, CaptionPreview, CaptionsSheet, FramingSheet, NarrationSheet, ZoomSheet, type CaptionGroup } from '../../../ui/EditorSheets';
import { lookOf, zoomAt, zoomFor, type ZoomMode } from '../../../domain/look';
import { TRACKS, resolveMusicUri } from '../../../services/tracks';
import { paletteOf } from '../../../services/media';
import { cueAt, DEFAULT_CAPTIONS, timelineCaptions } from '../../../domain/captions';
import { addCueAt, applyReferenceLook, deleteCue, enableCaptions, updateCaptionSettings, updateCue, type CaptionReport } from '../../../services/flows';
import { Icon } from '../../../ui/icons';
import { Button, Screen, TerryLine, Thumb, ToolButton, TopBar } from '../../../ui/kit';
import { C, R, T } from '../../../ui/theme';
import { TrimSheet } from '../../../ui/TrimSheet';
import { useTimelinePlayer } from '../../../ui/useTimelinePlayer';

const PX_PER_SEC = 26;

/** Mostra o vídeo exatamente com o recorte que vai para o MP4. */
function CroppedLayer({ clip, player, width, height, visible, zoom = 1 }: { clip?: Clip; player: VideoPlayer; width: number; height: number; visible: boolean; zoom?: number }) {
  const crop = clip ? cropRectFor(clip.width, clip.height, clip.framing) : { left: 0, top: 0, width: 1, height: 1 };
  const innerW = width / crop.width;
  const innerH = height / crop.height;
  return (
    <View style={[StyleSheet.absoluteFill, { opacity: visible ? 1 : 0, transform: [{ scale: zoom }] }]} pointerEvents="none">
      <VideoView
        player={player}
        nativeControls={false}
        contentFit="fill"
        style={{ position: 'absolute', width: innerW, height: innerH, left: -crop.left * innerW, top: -crop.top * innerH }}
      />
    </View>
  );
}

/** Dois players empilhados: o visível toca, o outro espera o próximo take já carregado. */
function CroppedPreview({ tp, width, height, zoom }: { tp: ReturnType<typeof useTimelinePlayer>; width: number; height: number; zoom: number }) {
  return (
    <View style={{ width, height, overflow: 'hidden', backgroundColor: '#000', borderRadius: R.s }}>
      {tp.players.map((player, i) => (
        <CroppedLayer key={i} player={player} clip={tp.slotClips[i]} width={width} height={height} visible={tp.active === i} zoom={tp.active === i ? zoom : 1} />
      ))}
    </View>
  );
}

export default function Editor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const p = useProject(id);
  const { width: screenW, height: screenH } = useScreen();
  const [sheet, setSheet] = useState<null | 'trim' | 'frame' | 'audio' | 'narration' | 'captions' | 'zoom'>(null);
  const [captionBusy, setCaptionBusy] = useState<string | null>(null);
  const [captionReport, setCaptionReport] = useState<string | null>(null);
  const [musicUri, setMusicUri] = useState<string | undefined>();
  const [clipPalette, setClipPalette] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);
  const [showReview, setShowReview] = useState(true);
  const strip = useRef<ScrollViewInstance>(null);

  const timeline = useMemo(() => (p ? buildTimeline(p) : { segments: [], total: 0, missing: [], skipped: [] }), [p]);
  const narrationOn = !!p?.audioModes.includes('narracao');
  const cues = useMemo(() => (p ? timelineCaptions(p) : []), [p]);
  const captionSettings = p?.captions ?? DEFAULT_CAPTIONS;
  const extras = useMemo(() => {
    const list: { uri: string; volume: number }[] = [];
    if (narrationOn && p?.edit.narration) list.push({ uri: p.edit.narration.uri, volume: p.edit.narrationVolume });
    if (musicUri && p?.edit.music) list.push({ uri: musicUri, volume: p.edit.music.volume });
    return list;
  }, [narrationOn, p?.edit.narration, p?.edit.narrationVolume, musicUri, p?.edit.music]);
  const tp = useTimelinePlayer(timeline, { volume: p?.edit.originalVolume ?? 1, extras });

  // A faixa acompanha a posição atual.
  useEffect(() => {
    strip.current?.scrollTo({ x: tp.time * PX_PER_SEC, animated: false });
  }, [tp.time]);
  useEffect(() => setSelected(tp.index), [tp.index]);

  const look = lookOf(p?.analysis);
  const palette = look.palette.length ? look.palette : clipPalette;

  const describe = (r: CaptionReport) => {
    const parts: string[] = [];
    if (r.transcribed) parts.push(`Ouvi e transcrevi ${r.transcribed} take${r.transcribed > 1 ? 's' : ''}.`);
    if (r.fromScript) parts.push(`${r.fromScript} veio da fala do roteiro: confere se foi isso mesmo.`);
    if (r.empty.length) parts.push(`Sem fala: ${r.empty.join(', ')}. Escreve ali embaixo se quiser.`);
    if (!r.transcribed && r.unavailable) parts.push(r.unavailable === 'simulador' ? 'No simulador eu não consigo ouvir os clipes; no celular eu transcrevo.' : 'Não consegui transcrever neste aparelho agora.');
    return parts.join(' ');
  };

  const runCaptions = async (force: boolean) => {
    if (!p) return;
    setCaptionBusy('Ouvindo os takes…');
    try {
      const r = await enableCaptions(p.id, force, setCaptionBusy);
      setCaptionReport(describe(r));
    } finally {
      setCaptionBusy(null);
    }
  };

  // Primeira montagem: começa com o visual das referências (legenda, zoom, trilha) — só o que elas têm.
  useEffect(() => {
    if (!p) return;
    const { captionsOn } = applyReferenceLook(p.id);
    if (captionsOn) runCaptions(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id]);

  // Trilha: resolve o arquivo (as embutidas saem de dentro do app).
  useEffect(() => {
    let alive = true;
    resolveMusicUri(p?.edit.music).then((u) => alive && setMusicUri(u));
    return () => {
      alive = false;
    };
  }, [p?.edit.music?.id, p?.edit.music?.uri]);

  // Sem referências (ex.: demonstração), as cores da legenda saem dos próprios clipes.
  const firstClipUri = timeline.segments[0]?.clip.uri;
  useEffect(() => {
    if (look.palette.length || !firstClipUri) return;
    paletteOf(firstClipUri).then(setClipPalette);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstClipUri, look.palette.length]);

  if (!p) return null;

  const previewH = Math.min(screenH * 0.5, (screenW - 120) * (16 / 9));
  const previewW = previewH * (9 / 16);
  const seg = timeline.segments[selected];
  const segClip = seg?.clip;

  const close = () => setSheet(null);
  const zoomMode: ZoomMode = p.edit.zoom ?? 'off';
  const curSeg = timeline.segments[tp.index];
  const zoomNow = curSeg ? zoomAt(zoomFor(tp.index, zoomMode), (tp.time - curSeg.offset) / Math.max(0.1, curSeg.duration)) : 1;
  const groups: CaptionGroup[] = timeline.segments.map((sg) => ({
    key: sg.sceneId,
    title: p.scenes[sg.sceneIndex]?.title ?? 'Take',
    offset: sg.offset,
    cues: cues.filter((c) => c.clipId === sg.clip.id && c.start >= sg.offset - 0.01 && c.start < sg.offset + sg.duration),
  }));

  const pickOwnMusic = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
    const kept = await keepNarration(p.id, r.assets[0].uri);
    const title = r.assets[0].name.replace(/\.[^.]+$/, '').slice(0, 24);
    updateProject(p.id, (cur) => ({ ...cur, edit: { ...cur.edit, music: { id: 'proprio', title, uri: kept, volume: cur.edit.music?.volume ?? 0.25 } } }));
  };

  return (
    <Screen>
      <TopBar
        title={p.title}
        onBack={() => {
          tp.pause();
          router.back();
        }}
        right={<Button small label="Exportar" onPress={() => { tp.pause(); router.push(`/p/${p.id}/export`); }} disabled={!timeline.segments.length} />}
      />

      {showReview ? (
        <Pressable onPress={() => setShowReview(false)} style={{ paddingHorizontal: 16, marginBottom: 8 }}>
          <TerryLine text={terry.review(p)} />
        </Pressable>
      ) : null}

      <View style={st.previewArea}>
        <View>
          <CroppedPreview tp={tp} width={previewW} height={previewH} zoom={zoomNow} />
          <CaptionPreview text={cueAt(cues, tp.time)?.text} settings={captionSettings} width={previewW} height={previewH} />
        </View>
      </View>

      <View style={st.transport}>
        <Text style={st.time}>{formatPrecise(tp.time)}</Text>
        <Pressable onPress={() => (tp.playing ? tp.pause() : tp.play())} hitSlop={12} style={st.playBtn} accessibilityLabel={tp.playing ? 'Pausar' : 'Reproduzir'}>
          {tp.playing ? <Icon.Pause size={26} /> : <Icon.Play size={26} />}
        </Pressable>
        <Text style={[st.time, { color: C.mute }]}>{formatPrecise(timeline.total)}</Text>
      </View>

      {/* Faixa de clipes com indicador de posição no centro */}
      <View style={st.stripWrap}>
        <ScrollView
          ref={strip}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: screenW / 2 }}
          scrollEventThrottle={32}
          onScrollBeginDrag={() => tp.pause()}
          onMomentumScrollEnd={(e) => tp.seek(e.nativeEvent.contentOffset.x / PX_PER_SEC)}
          onScrollEndDrag={(e) => tp.seek(e.nativeEvent.contentOffset.x / PX_PER_SEC)}
        >
          <View>
            <View style={{ flexDirection: 'row' }}>
              {timeline.segments.map((s, i) => {
                const w = Math.max(20, s.duration * PX_PER_SEC);
                const sel = i === selected;
                return (
                  <Pressable
                    key={s.sceneId}
                    onPress={() => {
                      setSelected(i);
                      tp.seek(s.offset + 0.01);
                    }}
                    style={{ width: w, marginRight: 3 }}
                  >
                    <Thumb uri={s.clip.thumbUri} style={[st.segment, { width: w }, sel && st.segmentSel]}>
                      <View style={st.segNum}>
                        <Text style={st.segNumText}>{s.sceneIndex + 1}</Text>
                      </View>
                    </Thumb>
                  </Pressable>
                );
              })}
            </View>
            {captionSettings.enabled ? (
              <View style={st.capTrack}>
                {cues.map((c) => (
                  <View key={c.cueId} style={[st.capBlock, { left: c.start * PX_PER_SEC, width: Math.max(6, (c.end - c.start) * PX_PER_SEC - 2) }]} />
                ))}
              </View>
            ) : null}
          </View>
        </ScrollView>
        <View pointerEvents="none" style={[st.playhead, { left: screenW / 2 - 1 }]}>
          <View style={st.playKnob} />
        </View>
      </View>
      {timeline.skipped.length ? (
        <Text style={[T.small, { textAlign: 'center', marginTop: 6 }]}>Montado sem: {timeline.skipped.map((s) => s.title).join(', ')}</Text>
      ) : null}

      <View style={{ flex: 1 }} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.toolbar} contentContainerStyle={st.toolbarInner}>
        <ToolButton label="Aparar" icon={<Icon.Trim />} onPress={() => { tp.pause(); setSheet('trim'); }} disabled={!segClip} />
        <ToolButton label="Enquadrar" icon={<Icon.Frame />} onPress={() => { tp.pause(); setSheet('frame'); }} disabled={!segClip} />
        <ToolButton label="Zoom" icon={<Icon.Zoom />} active={zoomMode !== 'off'} onPress={() => setSheet('zoom')} />
        <ToolButton label="Legendas" icon={<Icon.Captions />} active={captionSettings.enabled} onPress={() => { tp.pause(); setSheet('captions'); }} />
        <ToolButton label="Áudio" icon={<Icon.Audio />} onPress={() => setSheet('audio')} />
        {narrationOn ? <ToolButton label="Narração" icon={<Icon.Mic />} onPress={() => { tp.pause(); setSheet('narration'); }} /> : null}
        <ToolButton
          label="Trocar clipe"
          icon={<Icon.Swap />}
          disabled={!seg}
          onPress={() => {
            tp.pause();
            if (seg) updateProject(p.id, (cur) => ({ ...cur, selectedSceneId: seg.sceneId }));
            router.push(`/p/${p.id}/script`);
          }}
        />
      </ScrollView>

      <CaptionsSheet
        visible={sheet === 'captions'}
        onClose={close}
        settings={captionSettings}
        groups={groups}
        palette={palette}
        time={tp.time}
        busy={captionBusy}
        report={captionReport}
        onToggle={(on) => (on ? runCaptions(false) : updateCaptionSettings(p.id, { enabled: false }))}
        onRetranscribe={() => runCaptions(true)}
        onSettings={(patch) => updateCaptionSettings(p.id, patch)}
        onEdit={(c, text) => updateCue(p.id, c.clipId, c.cueId, { text })}
        onDelete={(c) => deleteCue(p.id, c.clipId, c.cueId)}
        onAddAt={(t) => addCueAt(p.id, t)}
        onSeek={(t) => tp.seek(t)}
      />
      <TrimSheet
        clip={segClip}
        visible={sheet === 'trim'}
        onClose={close}
        onSave={(a, b) => {
          if (segClip) updateClip(p.id, segClip.id, { trimStart: a, trimEnd: b });
          close();
        }}
      />
      <FramingSheet clip={segClip} visible={sheet === 'frame'} onClose={close} onChange={(f) => segClip && updateClip(p.id, segClip.id, { framing: f })} />
      <AudioSheet
        visible={sheet === 'audio'}
        onClose={close}
        original={p.edit.originalVolume}
        narration={p.edit.narrationVolume}
        hasNarration={narrationOn && !!p.edit.narration}
        onOriginal={(v) => updateProject(p.id, (cur) => ({ ...cur, edit: { ...cur.edit, originalVolume: v } }))}
        onNarration={(v) => updateProject(p.id, (cur) => ({ ...cur, edit: { ...cur.edit, narrationVolume: v } }))}
        music={p.edit.music}
        suggestMusic={look.music}
        onMusic={(id) =>
          updateProject(p.id, (cur) => {
            const t = TRACKS.find((x) => x.id === id);
            return { ...cur, edit: { ...cur.edit, music: t ? { id: t.id, title: t.title, uri: '', volume: cur.edit.music?.volume ?? 0.25 } : undefined } };
          })
        }
        onMusicVolume={(v) => updateProject(p.id, (cur) => (cur.edit.music ? { ...cur, edit: { ...cur.edit, music: { ...cur.edit.music, volume: v } } } : cur))}
        onPickOwn={pickOwnMusic}
      />
      <ZoomSheet
        visible={sheet === 'zoom'}
        onClose={close}
        mode={zoomMode}
        suggested={look.zoom}
        onMode={(m) => updateProject(p.id, (cur) => ({ ...cur, edit: { ...cur.edit, zoom: m } }))}
      />
      <NarrationSheet
        visible={sheet === 'narration'}
        onClose={close}
        total={timeline.total}
        existing={p.edit.narration}
        onStartPreview={async () => {
          await tp.seek(0);
          tp.play();
        }}
        onStopPreview={() => tp.pause()}
        onSave={async (uri, duration) => {
          const kept = await keepNarration(p.id, uri);
          const old = p.edit.narration?.uri;
          updateProject(p.id, (cur) => ({ ...cur, edit: { ...cur.edit, narration: { uri: kept, duration } } }));
          if (old && old !== kept) removeFile(old);
        }}
        onRemove={() => {
          removeFile(p.edit.narration?.uri);
          updateProject(p.id, (cur) => ({ ...cur, edit: { ...cur.edit, narration: undefined } }));
        }}
      />
    </Screen>
  );
}

const st = StyleSheet.create({
  previewArea: { alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, height: 48 },
  time: { color: C.text, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'], width: 70 },
  playBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stripWrap: { height: 84, justifyContent: 'center' },
  segment: { height: 56, borderRadius: 10, borderWidth: 2, borderColor: 'transparent' },
  segNum: { position: 'absolute', top: 4, left: 4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(13,13,15,0.8)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  segNumText: { color: C.text, fontSize: 10, fontWeight: '800' },
  capTrack: { height: 10, marginTop: 5 },
  capBlock: { position: 'absolute', top: 0, height: 8, borderRadius: 4, backgroundColor: C.accent, opacity: 0.85 },
  segmentSel: { borderColor: C.accent },
  playhead: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: C.accent, borderRadius: 1, alignItems: 'center' },
  playKnob: { position: 'absolute', top: -5, width: 10, height: 10, borderRadius: 5, backgroundColor: C.accent },
  toolbarInner: { paddingHorizontal: 4, alignItems: 'center' },
  toolbar: { flexGrow: 0, marginHorizontal: 12, marginBottom: 8, paddingVertical: 8, borderRadius: R.xl, backgroundColor: C.surface2 },
});
