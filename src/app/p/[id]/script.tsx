import { Asset } from 'expo-asset';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { showDialog } from '../../../ui/dialog';
import { terry } from '../../../domain/terry';
import { buildTimeline, formatDuration } from '../../../domain/timeline';
import type { Scene } from '../../../domain/types';
import {
  addScene,
  approveScript,
  assignClip,
  deleteScene,
  moveScene,
  regenerateScene,
  toggleSkip,
  updateClip,
  updateScene,
} from '../../../services/flows';
import { createClip, isSimulator, NativeMissingError } from '../../../services/media';
import { updateProject, useProject } from '../../../state/store';
import { Icon } from '../../../ui/icons';
import { Button, Footer, ProgressBar, Screen, TerryLine, Thumb, TopBar } from '../../../ui/kit';
import { ClipPlayerSheet, SceneEditSheet } from '../../../ui/SceneSheets';
import { C, R, T } from '../../../ui/theme';
import { TrimSheet } from '../../../ui/TrimSheet';

const DEMO_CLIPS = [require('../../../../assets/demo/demo-chapa.mp4'), require('../../../../assets/demo/demo-mesa.mp4')];

const ROLE: Record<string, string> = {
  gancho: 'GANCHO', preparo: 'PREPARO', escala: 'ESCALA', revelacao: 'REVELAÇÃO', detalhe: 'DETALHE', mordida: 'MORDIDA',
  reacao: 'REAÇÃO', fachada: 'FACHADA', contexto: 'CONTEXTO', fechamento: 'FECHAMENTO', antes: 'ANTES', demonstracao: 'DEMONSTRAÇÃO',
  passo: 'PASSO', resultado: 'RESULTADO', produto: 'PRODUTO', prova: 'PROVA', argumento: 'ARGUMENTO', chamada: 'CHAMADA',
};

