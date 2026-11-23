import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { detectGenre, GENRE_INFO, GENRES, type Genre } from '../domain/genres';
import { terry } from '../domain/terry';
import type { AudioMode, TargetDuration } from '../domain/types';
import { createProject } from '../services/flows';
import { Button, Chip, Footer, Screen, TerryLine, TopBar } from '../ui/kit';
import { C, R, T } from '../ui/theme';

const AUDIO: { key: AudioMode; label: string; hint: string }[] = [
  { key: 'fala', label: 'Fala pra câmera', hint: 'Você fala olhando pra lente' },
  { key: 'narracao', label: 'Narração', hint: 'Você grava a voz por cima depois' },
  { key: 'ambiente', label: 'Som ambiente', hint: 'O som do lugar conta a história' },
];

/** Modos de áudio que costumam combinar com cada gênero (o criador muda se quiser). */
const AUDIO_DEFAULT: Record<Genre, AudioMode[]> = {
  gastronomia: ['fala', 'ambiente'],
  beleza: ['fala'],
  review: ['fala'],
  marketing: ['fala', 'ambiente'],
  opiniao: ['fala'],
  tutorial: ['fala'],
  vlog: ['fala', 'ambiente'],
  fitness: ['fala', 'ambiente'],
  humor: ['fala'],
  outro: ['fala', 'ambiente'],
};

export default function NewProject() {
  const [brief, setBrief] = useState('');
  const [picked, setPicked] = useState<Genre | null>(null);
  const [duration, setDuration] = useState<TargetDuration>(30);
  const [modes, setModes] = useState<AudioMode[] | null>(null);

  const detected = useMemo(() => detectGenre(brief), [brief]);
  const genre: Genre = picked ?? (brief.trim().length > 12 ? detected.genre : 'outro');
  const audio = modes ?? AUDIO_DEFAULT[genre];

  const toggle = (m: AudioMode) => setModes(audio.includes(m) ? (audio.length > 1 ? audio.filter((x) => x !== m) : audio) : [...audio, m]);

  const start = () => {
    const p = createProject({ brief, genre, targetDuration: duration, audioModes: audio });
    router.replace(`/p/${p.id}/refs`);
  };

  const suggestion =
    !picked && brief.trim().length > 12 && detected.confident ? `Parece ${GENRE_INFO[detected.genre].label.toLowerCase()}. Se não for, troca ali embaixo.` : null;

  return (
    <Screen>
      <TopBar title="Novo projeto" step="1 de 3" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 22 }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 10 }}>
            <Text style={T.h1}>{terry.briefPrompt()}</Text>
            <TextInput
              value={brief}
              onChangeText={setBrief}
              placeholder={`Ex.: ${GENRE_INFO[genre].example}`}
              placeholderTextColor={C.mute}
              multiline
              style={st.input}
              autoFocus
            />
            <Text style={T.small}>Assunto, preço, lugar e dados saem daqui. Nada é copiado das referências.</Text>
          </View>

          <TerryLine text={suggestion} />

          <View style={{ gap: 10 }}>
            <Text style={T.h3}>Tipo de vídeo</Text>
            <View style={st.wrap}>
              {GENRES.map((g) => (
                <Chip key={g} label={GENRE_INFO[g].label} selected={genre === g} onPress={() => setPicked(g)} />
              ))}
            </View>
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
            <View style={{ gap: 8 }}>
              {AUDIO.map((a) => (
                <View key={a.key} style={st.audioRow}>
                  <Chip label={a.label} selected={audio.includes(a.key)} onPress={() => toggle(a.key)} />
                  <Text style={[T.small, { flex: 1 }]}>{a.hint}</Text>
                </View>
              ))}
            </View>
          </View>

          <Text style={T.small}>Sem cadastro. O rascunho fica salvo aqui no celular.</Text>
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
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  audioRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
