import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, StyleSheet, Text, View, Pressable, Switch, TextInput } from 'react-native';
import { showDialog } from './dialog';
import type { TimelineCue } from '../domain/captions';
import type { ZoomMode } from '../domain/look';
import { TRACKS } from '../services/tracks';
import { cropRectFor, framingFromCropCenter, formatPrecise } from '../domain/timeline';
import type { CaptionSettings, Clip, Framing } from '../domain/types';
import { Icon } from './icons';
import { Button, Chip, Sheet } from './kit';
import { C, R, T } from './theme';

/** Enquadrar: arrasta a janela 9:16 sobre o quadro inteiro. Útil para vídeo horizontal. */
export function FramingSheet({ clip, visible, onClose, onChange }: { clip?: Clip; visible: boolean; onClose: () => void; onChange: (f: Framing) => void }) {
  const [framing, setFraming] = useState<Framing>(clip?.framing ?? { x: 0, y: 0, zoom: 1 });
  const ref = useRef(framing);
  ref.current = framing;
  useEffect(() => {
    if (clip && visible) setFraming(clip.framing);
  }, [clip?.id, visible]);

  const box = useMemo(() => {
    if (!clip) return { w: 0, h: 0 };
    const maxW = 320;
    const maxH = 320;
    const ar = clip.width / clip.height;
    return ar > 1 ? { w: maxW, h: maxW / ar } : { w: maxH * ar, h: maxH };
  }, [clip?.id]);

  const pan = useMemo(() => {
    let start = { cx: 0.5, cy: 0.5 };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        if (!clip) return;
        const c = cropRectFor(clip.width, clip.height, ref.current);
        start = { cx: c.left + c.width / 2, cy: c.top + c.height / 2 };
      },
      onPanResponderMove: (_, g) => {
        if (!clip) return;
        const c = cropRectFor(clip.width, clip.height, ref.current);
        const f = framingFromCropCenter(start.cx + g.dx / box.w, start.cy + g.dy / box.h, c, ref.current.zoom);
        setFraming(f);
      },
      onPanResponderRelease: () => onChange(ref.current),
    });
  }, [clip?.id, box.w, box.h]);

  if (!clip) return null;
  const c = cropRectFor(clip.width, clip.height, framing);
  const setZoom = (zoom: number) => {
    const f = { ...framing, zoom };
    setFraming(f);
    onChange(f);
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Enquadrar">
      <View style={{ gap: 14, alignItems: 'center' }}>
        <Text style={[T.small, { alignSelf: 'stretch' }]}>Arrasta a janela para escolher o que entra no vertical.</Text>
        <View style={{ width: box.w, height: box.h, borderRadius: 6, overflow: 'hidden', backgroundColor: C.surface2 }}>
          {clip.thumbUri ? <Image source={{ uri: clip.thumbUri }} style={StyleSheet.absoluteFill} resizeMode="stretch" /> : null}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
          <View
            {...pan.panHandlers}
            style={{ position: 'absolute', left: c.left * box.w, top: c.top * box.h, width: c.width * box.w, height: c.height * box.h, borderWidth: 2, borderColor: C.accent, overflow: 'hidden' }}
          >
            {clip.thumbUri ? (
              <Image
                source={{ uri: clip.thumbUri }}
                resizeMode="stretch"
                style={{ position: 'absolute', left: -c.left * box.w, top: -c.top * box.h, width: box.w, height: box.h }}
              />
            ) : null}
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[1, 1.25, 1.5, 2].map((z) => (
            <Chip key={z} label={`${z}x`} selected={Math.abs(framing.zoom - z) < 0.01} onPress={() => setZoom(z)} />
          ))}
        </View>
        <Button kind="ghost" small label="Centralizar" onPress={() => { const f = { x: 0, y: 0, zoom: 1 }; setFraming(f); onChange(f); }} />
      </View>
    </Sheet>
  );
}

function Levels({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <Chip key={v} label={v === 0 ? 'Mudo' : `${Math.round(v * 100)}%`} selected={Math.abs(value - v) < 0.01} onPress={() => onChange(v)} />
      ))}
    </View>
  );
}

