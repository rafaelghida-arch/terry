import { CameraView, useCameraPermissions, useMicrophonePermissions, type CameraType } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { showDialog } from '../../../ui/dialog';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { terry } from '../../../domain/terry';
import { assignClip } from '../../../services/flows';
import { createClip, isSimulator, NativeMissingError } from '../../../services/media';
import { getProject, updateProject, useProject } from '../../../state/store';
import { Icon, TerryMark } from '../../../ui/icons';
import { Button } from '../../../ui/kit';
import { C, R, T } from '../../../ui/theme';

export default function Record() {
  useKeepAwake();
  const { id, scene: sceneId } = useLocalSearchParams<{ id: string; scene: string }>();
  const p = useProject(id);
  const insets = useSafeAreaInsets();
  const cam = useRef<CameraView>(null);
  const [camPerm, requestCam] = useCameraPermissions();
  const [micPerm, requestMic] = useMicrophonePermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const startedAt = useRef(0);

  const scene = p?.scenes.find((s) => s.id === sceneId);
  const index = p?.scenes.findIndex((s) => s.id === sceneId) ?? -1;

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed((Date.now() - startedAt.current) / 1000), 100);
    return () => clearInterval(t);
  }, [recording]);

  // Bloqueou a tela ou saiu do app: para a gravação; o clipe é salvo no retorno da promessa.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active' && recording) cam.current?.stopRecording();
    });
    return () => sub.remove();
  }, [recording]);

  if (!p || !scene) return null;

  const save = async (uri: string, origin: 'camera' | 'galeria') => {
    setSaving(true);
    try {
      const clip = await createClip(p.id, uri, origin);
      await assignClip(p.id, scene.id, clip);
      // Seleciona a próxima tomada vazia para o criador seguir gravando.
      const cur = getProject(p.id);
      const next = cur?.scenes.find((s) => !s.clipId && !cur.skippedSceneIds.includes(s.id));
      updateProject(p.id, (x) => ({ ...x, selectedSceneId: next?.id ?? scene.id }));
      router.back();
    } catch (e) {
      showDialog('Não consegui salvar o clipe', e instanceof NativeMissingError ? e.message : 'Tenta gravar de novo.');
      setSaving(false);
    }
  };

  const toggleRecord = async () => {
    if (isSimulator) {
      showDialog('Câmera só no celular', 'No simulador, use a Galeria para escolher um vídeo do computador.');
      return;
    }
    if (!cam.current || !ready) return;
    if (recording) {
      cam.current.stopRecording();
      return;
    }
    setElapsed(0);
    startedAt.current = Date.now();
    setRecording(true);
    try {
      const res = await cam.current.recordAsync({ maxDuration: 180 });
      setRecording(false);
      if (res?.uri) await save(res.uri, 'camera');
    } catch {
      setRecording(false);
      showDialog('A gravação parou', 'Tenta de novo.');
    }
  };

  const pickGallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 1 });
    if (!res.canceled && res.assets[0]) await save(res.assets[0].uri, 'galeria');
  };

  const needPerm = !isSimulator && (!camPerm?.granted || !micPerm?.granted);
  const target = scene.duration;
  const overTarget = elapsed >= target;

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      {/* Instrução legível acima da câmera */}
      <View style={st.brief}>
        <View style={st.briefHead}>
          <Pressable onPress={() => router.back()} hitSlop={12} disabled={recording} accessibilityLabel="Fechar câmera">
            <Icon.Close size={22} color={recording ? C.mute : C.text} />
          </Pressable>
          <Text style={T.tiny}>
            TOMADA {index + 1} DE {p.scenes.length} · {target}s
          </Text>
          <View style={{ width: 22 }} />
        </View>
        <Text style={st.title}>{scene.title}</Text>
        <Text style={st.instruction}>{scene.instruction}</Text>
        {scene.line ? <Text style={st.line}>“{scene.line}”</Text> : null}
        <View style={st.tip}>
          <TerryMark size={20} />
          <Text style={st.tipText}>{terry.recordTip(scene, p)}</Text>
        </View>
      </View>

      <View style={st.cameraWrap}>
        {isSimulator ? (
          <View style={st.perm}>
            <Icon.Camera size={40} color={C.mute} />
            <Text style={[T.body, { textAlign: 'center' }]}>Aqui entra a câmera do celular.</Text>
            <Text style={[T.small, { textAlign: 'center' }]}>No simulador, toque em Galeria para escolher um vídeo do computador.</Text>
          </View>
        ) : needPerm ? (
          <View style={st.perm}>
            <Text style={[T.body, { textAlign: 'center' }]}>Preciso da câmera e do microfone pra gravar a tomada com som.</Text>
            <Button
              label="Permitir"
              onPress={async () => {
                await requestCam();
                await requestMic();
              }}
            />
          </View>
        ) : (
          <CameraView
            ref={cam}
            style={StyleSheet.absoluteFill}
            facing={facing}
            mode="video"
            videoQuality="1080p"
            onCameraReady={() => setReady(true)}
          />
        )}
        {recording ? (
          <View style={st.timer}>
            <View style={st.recDot} />
            <Text style={[st.timerText, overTarget && { color: C.accent }]}>
              {elapsed.toFixed(1)}s / {target}s
            </Text>
          </View>
        ) : null}
        {recording ? (
          <View style={st.barTrack}>
            <View style={[st.barFill, { width: `${Math.min(100, (elapsed / target) * 100)}%` }]} />
          </View>
        ) : null}
        {saving ? (
          <View style={st.saving}>
            <ActivityIndicator color={C.accent} />
            <Text style={T.body}>Pondo no lugar…</Text>
          </View>
        ) : null}
      </View>

      {/* Controles ao alcance do polegar */}
      <View style={[st.controls, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable onPress={pickGallery} disabled={recording || saving} style={[st.side, (recording || saving) && { opacity: 0.3 }]} accessibilityLabel="Escolher da galeria">
          <Icon.Gallery size={26} />
          <Text style={st.sideText}>Galeria</Text>
        </Pressable>
        <Pressable onPress={toggleRecord} disabled={(!ready && !isSimulator) || saving || needPerm} style={[st.recOuter, ((!ready && !isSimulator) || needPerm) && { opacity: 0.4 }]} accessibilityLabel={recording ? 'Parar' : 'Gravar'}>
          <View style={recording ? st.recStop : st.recInner} />
        </Pressable>
        <Pressable onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))} disabled={recording} style={[st.side, recording && { opacity: 0.3 }]} accessibilityLabel="Virar câmera">
          <Icon.Flip size={26} />
          <Text style={st.sideText}>Virar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  brief: { paddingHorizontal: 16, paddingBottom: 12, gap: 6 },
  briefHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 36 },
  title: { color: C.text, fontSize: 22, fontWeight: '800' },
  instruction: { color: C.text, fontSize: 17, lineHeight: 23 },
  line: { color: C.accent, fontSize: 16, fontWeight: '600' },
  tip: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 4 },
  tipText: { ...T.small, flex: 1, color: C.dim },
  cameraWrap: { flex: 1, marginHorizontal: 8, borderRadius: R.l, overflow: 'hidden', backgroundColor: C.surface },
  perm: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  timer: { position: 'absolute', top: 12, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.rec },
  timerText: { color: C.text, fontWeight: '700', fontVariant: ['tabular-nums'] },
  barTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.2)' },
  barFill: { height: 3, backgroundColor: C.accent },
  saving: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', gap: 10 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingTop: 16 },
  side: { alignItems: 'center', gap: 4, width: 70 },
  sideText: { color: C.dim, fontSize: 11, fontWeight: '600' },
  recOuter: { width: 82, height: 82, borderRadius: 41, borderWidth: 4, borderColor: C.text, alignItems: 'center', justifyContent: 'center' },
  recInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.rec },
  recStop: { width: 30, height: 30, borderRadius: 6, backgroundColor: C.rec },
});
