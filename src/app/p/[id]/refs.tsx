import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { showDialog } from '../../../ui/dialog';
import { terry } from '../../../domain/terry';
import { formatDuration } from '../../../domain/timeline';
import { importReference, NativeMissingError } from '../../../services/media';
import { updateProject, useProject } from '../../../state/store';
import { removeFile } from '../../../storage/projects';
import { Icon } from '../../../ui/icons';
import { Button, Footer, Screen, TerryLine, Thumb, TopBar } from '../../../ui/kit';
import { C, R, T } from '../../../ui/theme';

export default function References() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const p = useProject(id);
  const [busy, setBusy] = useState(false);
  if (!p) return null;
  const left = 3 - p.references.length;

  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsMultipleSelection: left > 1,
      selectionLimit: left,
      quality: 1,
    });
    if (res.canceled) return;
    setBusy(true);
    try {
      for (const a of res.assets.slice(0, left)) {
        const ref = await importReference(p.id, a.uri, a.fileName ?? `Referência ${p.references.length + 1}`);
        updateProject(p.id, (cur) => ({ ...cur, references: [...cur.references, ref].slice(0, 3) }));
      }
    } catch (e) {
      showDialog('Não deu pra abrir esse vídeo', e instanceof NativeMissingError ? e.message : 'Tenta outro arquivo da galeria.');
    } finally {
      setBusy(false);
    }
  };

  const remove = (refId: string) =>
    updateProject(p.id, (cur) => {
      const r = cur.references.find((x) => x.id === refId);
      removeFile(r?.uri);
      removeFile(r?.thumbUri);
      return { ...cur, references: cur.references.filter((x) => x.id !== refId), primaryReferenceId: cur.primaryReferenceId === refId ? undefined : cur.primaryReferenceId };
    });

  return (
    <Screen>
      <TopBar title="Inspirações" step="2 de 3" onBack={() => router.replace('/')} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text style={T.h1}>Seus vídeos de referência</Text>
        <TerryLine text={terry.references(p)} />
        <View style={st.grid}>
          {p.references.map((r) => (
            <View key={r.id} style={st.cell}>
              <Thumb uri={r.thumbUri} style={st.thumb}>
                <View style={st.dur}>
                  <Text style={st.durText}>{formatDuration(r.duration)}</Text>
                </View>
                <Pressable onPress={() => remove(r.id)} style={st.remove} hitSlop={8} accessibilityLabel="Remover referência">
                  <Icon.Close size={14} />
                </Pressable>
              </Thumb>
              <Text numberOfLines={1} style={st.name}>{r.name}</Text>
            </View>
          ))}
          {left > 0 ? (
            <Pressable onPress={pick} disabled={busy} style={[st.cell]}>
              <View style={[st.thumb, st.add]}>
                <Icon.Plus size={26} color={busy ? C.mute : C.accent} />
                <Text style={[T.tiny, { color: busy ? C.mute : C.accent }]}>{busy ? 'Abrindo…' : 'Da galeria'}</Text>
              </View>
              <Text style={st.name}> </Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={T.small}>De 1 a 3 vídeos. TikToks salvos no celular funcionam. Os arquivos ficam só no aparelho; para a análise por IA vão apenas alguns quadros pequenos.</Text>
      </ScrollView>
      <Footer>
        <Button label="Criar roteiro" onPress={() => router.push(`/p/${p.id}/style`)} disabled={!p.references.length || busy} />
      </Footer>
    </Screen>
  );
}

const st = StyleSheet.create({
  grid: { flexDirection: 'row', gap: 10 },
  cell: { flex: 1, maxWidth: '33%' },
  thumb: { aspectRatio: 9 / 16, borderRadius: R.m, width: '100%' },
  add: { borderWidth: 1, borderStyle: 'dashed', borderColor: C.border, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.surface },
  dur: { position: 'absolute', right: 6, bottom: 6, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  durText: { color: C.text, fontSize: 11, fontWeight: '700' },
  remove: { position: 'absolute', right: 6, top: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  name: { color: C.dim, fontSize: 12, marginTop: 6 },
});
