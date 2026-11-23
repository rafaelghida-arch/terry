import { Asset as LibraryAsset, requestPermissionsAsync } from 'expo-media-library';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { terry } from '../../../domain/terry';
import { buildTimeline, formatDuration } from '../../../domain/timeline';
import { cancelExport, exportProject, makeThumb, onExportProgress } from '../../../services/media';
import { getProject, updateProject, useProject } from '../../../state/store';
import { Icon } from '../../../ui/icons';
import { Button, Footer, ProgressBar, Screen, TerryLine, TopBar } from '../../../ui/kit';
import { C, R, T } from '../../../ui/theme';

type State = { kind: 'idle' } | { kind: 'running'; progress: number } | { kind: 'done'; uri: string } | { kind: 'error'; message: string };

export default function Export() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const p = useProject(id);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [saved, setSaved] = useState(false);
  const started = useRef(false);
  const player = useVideoPlayer(null, (pl) => (pl.loop = true));

  const run = async () => {
    const proj = getProject(id!);
    if (!proj) return;
    setSaved(false);
    setState({ kind: 'running', progress: 0 });
    const sub = onExportProgress((progress) => setState((s) => (s.kind === 'running' ? { kind: 'running', progress } : s)));
    try {
      const res = await exportProject(proj);
      const thumb = await makeThumb(proj.id, res.uri, 0.5);
      updateProject(proj.id, (cur) => ({
        ...cur,
        stage: 'edit',
        lastExport: { uri: res.uri, createdAt: Date.now(), duration: res.duration },
        coverUri: thumb ?? cur.coverUri,
      }));
      setState({ kind: 'done', uri: res.uri });
      await player.replaceAsync({ uri: res.uri });
      player.play();
    } catch (e) {
      // A edição continua salva no projeto; só a exportação falhou.
      setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      sub.remove();
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run();
    return () => cancelExport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!p) return null;
  const total = buildTimeline(p).total;

  const save = async () => {
    if (state.kind !== 'done') return;
    const perm = await requestPermissionsAsync(true);
    if (!perm.granted) {
      Alert.alert('Sem acesso à galeria', 'Libera nos ajustes pra salvar o vídeo, ou usa Compartilhar.');
      return;
    }
    try {
      await LibraryAsset.create(state.uri);
      setSaved(true);
      updateProject(p.id, (cur) => (cur.lastExport ? { ...cur, lastExport: { ...cur.lastExport, savedToGallery: true } } : cur));
    } catch (e) {
      Alert.alert('Não consegui salvar', e instanceof Error ? e.message : 'Tenta de novo.');
    }
  };

  const share = async () => {
    if (state.kind !== 'done') return;
    await Sharing.shareAsync(state.uri, { mimeType: 'video/mp4', UTI: 'public.mpeg-4', dialogTitle: p.title });
  };

  return (
    <Screen>
      <TopBar
        title="Exportar"
        onBack={() => {
          if (state.kind === 'running') cancelExport();
          router.back();
        }}
      />
      <View style={st.body}>
        {state.kind === 'running' || state.kind === 'idle' ? (
          <View style={st.center}>
            <Text style={st.percent}>{Math.round((state.kind === 'running' ? state.progress : 0) * 100)}%</Text>
            <View style={{ width: '70%' }}>
              <ProgressBar value={state.kind === 'running' ? state.progress : 0} height={6} />
            </View>
            <Text style={T.small}>
              MP4 vertical 1080×1920 · {formatDuration(total)}
            </Text>
            <Text style={[T.small, { textAlign: 'center', paddingHorizontal: 30 }]}>Deixa o app aberto até terminar.</Text>
          </View>
        ) : null}

        {state.kind === 'done' ? (
          <View style={{ alignItems: 'center', gap: 14 }}>
            <View style={st.video}>
              <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls />
            </View>
            <TerryLine text={terry.exportDone(saved)} style={{ alignSelf: 'stretch' }} />
          </View>
        ) : null}

        {state.kind === 'error' ? (
          <View style={{ gap: 12 }}>
            <TerryLine text={terry.exportFailed()} />
            <Text style={T.small}>Detalhe: {state.message}</Text>
          </View>
        ) : null}
      </View>

      <Footer>
        {state.kind === 'running' ? <Button kind="ghost" label="Cancelar" onPress={() => cancelExport()} /> : null}
        {state.kind === 'done' ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button style={{ flex: 1 }} label={saved ? 'Salvo' : 'Salvar na galeria'} icon={saved ? <Icon.Check size={18} color={C.accentInk} /> : <Icon.Download size={18} color={C.accentInk} />} onPress={save} disabled={saved} />
            <Button style={{ flex: 1 }} kind="secondary" label="Compartilhar" icon={<Icon.Share size={18} />} onPress={share} />
          </View>
        ) : null}
        {state.kind === 'error' ? <Button label="Tentar de novo" icon={<Icon.Refresh size={18} color={C.accentInk} />} onPress={run} /> : null}
      </Footer>
    </Screen>
  );
}

const st = StyleSheet.create({
  body: { flex: 1, padding: 16, justifyContent: 'center' },
  center: { alignItems: 'center', gap: 14 },
  percent: { color: C.text, fontSize: 44, fontWeight: '800', fontVariant: ['tabular-nums'] },
  video: { height: 420, aspectRatio: 9 / 16, backgroundColor: '#000', borderRadius: R.m, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
});
