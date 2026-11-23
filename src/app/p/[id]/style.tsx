// Etapa automática: assiste às inspirações, tira a média do estilo, cria o roteiro e abre os ganchos.
// Não pergunta nada: quem manda são os vídeos de inspiração.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { analysisIsCurrent } from '../../../domain/style';
import { generateScript, runAnalysis } from '../../../services/flows';
import { NativeMissingError } from '../../../services/media';
import { getProject, useProject } from '../../../state/store';
import { TerryMark } from '../../../ui/icons';
import { Button, Footer, Screen, TerryLine, TopBar } from '../../../ui/kit';
import { C, T } from '../../../ui/theme';

export default function Preparing() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const p = useProject(id);
  const [step, setStep] = useState('Assistindo suas inspirações…');
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const run = async () => {
    if (!id) return;
    setError(null);
    try {
      const cur = getProject(id)!;
      if (!analysisIsCurrent(cur.analysis, cur.references)) await runAnalysis(id, setStep, true);
      setStep('Montando o roteiro no ritmo delas…');
      await generateScript(id);
      router.replace(`/p/${id}/hooks`);
    } catch (e) {
      setError(e instanceof NativeMissingError ? e.message : 'Não consegui ler uma das inspirações. Confere se o vídeo abre na galeria e tenta de novo.');
    }
  };

  useEffect(() => {
    if (started.current || !p) return;
    started.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id]);

  if (!p) return null;

  return (
    <Screen>
      <TopBar title="Preparando" onBack={() => router.replace(`/p/${p.id}/refs`)} />
      <View style={st.body}>
        {error ? (
          <TerryLine text={error} />
        ) : (
          <View style={st.center}>
            <TerryMark size={56} />
            <ActivityIndicator color={C.accent} />
            <Text style={[T.body, { textAlign: 'center' }]}>{step}</Text>
            <Text style={[T.small, { textAlign: 'center' }]}>
              Vou tirar a média de {p.references.length > 1 ? `das ${p.references.length} inspirações` : 'da inspiração'}: ritmo, abertura, onde tem fala e como termina.
            </Text>
          </View>
        )}
      </View>
      {error ? (
        <Footer>
          <Button label="Tentar de novo" onPress={run} />
        </Footer>
      ) : null}
    </Screen>
  );
}

const st = StyleSheet.create({
  body: { flex: 1, padding: 24, justifyContent: 'center' },
  center: { alignItems: 'center', gap: 18 },
});
