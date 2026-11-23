import { router, useLocalSearchParams } from 'expo-router';
import { VideoView } from 'expo-video';
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
import { AudioSheet, CaptionPreview, CaptionsSheet, FramingSheet, NarrationSheet } from '../../../ui/EditorSheets';
import { cueAt, DEFAULT_CAPTIONS, timelineCaptions } from '../../../domain/captions';
import { addCueAt, deleteCue, enableCaptions, updateCaptionSettings, updateCue } from '../../../services/flows';
import { Icon } from '../../../ui/icons';
import { Button, Screen, TerryLine, Thumb, ToolButton, TopBar } from '../../../ui/kit';
import { C, R, T } from '../../../ui/theme';
import { TrimSheet } from '../../../ui/TrimSheet';
import { useTimelinePlayer } from '../../../ui/useTimelinePlayer';

const PX_PER_SEC = 26;

/** Mostra o vídeo exatamente com o recorte que vai para o MP4. */
function CroppedPreview({ clip, player, width, height }: { clip?: Clip; player: ReturnType<typeof useTimelinePlayer>['player']; width: number; height: number }) {
  const crop = clip ? cropRectFor(clip.width, clip.height, clip.framing) : { left: 0, top: 0, width: 1, height: 1 };
  const innerW = width / crop.width;
  const innerH = height / crop.height;
  return (
    <View style={{ width, height, overflow: 'hidden', backgroundColor: '#000', borderRadius: R.s }}>
      <VideoView
        player={player}
        nativeControls={false}
        contentFit="fill"
        style={{ position: 'absolute', width: innerW, height: innerH, left: -crop.left * innerW, top: -crop.top * innerH }}
      />
    </View>
  );
}

export default function Editor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const p = useProject(id);
  const { width: screenW, height: screenH } = useScreen();
  const [sheet, setSheet] = useState<null | 'trim' | 'frame' | 'audio' | 'narration' | 'captions'>(null);
  const [captionBusy, setCaptionBusy] = useState(false);
  const [selected, setSelected] = useState(0);
  const [showReview, setShowReview] = useState(true);
  const strip = useRef<ScrollViewInstance>(null);

  const timeline = useMemo(() => (p ? buildTimeline(p) : { segments: [], total: 0, missing: [], skipped: [] }), [p]);
  const narrationOn = !!p?.audioModes.includes('narracao');
  const cues = useMemo(() => (p ? timelineCaptions(p) : []), [p]);
  const captionSettings = p?.captions ?? DEFAULT_CAPTIONS;
  const tp = useTimelinePlayer(timeline, {
    volume: p?.edit.originalVolume ?? 1,
    narrationUri: narrationOn ? p?.edit.narration?.uri : undefined,
    narrationVolume: p?.edit.narrationVolume ?? 1,
  });

  // A faixa acompanha a posição atual.
  useEffect(() => {
    strip.current?.scrollTo({ x: tp.time * PX_PER_SEC, animated: false });
  }, [tp.time]);
  useEffect(() => setSelected(tp.index), [tp.index]);

  if (!p) return null;

  const previewH = Math.min(screenH * 0.5, (screenW - 120) * (16 / 9));
  const previewW = previewH * (9 / 16);
  const seg = timeline.segments[selected];
  const segClip = seg?.clip;

  const close = () => setSheet(null);

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
          <CroppedPreview clip={timeline.segments[tp.index]?.clip} player={tp.player} width={previewW} height={previewH} />
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

      <View style={st.toolbar}>
        <ToolButton label="Aparar" icon={<Icon.Trim />} onPress={() => { tp.pause(); setSheet('trim'); }} disabled={!segClip} />
        <ToolButton label="Enquadrar" icon={<Icon.Frame />} onPress={() => { tp.pause(); setSheet('frame'); }} disabled={!segClip} />
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
      </View>

      <CaptionsSheet
        visible={sheet === 'captions'}
        onClose={close}
        settings={captionSettings}
        cues={cues}
        time={tp.time}
        busy={captionBusy}
        onToggle={async (on) => {
          if (!on) return updateCaptionSettings(p.id, { enabled: false });
          setCaptionBusy(true);
          try {
            await enableCaptions(p.id);
          } finally {
            setCaptionBusy(false);
          }
        }}
        onSettings={(patch) => updateCaptionSettings(p.id, patch)}
        onEdit={(c, text) => updateCue(p.id, c.clipId, c.cueId, { text })}
        onDelete={(c) => deleteCue(p.id, c.clipId, c.cueId)}
        onAdd={() => addCueAt(p.id, tp.time)}
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
  toolbar: { flexDirection: 'row', justifyContent: 'space-around', marginHorizontal: 12, marginBottom: 8, paddingVertical: 8, paddingHorizontal: 4, borderRadius: R.xl, backgroundColor: C.surface2 },
});
