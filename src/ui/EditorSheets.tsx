import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, StyleSheet, Text, View, Pressable, Switch, TextInput } from 'react-native';
import { showDialog } from './dialog';
import type { TimelineCue } from '../domain/captions';
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

export function AudioSheet({ visible, onClose, original, narration, hasNarration, onOriginal, onNarration }: {
  visible: boolean;
  onClose: () => void;
  original: number;
  narration: number;
  hasNarration: boolean;
  onOriginal: (v: number) => void;
  onNarration: (v: number) => void;
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
        <Text style={T.small}>Sem trilha automática. O som é o do seu vídeo.</Text>
      </View>
    </Sheet>
  );
}

/** Narração: grava a voz enquanto a prévia toca do começo. */
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
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface2, borderRadius: R.m, padding: 12 },
  cue: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface2, borderRadius: R.m, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: 'transparent' },
  cueInput: { flex: 1, color: C.text, fontSize: 15, paddingVertical: 4 },
  recRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface2, borderRadius: R.m, padding: 12 },
});

/** Legendas: liga/desliga, estilo, posição e correção do texto de cada fala. */
export function CaptionsSheet({ visible, onClose, settings, cues, time, onToggle, onSettings, onEdit, onDelete, onAdd, onSeek, busy }: {
  visible: boolean;
  onClose: () => void;
  settings: CaptionSettings;
  cues: TimelineCue[];
  time: number;
  onToggle: (on: boolean) => void;
  onSettings: (patch: Partial<CaptionSettings>) => void;
  onEdit: (cue: TimelineCue, text: string) => void;
  onDelete: (cue: TimelineCue) => void;
  onAdd: () => void;
  onSeek: (t: number) => void;
  busy?: boolean;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Legendas">
      <View style={{ gap: 14 }}>
        <View style={st.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={T.h3}>Mostrar legendas</Text>
            <Text style={T.small}>Opcional. Sem animação, só o texto na hora certa.</Text>
          </View>
          <Switch
            value={settings.enabled}
            onValueChange={onToggle}
            disabled={busy}
            trackColor={{ false: C.surface3, true: C.accent }}
            thumbColor={settings.enabled ? C.accentInk : C.dim}
          />
        </View>

        {settings.enabled ? (
          <>
            <View style={st.optRow}>
              <Text style={[T.tiny, { width: 64 }]}>ESTILO</Text>
              <Chip label="Faixa" selected={settings.style === 'faixa'} onPress={() => onSettings({ style: 'faixa' })} />
              <Chip label="Contorno" selected={settings.style === 'contorno'} onPress={() => onSettings({ style: 'contorno' })} />
            </View>
            <View style={st.optRow}>
              <Text style={[T.tiny, { width: 64 }]}>POSIÇÃO</Text>
              <Chip label="Embaixo" selected={settings.position === 'baixo'} onPress={() => onSettings({ position: 'baixo' })} />
              <Chip label="No meio" selected={settings.position === 'meio'} onPress={() => onSettings({ position: 'meio' })} />
            </View>

            <Text style={T.small}>
              {cues.length
                ? 'O rascunho saiu das falas do roteiro. Toque no texto para corrigir com o que você falou de verdade.'
                : 'Nenhuma fala com legenda ainda. Posiciona a prévia e acrescenta.'}
            </Text>

            <View style={{ gap: 8 }}>
              {cues.map((c) => (
                <CueRow key={c.cueId} cue={c} active={time >= c.start && time < c.end} onEdit={onEdit} onDelete={onDelete} onSeek={onSeek} />
              ))}
            </View>
            <Button kind="ghost" small label={`Acrescentar legenda em ${formatPrecise(time)}`} icon={<Icon.Plus size={16} />} onPress={onAdd} />
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
        <Text style={[{ color: '#fff', fontSize, fontWeight: '900', textAlign: 'center' }, outline]}>{text}</Text>
      </View>
    </View>
  );
}
