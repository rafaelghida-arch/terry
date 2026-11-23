// Aparar: faixa de miniaturas com duas alças (entrada e saída) e prévia em loop do trecho.
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { formatPrecise } from '../domain/timeline';
import type { Clip } from '../domain/types';
import { filmstrip } from '../services/media';
import { Button, Sheet } from './kit';
import { C, R, T } from './theme';

const HANDLE = 18;
const MIN_LEN = 0.5;

export function TrimSheet({ clip, visible, onClose, onSave, suggestion }: {
  clip: Clip | undefined;
  visible: boolean;
  onClose: () => void;
  onSave: (start: number, end: number) => void;
  suggestion?: string | null;
}) {
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [frames, setFrames] = useState<string[]>([]);
  const [width, setWidth] = useState(0);
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const player = useVideoPlayer(clip?.uri ?? null, (pl) => {
    pl.loop = false;
    pl.muted = false;
    pl.timeUpdateEventInterval = 0.1;
  });

  useEffect(() => {
    if (!clip || !visible) return;
    setRange([clip.trimStart, clip.trimEnd > 0 ? clip.trimEnd : clip.duration]);
    filmstrip(clip.uri, clip.duration, 8).then(setFrames);
  }, [clip?.id, visible]);

  // Prévia em loop dentro do trecho escolhido.
  useEffect(() => {
    if (!visible || !clip) return;
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      const [a, b] = rangeRef.current;
      if (currentTime >= b - 0.05 || currentTime < a - 0.3) player.currentTime = a;
    });
    player.currentTime = range[0];
    player.play();
    return () => {
      sub.remove();
      player.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, clip?.id]);

  const dur = clip?.duration ?? 1;
  const toX = (t: number) => (t / dur) * width;
  const toT = (x: number) => Math.min(dur, Math.max(0, (x / Math.max(1, width)) * dur));

  const makePan = (which: 0 | 1) => {
    let startX = 0;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startX = toX(rangeRef.current[which]);
        player.pause();
      },
      onPanResponderMove: (_, g) => {
        const t = toT(startX + g.dx);
        const [a, b] = rangeRef.current;
        const next: [number, number] = which === 0 ? [Math.min(t, b - MIN_LEN), b] : [a, Math.max(t, a + MIN_LEN)];
        setRange(next);
        player.currentTime = next[which];
      },
      onPanResponderRelease: () => {
        player.currentTime = rangeRef.current[0];
        player.play();
      },
    });
  };
  const panIn = useMemo(() => makePan(0), [width, dur]);
  const panOut = useMemo(() => makePan(1), [width, dur]);

  if (!clip) return null;
  const portrait = clip.height >= clip.width;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Aparar"
      action={<Text style={[T.small, { color: C.accent, fontWeight: '700' }]}>{formatPrecise(range[1] - range[0])}</Text>}
    >
      <View style={{ gap: 14 }}>
        {suggestion ? <Text style={T.small}>{suggestion}</Text> : null}
        <View style={[st.preview, { aspectRatio: portrait ? 9 / 16 : 16 / 9, height: portrait ? 260 : undefined }]}>
          <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
        </View>
        <View style={st.strip} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
          <View style={st.frames}>
            {frames.map((f, i) => (f ? <Image key={i} source={{ uri: f }} style={st.frame} /> : <View key={i} style={st.frame} />))}
          </View>
          {width > 0 ? (
            <>
              <View style={[st.shade, { left: 0, width: toX(range[0]) }]} />
              <View style={[st.shade, { left: toX(range[1]), right: 0 }]} />
              <View style={[st.window, { left: toX(range[0]), width: toX(range[1]) - toX(range[0]) }]} />
              <View {...panIn.panHandlers} style={[st.handle, { left: toX(range[0]) - HANDLE / 2 }]} hitSlop={{ left: 14, right: 14, top: 10, bottom: 10 }}>
                <View style={st.grip} />
              </View>
              <View {...panOut.panHandlers} style={[st.handle, { left: toX(range[1]) - HANDLE / 2 }]} hitSlop={{ left: 14, right: 14, top: 10, bottom: 10 }}>
                <View style={st.grip} />
              </View>
            </>
          ) : null}
        </View>
        <View style={st.times}>
          <Text style={T.small}>Entrada {formatPrecise(range[0])}</Text>
          <Text style={T.small}>Saída {formatPrecise(range[1])}</Text>
        </View>
        <Text style={T.small}>O arquivo original não muda. Só esse trecho entra na montagem.</Text>
        <Button label="Usar esse trecho" onPress={() => onSave(Math.round(range[0] * 100) / 100, Math.round(range[1] * 100) / 100)} />
      </View>
    </Sheet>
  );
}

const st = StyleSheet.create({
  preview: { alignSelf: 'center', width: '100%', maxWidth: '100%', backgroundColor: '#000', borderRadius: R.m, overflow: 'hidden' },
  strip: { height: 56, justifyContent: 'center', marginHorizontal: HANDLE / 2 },
  frames: { flexDirection: 'row', height: 48, borderRadius: 6, overflow: 'hidden', backgroundColor: C.surface2 },
  frame: { flex: 1, height: 48, backgroundColor: C.surface2 },
  shade: { position: 'absolute', top: 4, height: 48, backgroundColor: 'rgba(0,0,0,0.65)' },
  window: { position: 'absolute', top: 4, height: 48, borderWidth: 2, borderColor: C.accent, borderRadius: 4 },
  handle: { position: 'absolute', top: 0, width: HANDLE, height: 56, borderRadius: 5, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  grip: { width: 3, height: 18, borderRadius: 2, backgroundColor: C.accentInk },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
});