export function AudioSheet({ visible, onClose, original, narration, hasNarration, onOriginal, onNarration, music, onMusic, onMusicVolume, onPickOwn, suggestMusic }: {
  visible: boolean;
  onClose: () => void;
  original: number;
  narration: number;
  hasNarration: boolean;
  onOriginal: (v: number) => void;
  onNarration: (v: number) => void;
  music?: { id: string; title: string; volume: number };
  onMusic: (trackId: string | null) => void;
  onMusicVolume: (v: number) => void;
  onPickOwn: () => void;
  suggestMusic: boolean | null;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Áudio">
      <View style={{ gap: 16 }}>
        <View style={{ gap: 8 }}>
          <Text style={T.h3}>Som dos clipes</Text>
          <Text style={T.small}>Fala e som ambiente gravados no lugar.</Text>
          <Levels value={original} onChange={onOriginal} />
        </View>
        {hasNarration ? (
          <View style={{ gap: 8 }}>
            <Text style={T.h3}>Narração</Text>
            <Levels value={narration} onChange={onNarration} />
          </View>
        ) : null}
        <View style={{ gap: 8 }}>
          <Text style={T.h3}>Trilha</Text>
          <Text style={T.small}>
            {suggestMusic === true
              ? 'Suas referências têm trilha baixinha por baixo do som. Fica natural com volume baixo.'
              : suggestMusic === false
                ? 'Não ouvi trilha nas suas referências. Sem trilha fica mais parecido com elas.'
                : 'Opcional. Fica por baixo da fala, em volume baixo.'}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Chip label="Sem trilha" selected={!music} onPress={() => onMusic(null)} />
            {TRACKS.map((t) => (
              <Chip key={t.id} label={t.title} selected={music?.id === t.id} onPress={() => onMusic(t.id)} />
            ))}
            <Chip label={music?.id === 'proprio' ? `${music.title}` : 'Do celular…'} selected={music?.id === 'proprio'} onPress={onPickOwn} />
          </View>
          {music ? (
            <>
              <Text style={T.small}>{TRACKS.find((t) => t.id === music.id)?.mood ?? 'Sua música. Use só o que você tem direito de usar.'}</Text>
              <Levels value={music.volume} onChange={onMusicVolume} />
            </>
          ) : null}
        </View>
      </View>
    </Sheet>
  );
}

/** Zoom automático: só o que combina com as referências; sem efeito chamativo. */
export function ZoomSheet({ visible, onClose, mode, onMode, suggested }: { visible: boolean; onClose: () => void; mode: ZoomMode; onMode: (m: ZoomMode) => void; suggested: ZoomMode | null }) {
  const opts: { key: ZoomMode; label: string; hint: string }[] = [
    { key: 'off', label: 'Sem zoom', hint: 'Cortes secos, como foi gravado.' },
    { key: 'suave', label: 'Aproximação suave', hint: 'Cada take aproxima devagar, 8% até o fim.' },
    { key: 'punch', label: 'Corte mais perto', hint: 'Takes alternados entram 15% mais perto, no corte.' },
  ];
  return (
    <Sheet visible={visible} onClose={onClose} title="Zoom">
      <View style={{ gap: 10 }}>
        <Text style={T.small}>
          {suggested === 'off' || suggested === null
            ? suggested === null
              ? 'Não deu pra medir zoom nas referências. Na dúvida, sem zoom fica mais natural.'
              : 'Suas referências não usam zoom. Sem zoom fica mais parecido com elas.'
            : `Suas referências usam ${suggested === 'suave' ? 'aproximação suave' : 'corte mais perto'}.`}
        </Text>
        {opts.map((o) => (
          <Pressable key={o.key} onPress={() => onMode(o.key)} style={[st.opt, mode === o.key && { borderColor: C.accent }]}>
            <View style={{ flex: 1 }}>
              <Text style={[T.h3, mode === o.key && { color: C.accent }]}>
                {o.label}
                {suggested === o.key ? '  · como nas referências' : ''}
              </Text>
              <Text style={T.small}>{o.hint}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

export function NarrationSheet({ visible, onClose, total, existing, onStartPreview, onStopPreview, onSave, onRemove }: {
  visible: boolean;
  onClose: () => void;
  total: number;
  existing?: { uri: string; duration: number };
  onStartPreview: () => void;
  onStopPreview: () => void;
  onSave: (uri: string, duration: number) => void;
  onRemove: () => void;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [rec, setRec] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(0);

  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => {
      const e = (Date.now() - started.current) / 1000;
      setElapsed(e);
      if (e >= total) stop();
    }, 100);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec]);

  const start = async () => {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      showDialog('Microfone bloqueado', 'Libera o microfone nos ajustes pra gravar a narração.');
      return;
    }
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await recorder.prepareToRecordAsync();
    started.current = Date.now();
    setElapsed(0);
    recorder.record();
    onStartPreview();
    setRec(true);
  };

  const stop = async () => {
    if (!rec) return;
    setRec(false);
    onStopPreview();
    await recorder.stop();
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    const uri = recorder.uri;
    const duration = (Date.now() - started.current) / 1000;
    if (uri) onSave(uri, Math.min(duration, total));
  };

  return (
    <Sheet visible={visible} onClose={() => (rec ? undefined : onClose())} title="Narração">
      <View style={{ gap: 14 }}>
        <Text style={T.small}>A prévia toca do começo enquanto você fala. Use fone para o som do vídeo não vazar na gravação.</Text>
        <View style={st.recRow}>
          <Icon.Mic size={22} color={rec ? C.rec : C.text} />
          <Text style={[T.h3, { fontVariant: ['tabular-nums'] }]}>
            {formatPrecise(rec ? elapsed : existing?.duration ?? 0)} / {formatPrecise(total)}
          </Text>
        </View>
        {rec ? (
          <Button label="Parar" kind="danger" onPress={stop} style={{ borderWidth: 1, borderColor: C.danger }} />
        ) : (
          <Button label={existing ? 'Gravar de novo' : 'Gravar narração'} icon={<Icon.Mic size={18} color={C.accentInk} />} onPress={start} />
        )}
        {existing && !rec ? <Button kind="ghost" small label="Remover narração" onPress={onRemove} /> : null}
      </View>
    </Sheet>
  );
}

const st = StyleSheet.create({
  opt: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface2, borderRadius: R.m, padding: 12, borderWidth: 1.5, borderColor: 'transparent' },
  swatchRing: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  emptyTake: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: R.m, borderWidth: 1, borderStyle: 'dashed', borderColor: C.border, padding: 12 },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface2, borderRadius: R.m, padding: 12 },
  cue: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface2, borderRadius: R.m, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: 'transparent' },
  cueInput: { flex: 1, color: C.text, fontSize: 15, paddingVertical: 4 },
  recRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface2, borderRadius: R.m, padding: 12 },
});

