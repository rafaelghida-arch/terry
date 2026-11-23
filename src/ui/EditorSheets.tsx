import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, StyleSheet, Text, View } from 'react-native';
import { showDialog } from './dialog';
import { cropRectFor, framingFromCropCenter, formatPrecise } from '../domain/timeline';
import type { Clip, Framing } from '../domain/types';
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
  recRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface2, borderRadius: R.m, padding: 12 },
});
