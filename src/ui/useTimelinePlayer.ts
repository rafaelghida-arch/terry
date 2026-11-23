// Reprodução da montagem na prévia: um player de vídeo que troca de clipe a cada corte seco,
// mais a narração (se houver) tocando em sincronia.
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { useVideoPlayer } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import { segmentAt, type Timeline } from '../domain/timeline';

export function useTimelinePlayer(timeline: Timeline, opts: { volume: number; narrationUri?: string; narrationVolume: number }) {
  const player = useVideoPlayer(null, (p) => {
    p.timeUpdateEventInterval = 0.05;
    p.loop = false;
  });
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [index, setIndex] = useState(0);
  const loadedUri = useRef<string | null>(null);
  const indexRef = useRef(0);
  const playingRef = useRef(false);
  const tlRef = useRef(timeline);
  tlRef.current = timeline;
  const narration = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    narration.current?.remove();
    narration.current = opts.narrationUri ? createAudioPlayer(opts.narrationUri) : null;
    return () => {
      narration.current?.remove();
      narration.current = null;
    };
  }, [opts.narrationUri]);

  useEffect(() => {
    player.volume = opts.volume;
    if (narration.current) narration.current.volume = opts.narrationVolume;
  }, [opts.volume, opts.narrationVolume, player]);

  const load = useCallback(
    async (i: number, local: number) => {
      const seg = tlRef.current.segments[i];
      if (!seg) return;
      indexRef.current = i;
      setIndex(i);
      if (loadedUri.current !== seg.clip.uri) {
        loadedUri.current = seg.clip.uri;
        await player.replaceAsync({ uri: seg.clip.uri });
      }
      player.currentTime = local;
      if (playingRef.current) player.play();
    },
    [player],
  );

  const seek = useCallback(
    async (t: number) => {
      const at = segmentAt(tlRef.current, Math.max(0, Math.min(t, tlRef.current.total)));
      if (!at) return;
      setTime(t);
      await load(at.index, at.local);
      if (narration.current) narration.current.seekTo(t);
    },
    [load],
  );

  // Recarrega quando a montagem muda (aparar, trocar clipe, reordenar).
  const signature = timeline.segments.map((s) => `${s.clip.id}:${s.start}:${s.end}`).join('|');
  useEffect(() => {
    loadedUri.current = null;
    seek(Math.min(time, timeline.total));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(() => {
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      const tl = tlRef.current;
      const seg = tl.segments[indexRef.current];
      if (!seg || !playingRef.current) return;
      if (currentTime >= seg.end - 0.03) {
        const next = indexRef.current + 1;
        if (next < tl.segments.length) {
          load(next, tl.segments[next].start);
        } else {
          pause();
          seek(0);
        }
        return;
      }
      setTime(seg.offset + Math.max(0, currentTime - seg.start));
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, load]);

  const play = useCallback(() => {
    playingRef.current = true;
    setPlaying(true);
    player.play();
    if (narration.current) {
      narration.current.seekTo(time);
      narration.current.play();
    }
  }, [player, time]);

  const pause = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    player.pause();
    narration.current?.pause();
  }, [player]);

  return { player, time, playing, index, play, pause, seek, setMutedOriginal: (m: boolean) => (player.muted = m) };
}
