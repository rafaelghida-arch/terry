import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { terry } from '../domain/terry';
import type { AudioMode, TargetDuration } from '../domain/types';
import { createProject } from '../services/flows';
import { Button, Chip, Footer, Screen, TerryLine, TopBar } from '../ui/kit';
import { C, R, T } from '../ui/theme';

const AUDIO: { key: AudioMode; label: string; hint: string }[] = [
  { key: 'fala', label: 'Fala pra câmera', hint: 'Você fala olhando pra lente' },
  { key: 'narracao', label: 'Narração', hint: 'Você grava a voz por cima depois' },
  { key: 'ambiente', label: 'Som ambiente', hint: 'Chapa, mesa, rua' },
];

export default function NewProject() {
  const [brief, setBrief] = useState('');
  const [duration, setDuration] = useState<TargetDuration>(30);
  const [modes, setModes] = useState<AudioMode[]>(['fala', 'ambiente']);

  const toggle = (m: AudioMode) => setModes((cur) => (cur.includes(m) ? (cur.length > 1 ? cur.filter((x) => x !== m) : cur) : [...cur, m]));

  const start = () => {
    const p = createProject({ brief, targetDuration: duration, audioModes: modes });
    router.replace(`/p/${p.id}/refs`);
  };

  return (
    <Screen>
      <TopBar title="Novo projeto" step="1 de 4" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 22 }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 10 }}>
            <Text style={T.h1}>{terry.briefPrompt()}</Text>
            <TextInput
              value={brief}
              onChangeText={setBrief}
              placeholder="Ex.: Vou provar um xis de costela de R$ 38 em Porto Alegre. Quero mostrar o tamanho e contar se compraria de novo."
              placeholderTextColor={C.mute}
              multiline
              style={st.input}
              autoFocus
            />
            <Text style={T.small}>Preço, lugar e prato saem daqui. Nada é copiado das referências.</Text>
          </View>

          <View style={{ gap: 10 }}>
            <Text style={T.h3}>Duração aproximada</Text>
            <View style={st.row}>
              {([15, 30, 60] as TargetDuration[]).map((d) => (
                <Chip key={d} label={`${d} s`} selected={duration === d} onPress={() => setDuration(d)} />
              ))}
            </View>
          </View>

          <View style={{ gap: 10 }}>
            <Text style={T.h3}>Áudio</Text>
            <Text style={T.small}>Pode combinar.</Text>
            <View style={{ gap: 8 }}>
              {AUDIO.map((a) => (
                <View key={a.key} style={st.audioRow}>
                  <Chip label={a.label} selected={modes.includes(a.key)} onPress={() => toggle(a.key)} />
                  <Text style={[T.small, { flex: 1 }]}>{a.hint}</Text>
                </View>
              ))}
            </View>
          </View>

          <TerryLine text="Sem cadastro. O rascunho fica salvo aqui no celular." />
        </ScrollView>
        <Footer>
          <Button label="Continuar" onPress={start} disabled={brief.trim().length < 8} />
        </Footer>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const st = StyleSheet.create({
  input: {
    minHeight: 120,
    backgroundColor: C.surface,
    borderRadius: R.l,
    borderWidth: 1,
    borderColor: C.border,
    color: C.text,
    fontSize: 16,
    padding: 14,
    textAlignVertical: 'top',
  },
  row: { flexDirection: 'row', gap: 8 },
  audioRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
