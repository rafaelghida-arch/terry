// Trilhas do TERRY: três faixas originais, compostas e sintetizadas para o app (sem direitos de terceiros),
// mais a opção de usar uma música do próprio celular.
import { Asset } from 'expo-asset';

export type Track = { id: string; title: string; mood: string; uri: string };

const MODULES: Record<string, number> = {
  'batida-leve': require('../../assets/music/batida-leve.m4a'),
  pulso: require('../../assets/music/pulso.m4a'),
  calmo: require('../../assets/music/calmo.m4a'),
};

export const TRACKS: Track[] = [
  { id: 'batida-leve', title: 'Batida leve', mood: 'Lo-fi, pra fala por cima', uri: '' },
  { id: 'pulso', title: 'Pulso', mood: 'Mais ritmo, cortes rápidos', uri: '' },
  { id: 'calmo', title: 'Calmo', mood: 'Sem bateria, clima de vlog', uri: '' },
];

/** Endereço tocável da trilha (as embutidas são extraídas do app na primeira vez). */
export async function resolveMusicUri(m?: { id: string; uri: string }): Promise<string | undefined> {
  if (!m) return undefined;
  const mod = MODULES[m.id];
  if (!mod) return m.uri || undefined;
  const a = await Asset.fromModule(mod).downloadAsync();
  return a.localUri ?? a.uri;
}
