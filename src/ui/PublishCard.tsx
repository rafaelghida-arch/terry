import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PublishIdea } from '../domain/publish';
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
      </View>

      <CopyField label="TÍTULO" text={idea.title} copied={copied === 'titulo'} onCopy={() => copy('titulo', idea.title)} />
      <CopyField label="DESCRIÇÃO" text={idea.description} copied={copied === 'desc'} onCopy={() => copy('desc', idea.description)} />

      <View style={st.reco}>
        <Text style={T.tiny}>HASHTAGS RECOMENDADAS</Text>
        <Text style={st.hashtags}>{idea.hashtags.join('   ')}</Text>
        <Text style={T.small}>Sugestão do TERRY: as mais usadas nesse nicho. Use se fizer sentido pro seu vídeo.</Text>
      </View>

      <View style={st.reco}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon.Audio size={16} color={C.dim} />
          <Text style={T.tiny}>TRILHA RECOMENDADA</Text>
        </View>
        <Text style={T.body}>{idea.sound.kind}</Text>
        <Text style={T.small}>
          Recomendação pra quando for publicar: procura por “{idea.sound.search}” nos sons do TikTok ou do Instagram. {idea.sound.why}
        </Text>
      </View>
    </View>
  );
}

function CopyField({ label, text, copied, onCopy }: { label: string; text: string; copied: boolean; onCopy: () => void }) {
  return (
    <View style={st.field}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={T.tiny}>{label}</Text>
        <Text style={T.body}>{text}</Text>
      </View>
      <Pressable onPress={onCopy} hitSlop={8} style={[st.copy, copied && { backgroundColor: C.accent }]} accessibilityLabel={`Copiar ${label.toLowerCase()}`}>
        <Text style={[st.copyText, copied && { color: C.accentInk }]}>{copied ? 'Copiado' : 'Copiar'}</Text>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: C.surface, borderRadius: R.l, padding: 14, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface2, borderRadius: R.m, padding: 12 },
  copy: { paddingHorizontal: 14, height: 34, borderRadius: R.pill, backgroundColor: C.accentSoft, justifyContent: 'center' },
  copyText: { color: C.accent, fontSize: 13, fontWeight: '800' },
  reco: { gap: 4, borderRadius: R.m, borderWidth: 1, borderColor: C.border, borderStyle: 'dashed', padding: 12 },
  hashtags: { color: C.dim, fontSize: 15, fontWeight: '700' },
});
