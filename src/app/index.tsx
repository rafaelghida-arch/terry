import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useScreen } from '../ui/simulator';
import { showDialog } from '../ui/dialog';
import { buildTimeline, formatDuration } from '../domain/timeline';
import type { Project } from '../domain/types';
import { createDemoProject } from '../services/flows';
import { isSimulator, nativeMediaAvailable } from '../services/media';
import { removeProject, useProjects } from '../state/store';
import { Icon, TerryMark } from '../ui/icons';
import { Screen, TerryLine, Thumb } from '../ui/kit';
import { GENRE_INFO } from '../domain/genres';
import { C, F, R, T } from '../ui/theme';
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
  const { width } = useScreen();
  const gap = 12;
  const colW = (width - 32 - gap) / 2;

  const confirmDelete = (p: Project) =>
    showDialog('Apagar projeto?', `“${p.title}” e os clipes gravados nele saem do aparelho.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: () => removeProject(p.id) },
    ]);

  return (
    <Screen>
      <View style={st.header}>
        <TerryMark size={30} />
        <Text style={st.logo}>terry</Text>
      </View>

      <FlatList
        data={projects}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={{ gap }}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 18, paddingBottom: 40 }}
        ListHeaderComponent={
          <View style={{ gap: 16, marginBottom: 4 }}>
            <Text style={st.hello}>{projects.length ? 'O que vamos gravar agora?' : 'Bora gravar alguma coisa?'}</Text>
            <View style={st.actions}>
              <Pressable onPress={() => router.push('/new')} style={({ pressed }) => [st.newBtn, pressed && { opacity: 0.85 }]}>
                <View style={st.plus}>
                  <Icon.Plus size={22} color={C.accent} />
                </View>
                <Text style={st.newText}>Novo projeto</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const p = createDemoProject();
                  router.push(`/p/${p.id}/hooks`);
                }}
                style={({ pressed }) => [st.demoBtn, pressed && { opacity: 0.7 }]}
              >
                <Icon.Film size={18} />
                <Text style={st.demoText}>Demonstração</Text>
              </Pressable>
            </View>

            {isSimulator ? (
              <TerryLine text="Você está no simulador. Dá pra percorrer o fluxo com os clipes de exemplo e vídeos do computador. Câmera e exportação do MP4 funcionam no app do celular." />
            ) : null}

            {!nativeMediaAvailable() ? (
              <TerryLine text="Esse app está rodando sem o módulo de vídeo do TERRY. Para analisar e exportar, abra pelo development build (veja o README)." />
            ) : null}

            {projects.length === 0 ? (
              <TerryLine text="Me conta o que você grava e me mostra uns vídeos que têm a sua cara. Comida, make, review, opinião… eu me ajusto." />
            ) : null}

            {projects.length ? <Text style={st.section}>Seus projetos</Text> : null}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(routeFor(item))}
            onLongPress={() => confirmDelete(item)}
            style={{ width: colW }}
            accessibilityHint="Toque e segure para apagar"
          >
            <Thumb uri={coverOf(item)} style={{ width: colW, height: colW * 1.32, borderRadius: R.l }}>
              {!coverOf(item) ? (
                <View style={st.emptyCover}>
                  <Icon.Film size={26} color={C.mute} />
                </View>
              ) : null}
              <View style={st.tags}>
                <View style={st.tag}>
                  <Text style={st.tagText}>{item.isDemo ? 'DEMO' : GENRE_INFO[item.genre ?? 'gastronomia'].short.toUpperCase()}</Text>
                </View>
              </View>
              <View style={st.dur}>
                <Text style={st.durText}>{durationOf(item)}</Text>
              </View>
            </Thumb>
            <Text numberOfLines={2} style={st.title}>
              {item.title}
            </Text>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const st = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, height: 56 },
  logo: { color: C.text, fontSize: 26, fontFamily: F.display, letterSpacing: -0.5 },
  hello: { ...T.h1, fontSize: 30, lineHeight: 34, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10 },
  newBtn: { flex: 1, height: 56, backgroundColor: C.accent, borderRadius: R.pill, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 8, paddingRight: 18 },
  plus: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.accentInk, alignItems: 'center', justifyContent: 'center' },
  newText: { color: C.accentInk, fontSize: 17, fontFamily: F.display },
  demoBtn: { height: 56, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  demoText: { color: C.text, fontSize: 14, fontWeight: '700' },
  section: { ...T.h2, marginTop: 8 },
  emptyCover: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tags: { position: 'absolute', top: 8, left: 8, flexDirection: 'row' },
  tag: { backgroundColor: 'rgba(13,13,15,0.75)', borderRadius: R.pill, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { color: C.accent, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  dur: { position: 'absolute', right: 8, bottom: 8, backgroundColor: 'rgba(13,13,15,0.75)', borderRadius: R.pill, paddingHorizontal: 8, paddingVertical: 3 },
  durText: { color: C.text, fontSize: 11, fontWeight: '700' },
  title: { color: C.text, fontSize: 14, fontWeight: '700', marginTop: 8 },
});