export default function ScriptBoard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const p = useProject(id);
  const [busyScene, setBusyScene] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [watching, setWatching] = useState<string | null>(null);
  const [trimming, setTrimming] = useState<string | null>(null);
  if (!p) return null;

  const tl = buildTimeline(p);
  const done = tl.segments.length;
  const selectedId = p.selectedSceneId ?? p.scenes[0]?.id;
  const select = (sceneId: string) => updateProject(p.id, (cur) => ({ ...cur, selectedSceneId: sceneId }));

  const fromGallery = async (scene: Scene) => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], allowsMultipleSelection: false, quality: 1 });
    if (res.canceled || !res.assets[0]) return;
    await attach(scene, res.assets[0].uri, 'galeria');
  };

  const fromDemo = async (scene: Scene) => {
    const i = p.scenes.findIndex((s) => s.id === scene.id);
    const asset = await Asset.fromModule(DEMO_CLIPS[i % DEMO_CLIPS.length]).downloadAsync();
    await attach(scene, asset.localUri ?? asset.uri, 'demo');
  };

  const attach = async (scene: Scene, uri: string, origin: 'galeria' | 'demo') => {
    setBusyScene(scene.id);
    try {
      const clip = await createClip(p.id, uri, origin);
      const msg = await assignClip(p.id, scene.id, clip);
      setFlash(msg);
    } catch (e) {
      showDialog('Não deu pra usar esse vídeo', e instanceof NativeMissingError ? e.message : 'Tenta outro arquivo.');
    } finally {
      setBusyScene(null);
    }
  };

  const regen = async (scene: Scene) => {
    setBusyScene(scene.id);
    try {
      await regenerateScene(p.id, scene.id);
    } finally {
      setBusyScene(null);
    }
  };

  const assemble = () => {
    if (!done) return;
    const go = () => {
      updateProject(p.id, (cur) => ({ ...cur, stage: 'edit', skippedSceneIds: [...new Set([...cur.skippedSceneIds, ...tl.missing.map((s) => s.id)])] }));
      router.push(`/p/${p.id}/editor`);
    };
    if (!tl.missing.length) return go();
    const fachada = tl.missing.length === 1 && tl.missing[0].role === 'fachada';
    showDialog(
      fachada ? 'Falta a fachada' : `Faltam ${tl.missing.length} tomadas`,
      fachada ? 'Quer usar o corte sem a fachada ou gravar essa parte?' : 'Dá pra montar sem elas e gravar depois.',
      [
        { text: 'Gravar', style: 'cancel', onPress: () => select(tl.missing[0].id) },
        { text: 'Montar sem', onPress: go },
      ],
    );
  };

  const confirmDelete = (scene: Scene) =>
    showDialog('Excluir tomada?', scene.clipId ? 'O clipe dessa tomada também sai do projeto.' : undefined, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => deleteScene(p.id, scene.id) },
    ]);

  const editingScene = p.scenes.find((s) => s.id === editing);
  const watchClip = watching ? p.clips[watching] : undefined;
  const trimClip = trimming ? p.clips[trimming] : undefined;

  return (
    <Screen>
      <TopBar
        title={p.title}
        step={p.scriptApproved ? 'Tomadas' : 'Roteiro'}
        onBack={() => router.replace('/')}
        right={
          <Pressable onPress={() => addScene(p.id, selectedId)} hitSlop={10} accessibilityLabel="Adicionar tomada">
            <Icon.Plus size={22} />
          </Pressable>
        }
      />
      <View style={st.progress}>
        <View style={st.progressRow}>
          <Text style={T.h3}>
            {done} de {p.scenes.length} tomadas prontas
          </Text>
          <Text style={T.small}>{formatDuration(tl.total)}</Text>
        </View>
        <ProgressBar value={p.scenes.length ? done / p.scenes.length : 0} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 10 }}>
        <TerryLine text={flash ?? (p.scriptApproved ? terry.shoot(p) : 'Ajusta o que quiser e aprova. Dá pra mudar depois também.')} />

        {p.scenes.map((scene, i) => {
          const clip = scene.clipId ? p.clips[scene.clipId] : undefined;
          const sel = scene.id === selectedId;
          const skipped = p.skippedSceneIds.includes(scene.id);
          const busy = busyScene === scene.id;
          return (
            <Pressable key={scene.id} onPress={() => select(scene.id)} style={[st.card, sel && st.cardSel, skipped && !clip && { opacity: 0.5 }]}>
              <View style={st.cardRow}>
                <Pressable onPress={() => (clip ? setWatching(clip.id) : select(scene.id))}>
                  <Thumb uri={clip?.thumbUri} style={[st.slot, !clip && st.slotEmpty]}>
                    {busy ? (
                      <View style={st.center}>
                        <ActivityIndicator color={C.accent} />
                      </View>
                    ) : clip ? (
                      <View style={st.clipDur}>
                        <Text style={st.clipDurText}>{formatDuration(clip.trimEnd - clip.trimStart)}</Text>
                      </View>
                    ) : (
                      <View style={st.center}>
                        <Text style={st.slotNum}>{i + 1}</Text>
                      </View>
                    )}
                  </Thumb>
                </Pressable>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[T.tiny, sel && { color: C.accent }]}>
                    {ROLE[scene.role] ?? scene.role.toUpperCase()} · {scene.duration}s{skipped && !clip ? ' · SEM ESSA' : ''}
                  </Text>
                  <Text style={T.h3} numberOfLines={2}>{scene.title}</Text>
                  <Text style={T.small} numberOfLines={sel ? undefined : 2}>{scene.instruction}</Text>
                  {sel ? (
                    <>
                      <Text style={[T.small, { color: C.text, marginTop: 4 }]}>{scene.audio}</Text>
                      {scene.line ? <Text style={[T.small, { fontStyle: 'italic' }]}>“{scene.line}”</Text> : null}
                    </>
                  ) : null}
                </View>
              </View>

              {sel ? (
                <View style={{ gap: 10, marginTop: 10 }}>
                  <View style={st.actions}>
                    <Button
                      small
                      label={clip ? 'Gravar de novo' : 'Gravar agora'}
                      icon={<Icon.Camera size={18} color={C.accentInk} />}
                      onPress={() => router.push(`/p/${p.id}/record?scene=${scene.id}`)}
                      style={{ flex: 1 }}
                      disabled={busy}
                    />
                    <Button
                      small
                      kind="secondary"
                      label={clip ? 'Trocar clipe' : 'Escolher da galeria'}
                      icon={<Icon.Gallery size={18} />}
                      onPress={() => fromGallery(scene)}
                      style={{ flex: 1 }}
                      disabled={busy}
                    />
                  </View>
                  <View style={st.mini}>
                    {clip ? <MiniAction label="Assistir" icon={<Icon.Play size={18} />} onPress={() => setWatching(clip.id)} /> : null}
                    {clip ? <MiniAction label="Aparar" icon={<Icon.Trim size={18} />} onPress={() => setTrimming(clip.id)} /> : null}
                    <MiniAction label="Editar" icon={<Icon.Edit size={18} />} onPress={() => setEditing(scene.id)} />
                    <MiniAction label="Outra versão" icon={<Icon.Refresh size={18} />} onPress={() => regen(scene)} />
                    <MiniAction label="Subir" icon={<Icon.Up size={18} />} onPress={() => moveScene(p.id, scene.id, -1)} disabled={i === 0} />
                    <MiniAction label="Descer" icon={<Icon.Down size={18} />} onPress={() => moveScene(p.id, scene.id, 1)} disabled={i === p.scenes.length - 1} />
                    {!clip && p.scriptApproved ? (
                      <MiniAction label={skipped ? 'Incluir' : 'Montar sem'} icon={<Icon.Skip size={18} />} onPress={() => toggleSkip(p.id, scene.id, !skipped)} />
                    ) : null}
                    {(p.isDemo || isSimulator) && !clip ? <MiniAction label="Clipe exemplo" icon={<Icon.Film size={18} />} onPress={() => fromDemo(scene)} /> : null}
                    <MiniAction label="Excluir" icon={<Icon.Trash size={18} color={C.danger} />} onPress={() => confirmDelete(scene)} />
                  </View>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <Footer>
        {p.scriptApproved ? (
          <Button label="Montar vídeo" icon={<Icon.Film size={20} color={C.accentInk} />} onPress={assemble} disabled={!done} />
        ) : (
          <Button label="Aprovar roteiro" onPress={() => approveScript(p.id)} disabled={!p.scenes.length} />
        )}
      </Footer>

      <SceneEditSheet scene={editingScene} visible={!!editingScene} onClose={() => setEditing(null)} onSave={(patch) => editingScene && updateScene(p.id, editingScene.id, patch)} />
      <ClipPlayerSheet clip={watchClip} visible={!!watchClip} onClose={() => setWatching(null)} />
      <TrimSheet
        clip={trimClip}
        visible={!!trimClip}
        onClose={() => setTrimming(null)}
        onSave={(a, b) => {
          if (trimClip) updateClip(p.id, trimClip.id, { trimStart: a, trimEnd: b });
          setTrimming(null);
        }}
      />
    </Screen>
  );
}

function MiniAction({ label, icon, onPress, disabled }: { label: string; icon: React.ReactNode; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [st.miniBtn, { opacity: disabled ? 0.3 : pressed ? 0.6 : 1 }]}>
      {icon}
      <Text style={st.miniText}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  progress: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  card: { backgroundColor: C.surface, borderRadius: R.l, padding: 10, borderWidth: 1.5, borderColor: C.surface },
  cardSel: { borderColor: C.accent },
  cardRow: { flexDirection: 'row', gap: 12 },
  slot: { width: 58, height: 103, borderRadius: R.s },
  slotEmpty: { borderWidth: 1, borderColor: C.border, borderStyle: 'dashed', backgroundColor: C.surface2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  slotNum: { color: C.mute, fontSize: 20, fontWeight: '800' },
  clipDur: { position: 'absolute', bottom: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 3, paddingHorizontal: 4 },
  clipDurText: { color: C.text, fontSize: 10, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 8 },
  mini: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  miniBtn: { alignItems: 'center', gap: 3, width: 70, paddingVertical: 6 },
  miniText: { color: C.dim, fontSize: 11, fontWeight: '600', textAlign: 'center' },
});
