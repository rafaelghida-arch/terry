// Reprodução contínua da montagem na prévia.
// Dois players se revezam: enquanto um toca o take atual, o outro já está com o próximo
// carregado e parado no ponto de entrada. No corte, só trocamos qual está visível — sem pausa.
// Narração e trilha tocam em sincronia por cima.
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { useVideoPlayer, type VideoPlayer } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import { segmentAt, type Timeline } from '../domain/timeline';
import type { Clip } from '../domain/types';

type Slot = { seg: number; uri: string | null };

export type AudioLayer = { uri: string; volume: number };

export function useTimelinePlayer(timeline: Timeline, opts: { volume: number; extras: AudioLayer[] }) {
  const setup = (p: VideoPlayer) => {
    p.timeUpdateEventInterval = 0.04;
    p.loop = false;
  };
  const pa = useVideoPlayer(null, setup);
  const pb = useVideoPlayer(null, setup);
  const players = [pa, pb] as const;

  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [index, setIndex] = useState(0);
  const [active, setActive] = useState<0 | 1>(0);
  const [slotClips, setSlotClips] = useState<[Clip | undefined, Clip | undefined]>([undefined, undefined]);

  const slots = useRef<[Slot, Slot]>([{ seg: -1, uri: null }, { seg: -1, uri: null }]);
  const activeRef = useRef<0 | 1>(0);
  const indexRef = useRef(0);
  const playingRef = useRef(false);
  const advancing = useRef(false);
  const tlRef = useRef(timeline);
  tlRef.current = timeline;
  const volRef = useRef(opts.volume);
  volRef.current = opts.volume;
  const extras = useRef<AudioPlayer[]>([]);
  const timeRef = useRef(0);

  // Camadas de áudio extra (narração, trilha).
  const extrasKey = opts.extras.map((e) => e.uri).join('|');
  useEffect(() => {
    extras.current.forEach((a) => a.remove());
    extras.current = opts.extras.map((e) => createAudioPlayer(e.uri));
    return () => {
      extras.current.forEach((a) => a.remove());
      extras.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extrasKey]);
  useEffect(() => {
    extras.current.forEach((a, i) => (a.volume = opts.extras[i]?.volume ?? 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.extras.map((e) => e.volume).join('|'), extrasKey]);

  const applyVolumes = useCallback(() => {
    players.forEach((p, i) => {
      p.volume = volRef.current;
      p.muted = i !== activeRef.current;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pa, pb]);
  useEffect(applyVolumes, [opts.volume, applyVolumes]);

  /** Carrega um take num slot e posiciona no ponto pedido (sem tocar). */
  const loadSlot = useCallback(
    async (slot: 0 | 1, seg: number, local?: number) => {
      const s = tlRef.current.segments[seg];
      const p = players[slot];
      if (!s) {
        slots.current[slot] = { seg: -1, uri: null };
        return;
      }
      if (slots.current[slot].uri !== s.clip.uri) {
        slots.current[slot] = { seg, uri: s.clip.uri };
        await p.replaceAsync({ uri: s.clip.uri });
      } else {
        slots.current[slot] = { seg, uri: s.clip.uri };
      }
      p.currentTime = local ?? s.start;
      setSlotClips((cur) => {
        const next: [Clip | undefined, Clip | undefined] = [...cur];
        next[slot] = s.clip;
        return next;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pa, pb],
  );

  const setActiveSlot = (slot: 0 | 1) => {
    activeRef.current = slot;
    setActive(slot);
    applyVolumes();
  };

  /** Vai para o take seguinte trocando de player; prepara o take depois dele no outro. */
  const advance = useCallback(async () => {
    if (advancing.current) return;
    advancing.current = true;
    try {
      const tl = tlRef.current;
      const next = indexRef.current + 1;
      const from = activeRef.current;
      const to: 0 | 1 = from === 0 ? 1 : 0;
      if (next >= tl.segments.length) {
        pause();
        await seek(0);
        return;
      }
      if (slots.current[to].seg !== next) await loadSlot(to, next);
      indexRef.current = next;
      setIndex(next);
      setActiveSlot(to);
      if (playingRef.current) players[to].play();
      players[from].pause();
      // Pré-carrega o próximo do próximo no player que acabou de sair.
      loadSlot(from, next + 1);
    } finally {
      advancing.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadSlot]);

  const seek = useCallback(
    async (t: number) => {
      const tl = tlRef.current;
      const at = segmentAt(tl, Math.max(0, Math.min(t, tl.total)));
      if (!at) return;
      timeRef.current = t;
      setTime(t);
      const slot = activeRef.current;
      const other: 0 | 1 = slot === 0 ? 1 : 0;
      indexRef.current = at.index;
      setIndex(at.index);
      await loadSlot(slot, at.index, at.local);
      setActiveSlot(slot);
      if (playingRef.current) players[slot].play();
      extras.current.forEach((a) => a.seekTo(t));
      loadSlot(other, at.index + 1);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadSlot],
  );

  // Recarrega quando a montagem muda (aparar, trocar clipe, reordenar).
  const signature = timeline.segments.map((s) => `${s.clip.id}:${s.start}:${s.end}`).join('|');
  useEffect(() => {
    slots.current = [
      { seg: -1, uri: slots.current[0].uri },
      { seg: -1, uri: slots.current[1].uri },
    ];
    seek(Math.min(timeRef.current, timeline.total));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(() => {
    const subs = players.flatMap((p, slot) => [
      p.addListener('timeUpdate', ({ currentTime }) => {
        if (slot !== activeRef.current || !playingRef.current) return;
        const seg = tlRef.current.segments[indexRef.current];
        if (!seg) return;
        if (currentTime >= seg.end - 0.05) {
          advance();
          return;
        }
        const t = seg.offset + Math.max(0, currentTime - seg.start);
        timeRef.current = t;
        setTime(t);
      }),
      // Garantia: se o arquivo acabar antes do evento de tempo, segue mesmo assim.
      p.addListener('playToEnd', () => {
        if (slot === activeRef.current && playingRef.current) advance();
      }),
    ]);
    return () => subs.forEach((s) => s.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pa, pb, advance]);

  const play = useCallback(() => {
    playingRef.current = true;
    setPlaying(true);
    applyVolumes();
    players[activeRef.current].play();
    extras.current.forEach((a) => {
      a.seekTo(timeRef.current);
      a.play();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pa, pb, applyVolumes]);

  const pause = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    players.forEach((p) => p.pause());
    extras.current.forEach((a) => a.pause());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pa, pb]);

  return { players, active, slotClips, time, playing, index, play, pause, seek };
}
