import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { terry } from '../../../domain/terry';
import { formatDuration } from '../../../domain/timeline';
import { chooseHook, generateScript } from '../../../services/flows';
import { useProject } from '../../../state/store';
import { Icon } from '../../../ui/icons';
import { Badge, Button, Footer, Screen, TerryLine, TopBar } from '../../../ui/kit';
import { C, R, T } from '../../../ui/theme';

export default function Hooks() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const p = useProject(id);
  const [selected, setSelected] = useState<string | undefined>(p?.chosenHookId);
  const [regen, setRegen] = useState(false);
  if (!p) return null;
  const hooks = p.hooks ?? [];
  const aiScript = p.analysis?.source === 'ia';

  const go = () => {
    if (!selected) return;
    if (selected !== p.chosenHookId || !p.scenes.length) chooseHook(p.id, selected);
    router.push(`/p/${p.id}/script`);
  };

  return (
    <Screen>
      <TopBar title="Gancho" step="4 de 4" onBack={() => (p.isDemo ? router.replace('/') : router.back())} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        {p.isDemo ? <Badge label="PROJETO DE DEMONSTRAÇÃO" tone="accent" /> : null}
        <Text style={T.h1}>Como você quer abrir?</Text>
        <TerryLine text={terry.hookChoice(p)} />
        {!aiScript ? (
          <Text style={T.small}>
            {p.isDemo ? 'Roteiro de exemplo gerado no aparelho.' : 'Roteiro base montado no aparelho, sem IA. Ajusta à vontade antes de gravar.'}
          </Text>
        ) : null}

        {hooks.map((h, i) => {
          const sel = selected === h.id;
          const total = h.scenes.reduce((a, s) => a + s.duration, 0);
          const first = h.scenes[0];
          return (
            <Pressable key={h.id} onPress={() => setSelected(h.id)} style={[st.card, sel && st.cardSel]}>
              <View style={st.cardHead}>
                <Text style={[T.tiny, sel && { color: C.accent }]}>OPÇÃO {i + 1}</Text>
                <View style={[st.radio, sel && { borderColor: C.accent }]}>{sel ? <View style={st.radioDot} /> : null}</View>
              </View>
              <Text style={T.h2}>{h.title}</Text>
              <Text style={T.small}>{h.approach}</Text>
              {first ? (
                <View style={st.first}>
                  <Icon.Camera size={18} color={C.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={[T.tiny, { marginBottom: 2 }]}>PRIMEIRA TOMADA</Text>
                    <Text style={T.body}>{first.instruction}</Text>
                    {first.line ? <Text style={[T.small, { marginTop: 4 }]}>“{first.line}”</Text> : null}
                  </View>
                </View>
              ) : null}
              <Text style={T.tiny}>
                {h.scenes.length} TOMADAS · ~{formatDuration(total)} · {h.why.toUpperCase()}
              </Text>
            </Pressable>
          );
        })}

        {!p.isDemo ? (
          <Button
            kind="ghost"
            small
            label="Gerar outras opções"
            icon={<Icon.Refresh size={16} />}
            loading={regen}
            onPress={async () => {
              setRegen(true);
              try {
                await generateScript(p.id);
                setSelected(undefined);
              } finally {
                setRegen(false);
              }
            }}
          />
        ) : null}
      </ScrollView>
      <Footer>
        <Button label="Usar esse gancho" onPress={go} disabled={!selected} />
      </Footer>
    </Screen>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: C.surface, borderRadius: R.l, padding: 14, gap: 8, borderWidth: 1.5, borderColor: C.border },
  cardSel: { borderColor: C.accent },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: C.mute, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.accent },
  first: { flexDirection: 'row', gap: 10, backgroundColor: C.surface2, borderRadius: R.m, padding: 10 },
});