export type CaptionGroup = { key: string; title: string; offset: number; cues: TimelineCue[] };

/** Legendas: todos os takes do mesmo jeito. Cor, estilo, posição e correção do texto. */
export function CaptionsSheet({ visible, onClose, settings, groups, palette, time, report, onToggle, onSettings, onEdit, onDelete, onAddAt, onSeek, onRetranscribe, busy }: {
  visible: boolean;
  onClose: () => void;
  settings: CaptionSettings;
  groups: CaptionGroup[];
  palette: string[];
  time: number;
  report?: string | null;
  onToggle: (on: boolean) => void;
  onSettings: (patch: Partial<CaptionSettings>) => void;
  onEdit: (cue: TimelineCue, text: string) => void;
  onDelete: (cue: TimelineCue) => void;
  onAddAt: (t: number) => void;
  onSeek: (t: number) => void;
  onRetranscribe: () => void;
  busy?: string | null;
}) {
  const color = settings.color ?? '#FFFFFF';
  const colors = ['#FFFFFF', ...palette.filter((c) => c !== '#FFFFFF')].slice(0, 4);
  return (
    <Sheet visible={visible} onClose={onClose} title="Legendas">
      <View style={{ gap: 14 }}>
        <View style={st.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={T.h3}>Mostrar legendas</Text>
            <Text style={T.small}>Em todos os takes, do mesmo jeito.</Text>
          </View>
          <Switch
            value={settings.enabled}
            onValueChange={onToggle}
            disabled={!!busy}
            trackColor={{ false: C.surface3, true: C.accent }}
            thumbColor={settings.enabled ? C.accentInk : C.dim}
          />
        </View>
        {busy ? <Text style={[T.small, { color: C.accent }]}>{busy}</Text> : null}
        {report && !busy ? <Text style={T.small}>{report}</Text> : null}

        {settings.enabled ? (
          <>
            <View style={st.optRow}>
              <Text style={[T.tiny, { width: 64 }]}>COR</Text>
              {colors.map((c) => (
                <Pressable key={c} onPress={() => onSettings({ color: c })} accessibilityLabel={`Cor ${c}`} style={[st.swatchRing, color === c && { borderColor: C.accent }]}>
                  <View style={[st.swatch, { backgroundColor: c }]} />
                </Pressable>
              ))}
            </View>
            {palette.length ? <Text style={[T.small, { marginTop: -6 }]}>Cores tiradas dos seus vídeos.</Text> : null}
            <View style={st.optRow}>
              <Text style={[T.tiny, { width: 64 }]}>ESTILO</Text>
              <Chip label="Contorno" selected={settings.style === 'contorno'} onPress={() => onSettings({ style: 'contorno' })} />
              <Chip label="Faixa" selected={settings.style === 'faixa'} onPress={() => onSettings({ style: 'faixa' })} />
            </View>
            <View style={st.optRow}>
              <Text style={[T.tiny, { width: 64 }]}>POSIÇÃO</Text>
              <Chip label="Embaixo" selected={settings.position === 'baixo'} onPress={() => onSettings({ position: 'baixo' })} />
              <Chip label="No meio" selected={settings.position === 'meio'} onPress={() => onSettings({ position: 'meio' })} />
            </View>

            <View style={{ gap: 12 }}>
              {groups.map((g, gi) => (
                <View key={g.key} style={{ gap: 6 }}>
                  <Text style={T.tiny}>
                    TAKE {gi + 1} · {g.title.toUpperCase()}
                  </Text>
                  {g.cues.length ? (
                    g.cues.map((c) => <CueRow key={c.cueId} cue={c} active={time >= c.start && time < c.end} onEdit={onEdit} onDelete={onDelete} onSeek={onSeek} />)
                  ) : (
                    <Pressable onPress={() => onAddAt(g.offset + 0.05)} style={st.emptyTake}>
                      <Icon.Plus size={16} color={C.accent} />
                      <Text style={[T.small, { color: C.accent }]}>Sem fala aqui. Escrever legenda</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button kind="ghost" small style={{ flex: 1 }} label={`Legenda em ${formatPrecise(time)}`} icon={<Icon.Plus size={16} />} onPress={() => onAddAt(time)} />
              <Button kind="ghost" small style={{ flex: 1 }} label="Ouvir de novo" icon={<Icon.Refresh size={16} />} onPress={onRetranscribe} disabled={!!busy} />
            </View>
          </>
        ) : null}
      </View>
    </Sheet>
  );
}

function CueRow({ cue, active, onEdit, onDelete, onSeek }: { cue: TimelineCue; active: boolean; onEdit: (c: TimelineCue, t: string) => void; onDelete: (c: TimelineCue) => void; onSeek: (t: number) => void }) {
  const [text, setText] = useState(cue.text);
  useEffect(() => setText(cue.text), [cue.text]);
  return (
    <View style={[st.cue, active && { borderColor: C.accent }]}>
      <Pressable onPress={() => onSeek(cue.start + 0.01)} hitSlop={6}>
        <Text style={[T.tiny, active && { color: C.accent }]}>{formatPrecise(cue.start)}</Text>
      </Pressable>
      <TextInput
        value={text}
        onChangeText={setText}
        onEndEditing={() => text !== cue.text && onEdit(cue, text)}
        onBlur={() => text !== cue.text && onEdit(cue, text)}
        placeholder="Escreve a fala"
        placeholderTextColor={C.mute}
        multiline
        style={st.cueInput}
      />
      <Pressable onPress={() => onDelete(cue)} hitSlop={8} accessibilityLabel="Apagar legenda">
        <Icon.Trash size={18} color={C.mute} />
      </Pressable>
    </View>
  );
}

/** A legenda por cima da prévia, no mesmo estilo e posição do MP4 exportado. */
export function CaptionPreview({ text, settings, width, height }: { text?: string; settings: CaptionSettings; width: number; height: number }) {
  if (!settings.enabled || !text) return null;
  const fontSize = width * 0.054;
  const box = settings.style === 'faixa' ? { backgroundColor: 'rgba(0,0,0,0.62)', borderRadius: fontSize * 0.35, paddingHorizontal: fontSize * 0.55, paddingVertical: fontSize * 0.3 } : {};
  const outline = settings.style === 'contorno' ? { textShadowColor: '#000', textShadowRadius: fontSize * 0.25, textShadowOffset: { width: 0, height: 0 } } : {};
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: settings.position === 'meio' ? 'center' : 'flex-end', paddingBottom: settings.position === 'meio' ? 0 : height * 0.15 }]}>
      <View style={[{ maxWidth: width * 0.86 }, box]}>
        <Text style={[{ color: settings.color ?? '#fff', fontSize, fontWeight: '900', textAlign: 'center' }, outline]}>{text}</Text>
      </View>
    </View>
  );
}
