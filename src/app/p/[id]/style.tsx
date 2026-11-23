import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { analysisIsCurrent } from '../../../domain/style';
import { terry } from '../../../domain/terry';
import type { Observation } from '../../../domain/types';
import { addObservation, editObservation, generateScript, runAnalysis, setGenre } from '../../../services/flows';
import { GENRE_INFO } from '../../../domain/genres';
import { NativeMissingError } from '../../../services/media';
import { updateProject, useProject } from '../../../state/store';
import { Icon } from '../../../ui/icons';
import { Badge, Button, Footer, Screen, TerryLine, Thumb, TopBar } from '../../../ui/kit';
import { C, R, T } from '../../../ui/theme';

const SOURCE: Record<string, string> = { ia: 'IA', medido: 'MEDIDO', demo: 'EXEMPLO', criador: 'VOCÊ' };

function ObservationRow({ o, onChange }: { o: Observation; onChange: (patch: Partial<Observation>) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(o.text);
  return (
    <View style={[st.obs, !o.enabled && { opacity: 0.45 }]}>
      <Pressable onPress={() => onChange({ enabled: !o.enabled })} hitSlop={8} style={[st.check, o.enabled && { backgroundColor: C.accent, borderColor: C.accent }]}>
        {o.enabled ? <Icon.Check size={14} color={C.accentInk} /> : null}
      </Pressable>
      <View style={{ flex: 1, gap: 4 }}>
        {editing ? (
          <TextInput
            value={text}
            onChangeText={setText}
            autoFocus
            multiline
            style={st.obsInput}
            onBlur={() => {
              setEditing(false);
              if (text.trim() && text !== o.text) onChange({ text: text.trim() });
            }}
          />
        ) : (
          <Pressable onPress={() => setEditing(true)}>
            <Text style={T.body}>{o.text}</Text>
          </Pressable>
        )}
        <Badge label={SOURCE[o.source] ?? o.source} tone={o.source === 'ia' ? 'accent' : 'mute'} />
      </View>
    </View>
  );
}

export default function Style() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const p = useProject(id);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [newObs, setNewObs] = useState('');
  const started = useRef(false);

  const analyze = async (force = false) => {
    if (!p) return;
    setError(null);
    setProgress('Preparando…');
    try {
      await runAnalysis(p.id, setProgress, force);
    } catch (e) {
      setError(e instanceof NativeMissingError ? e.message : 'Não consegui ler uma das referências. Confere se o arquivo abre na galeria.');
    } finally {
      setProgress(null);
    }
  };

  useEffect(() => {
    if (!p || p.isDemo || started.current) return;
    started.current = true;
    if (!analysisIsCurrent(p.analysis, p.references)) analyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id]);

  if (!p) return null;
  const a = p.analysis;

  const next = async () => {
    setGenerating(true);
    try {
      await generateScript(p.id);
      router.push(`/p/${p.id}/hooks`);
    } finally {
      setGenerating(false);
    }
  };

  const sourceLabel = a?.source === 'ia' ? `Análise por IA${a.model ? '' : ''}` : a?.source === 'demo' ? 'Análise de exemplo' : 'Medido no aparelho';

  return (
    <Screen>
      <TopBar
        title="Estilo"
        step="3 de 4"
        right={
          !p.isDemo && a && !progress ? (
            <Pressable onPress={() => analyze(true)} hitSlop={10} accessibilityLabel="Analisar de novo">
              <Icon.Refresh size={20} />
            </Pressable>
          ) : null
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        {progress ? (
          <View style={st.loading}>
            <ActivityIndicator color={C.accent} />
            <Text style={T.body}>{progress}</Text>
          </View>
        ) : null}
        {error ? <TerryLine text={error} /> : null}

        {a && !progress ? (
          <>
            <View style={{ gap: 6 }}>
              <Text style={T.h1}>O que eu vi</Text>
              <Badge label={sourceLabel.toUpperCase()} tone={a.source === 'ia' ? 'accent' : 'mute'} />
            </View>
            {p.analysisNote ? <TerryLine text={p.analysisNote} /> : null}

            {terry.genreMismatch(p) && a.genre ? (
              <View style={{ gap: 10 }}>
                <TerryLine text={terry.genreMismatch(p)} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button small style={{ flex: 1 }} label={`Seguir: ${GENRE_INFO[a.genre.detected].short}`} onPress={() => setGenre(p.id, a.genre!.detected)} />
                  <Button small kind="secondary" style={{ flex: 1 }} label={`Manter: ${GENRE_INFO[p.genre ?? 'gastronomia'].short}`} onPress={() => updateProject(p.id, (cur) => (cur.analysis ? { ...cur, analysis: { ...cur.analysis, genre: { ...cur.analysis.genre!, detected: cur.genre ?? 'gastronomia' } } } : cur))} />
                </View>
              </View>
            ) : null}

            {a.divergent && p.references.length > 1 ? (
              <View style={{ gap: 10 }}>
                <TerryLine text={terry.divergent()} />
                <View style={st.refRow}>
                  {p.references.map((r) => {
                    const sel = p.primaryReferenceId === r.id;
                    const summary = a.perReference.find((x) => x.referenceId === r.id)?.summary;
                    return (
                      <Pressable key={r.id} style={{ flex: 1, gap: 6 }} onPress={() => updateProject(p.id, (cur) => ({ ...cur, primaryReferenceId: r.id }))}>
                        <Thumb uri={r.thumbUri} style={[st.refThumb, sel && { borderColor: C.accent, borderWidth: 2 }]} />
                        <Text numberOfLines={3} style={[T.small, sel && { color: C.accent }]}>{summary ?? r.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : (
              <TerryLine text={a.terryLine} />
            )}

            <View style={{ gap: 8 }}>
              <Text style={T.h3}>Observações</Text>
              <Text style={T.small}>Toque para corrigir. Desmarque o que não combina com você.</Text>
              {a.observations.map((o) => (
                <ObservationRow key={o.id} o={o} onChange={(patch) => editObservation(p.id, o.id, patch)} />
              ))}
              <View style={st.addObs}>
                <TextInput
                  value={newObs}
                  onChangeText={setNewObs}
                  placeholder="Acrescentar algo do seu estilo"
                  placeholderTextColor={C.mute}
                  style={st.addInput}
                  onSubmitEditing={() => {
                    if (newObs.trim()) addObservation(p.id, newObs.trim());
                    setNewObs('');
                  }}
                  returnKeyType="done"
                />
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>
      <Footer>
        <Button
          label="Criar roteiro"
          onPress={next}
          loading={generating}
          disabled={!a || !!progress || (a.divergent && p.references.length > 1 && !p.primaryReferenceId)}
        />
      </Footer>
    </Screen>
  );
}

const st = StyleSheet.create({
  loading: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: C.surface, borderRadius: R.l },
  obs: { flexDirection: 'row', gap: 12, backgroundColor: C.surface, borderRadius: R.m, padding: 12, borderWidth: 1, borderColor: C.border },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.mute, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  obsInput: { color: C.text, fontSize: 15, padding: 0, minHeight: 40 },
  addObs: { backgroundColor: C.surface, borderRadius: R.m, borderWidth: 1, borderColor: C.border, borderStyle: 'dashed' },
  addInput: { color: C.text, fontSize: 15, padding: 12 },
  refRow: { flexDirection: 'row', gap: 10 },
  refThumb: { aspectRatio: 9 / 16, borderRadius: R.m, borderWidth: 2, borderColor: 'transparent' },
});
