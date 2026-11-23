import { router } from 'expo-router';
import { Alert, FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { buildTimeline, formatDuration } from '../domain/timeline';
import type { Project } from '../domain/types';
import { createDemoProject } from '../services/flows';
import { nativeMediaAvailable } from '../services/media';
import { removeProject, useProjects } from '../state/store';
import { Icon, TerryMark } from '../ui/icons';
import { Badge, Screen, TerryLine, Thumb } from '../ui/kit';
import { C, R, T } from '../ui/theme';
import { routeFor } from '../navigation';

function coverOf(p: Project) {
  const first = p.scenes.map((s) => (s.clipId ? p.clips[s.clipId] : undefined)).find(Boolean);
  return first?.thumbUri ?? p.coverUri ?? p.references[0]?.thumbUri;
}

function durationOf(p: Project) {
  const tl = buildTimeline(p);
  return tl.total > 0 ? formatDuration(tl.total) : `~${p.targetDuration}s`;
}

export default function Home() {
  const projects = useProjects();
  const { width } = useWindowDimensions();
  const gap = 10;
  const colW = (width - 32 - gap * 2) / 3;

  const confirmDelete = (p: Project) =>
    Alert.alert('Apagar projeto?', `“${p.title}” e os clipes gravados nele saem do aparelho.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: () => removeProject(p.id) },
    ]);

  return (
    <Screen>
      <View style={st.header}>
        <TerryMark size={30} />
        <Text style={st.logo}>TERRY</Text>
      </View>

      <FlatList
        data={projects}
        keyExtractor={(p) => p.id}
        numColumns={3}
        columnWrapperStyle={{ gap }}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 14, paddingBottom: 40 }}
        ListHeaderComponent={
          <View style={{ gap: 14, marginBottom: 6 }}>
            <Pressable onPress={() => router.push('/new')} style={({ pressed }) => [st.newBtn, pressed && { opacity: 0.8 }]}>
              <View style={st.plus}>
                <Icon.Plus size={26} color={C.accentInk} />
              </View>
              <View>
                <Text style={st.newText}>Novo projeto</Text>
                <Text style={[T.small, { color: '#0B4A52' }]}>Referências, roteiro e gravação</Text>
              </View>
            </Pressable>

            {!nativeMediaAvailable() ? (
              <TerryLine text="Esse app está rodando sem o módulo de vídeo do TERRY. Para analisar e exportar, abra pelo development build (veja o README)." />
            ) : null}

            {projects.length === 0 ? (
              <TerryLine text="Me mostra uns vídeos que têm a sua cara. Ou abre o projeto de demonstração pra testar gravar, montar e exportar." />
            ) : null}

            <View style={st.rowBetween}>
              <Text style={T.h3}>Projetos</Text>
              <Pressable
                onPress={() => {
                  const p = createDemoProject();
                  router.push(`/p/${p.id}/hooks`);
                }}
                hitSlop={8}
              >
                <Text style={st.link}>Abrir demonstração</Text>
              </Pressable>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(routeFor(item))}
            onLongPress={() => confirmDelete(item)}
            style={{ width: colW }}
            accessibilityHint="Toque e segure para apagar"
          >
            <Thumb uri={coverOf(item)} style={{ width: colW, height: colW * 1.5, borderRadius: R.m }}>
              {!coverOf(item) ? (
                <View style={st.emptyCover}>
                  <Icon.Film size={24} color={C.mute} />
                </View>
              ) : null}
              <View style={st.dur}>
                <Text style={st.durText}>{durationOf(item)}</Text>
              </View>
              {item.isDemo ? (
                <View style={{ position: 'absolute', top: 6, left: 6 }}>
                  <Badge label="DEMO" tone="accent" />
                </View>
              ) : null}
            </Thumb>
            <Text numberOfLines={2} style={st.title}>
              {item.title}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={[T.small, { textAlign: 'center', marginTop: 20 }]}>Seus projetos aparecem aqui, com a capa do vídeo.</Text>
        }
      />
    </Screen>
  );
}

const st = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, height: 56 },
  logo: { color: C.text, fontSize: 24, fontWeight: '900', letterSpacing: 2 },
  newBtn: { backgroundColor: C.accent, borderRadius: R.l, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  plus: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.12)', alignItems: 'center', justifyContent: 'center' },
  newText: { color: C.accentInk, fontSize: 19, fontWeight: '800' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  link: { color: C.accent, fontWeight: '700', fontSize: 14 },
  emptyCover: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dur: { position: 'absolute', right: 6, bottom: 6, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  durText: { color: C.text, fontSize: 11, fontWeight: '700' },
  title: { color: C.text, fontSize: 13, fontWeight: '600', marginTop: 6 },
});
