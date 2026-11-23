import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { publishText, type PublishIdea } from '../domain/publish';
import { publishIdea } from '../services/flows';
import { Icon } from './icons';
import { Badge } from './kit';
import { C, R, T } from './theme';

/** "Pra postar": 3 hashtags do nicho, título, descrição e a trilha que combina — tudo copiável. */
export function PublishCard({ projectId }: { projectId: string }) {
  const [idea, setIdea] = useState<PublishIdea | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    publishIdea(projectId).then(setIdea);
  }, [projectId]);

  const copy = async (key: string, text: string) => {
    await Clipboard.setStringAsync(text);
    setCopied(key);
    setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500);
  };

  if (!idea) {
    return (
      <View style={[st.card, { alignItems: 'center' }]}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  return (
    <View style={st.card}>
      <View style={st.head}>
        <Text style={T.h3}>Pra postar</Text>
        {idea.source === 'ia' ? <Badge label="IA" tone="accent" /> : null}
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => copy('tudo', publishText(idea))} hitSlop={8} style={st.copyAll}>
          <Text style={st.copyText}>{copied === 'tudo' ? 'Copiado' : 'Copiar tudo'}</Text>
        </Pressable>
      </View>

      <View style={st.tags}>
        {idea.hashtags.map((h) => (
          <Pressable key={h} onPress={() => copy(h, h)} style={[st.tag, copied === h && { borderColor: C.accent }]}>
            <Text style={st.tagText}>{h}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable onPress={() => copy('titulo', idea.title)} style={{ gap: 2 }}>
        <Text style={T.tiny}>TÍTULO {copied === 'titulo' ? '· COPIADO' : ''}</Text>
        <Text style={T.body}>{idea.title}</Text>
      </Pressable>
      <Pressable onPress={() => copy('desc', idea.description)} style={{ gap: 2 }}>
        <Text style={T.tiny}>DESCRIÇÃO {copied === 'desc' ? '· COPIADO' : ''}</Text>
        <Text style={T.body}>{idea.description}</Text>
      </Pressable>

      <View style={st.sound}>
        <Icon.Audio size={18} color={C.accent} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={T.tiny}>TRILHA PRA ESSE NICHO</Text>
          <Text style={T.body}>{idea.sound.kind}</Text>
          <Text style={T.small}>
            Busca por “{idea.sound.search}” nos sons do TikTok ou do Instagram. {idea.sound.why}
          </Text>
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: C.surface, borderRadius: R.l, padding: 14, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  copyAll: { paddingHorizontal: 12, height: 30, borderRadius: R.pill, backgroundColor: C.accentSoft, justifyContent: 'center' },
  copyText: { color: C.accent, fontSize: 12, fontWeight: '800' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { paddingHorizontal: 12, height: 32, borderRadius: R.pill, backgroundColor: C.surface2, borderWidth: 1, borderColor: 'transparent', justifyContent: 'center' },
  tagText: { color: C.text, fontSize: 14, fontWeight: '700' },
  sound: { flexDirection: 'row', gap: 10, backgroundColor: C.surface2, borderRadius: R.m, padding: 12 },
});
