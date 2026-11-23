// Simulador no navegador: moldura de celular, painéis e diálogos desenhados dentro da tela.
// No app nativo nada disso é usado (Platform.OS !== 'web').
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { closeDialog, subscribeDialog, type DialogState } from './dialog';
import { TerryMark } from './icons';
import { C, R, T } from './theme';

export const PHONE = { width: 390, height: 844, status: 47, home: 30 };

/** No computador (janela larga) o app aparece dentro de um celular desenhado. */
export function useFrameMode() {
  const { width, height } = useWindowDimensions();
  return Platform.OS === 'web' && width >= 600 && height >= 600;
}

/** Tamanho útil da tela: o do celular desenhado no simulador, o real no aparelho. */
export function useScreen() {
  const win = useWindowDimensions();
  const frame = useFrameMode();
  return frame ? { width: PHONE.width, height: PHONE.height - PHONE.status - PHONE.home } : win;
}

// ---------- portal: painéis renderizados por cima da tela do "celular" ----------

const portals = new Map<string, ReactNode>();
const portalListeners = new Set<() => void>();
let portalSeq = 0;

function setPortal(id: string, node: ReactNode) {
  if (node) portals.set(id, node);
  else portals.delete(id);
  portalListeners.forEach((l) => l());
}

export function usePortal(node: ReactNode) {
  const id = useRef(`portal_${portalSeq++}`).current;
  useLayoutEffect(() => {
    setPortal(id, node);
  });
  useEffect(() => () => setPortal(id, null), [id]);
}

function PortalHost() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    portalListeners.add(l);
    return () => {
      portalListeners.delete(l);
    };
  }, []);
  return (
    <>
      {[...portals.entries()].map(([id, node]) => (
        <View key={id} style={StyleSheet.absoluteFill}>
          {node}
        </View>
      ))}
    </>
  );
}

function DialogHost() {
  const [d, setD] = useState<DialogState>(null);
  useEffect(() => subscribeDialog(setD), []);
  if (!d) return null;
  return (
    <View style={[StyleSheet.absoluteFill, st.dialogBackdrop]}>
      <View style={st.dialog}>
        <Text style={[T.h3, { textAlign: 'center' }]}>{d.title}</Text>
        {d.message ? <Text style={[T.small, { textAlign: 'center' }]}>{d.message}</Text> : null}
        <View style={{ gap: 8, marginTop: 8 }}>
          {d.buttons.map((b, i) => (
            <Pressable
              key={i}
              onPress={() => {
                closeDialog();
                b.onPress?.();
              }}
              style={[st.dialogBtn, b.style !== 'cancel' && i === d.buttons.length - 1 && { backgroundColor: C.accent }]}
            >
              <Text
                style={[
                  st.dialogBtnText,
                  b.style === 'destructive' && { color: C.danger },
                  b.style !== 'cancel' && i === d.buttons.length - 1 && b.style !== 'destructive' && { color: C.accentInk },
                ]}
              >
                {b.text}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

function FakeStatusBar() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return (
    <View style={st.status}>
      <Text style={st.clock}>
        {hh}:{mm}
      </Text>
      <View style={st.island} />
      <View style={st.statusRight}>
        <View style={st.signal}>
          {[5, 7, 9, 11].map((h) => (
            <View key={h} style={{ width: 3, height: h, borderRadius: 1, backgroundColor: C.text }} />
          ))}
        </View>
        <View style={st.battery}>
          <View style={st.batteryFill} />
        </View>
      </View>
    </View>
  );
}

export function PhoneFrame({ children }: { children: ReactNode }) {
  const frame = useFrameMode();
  if (Platform.OS !== 'web') return <>{children}</>;
  if (!frame) {
    return (
      <View style={{ flex: 1 }}>
        {children}
        <PortalHost />
        <DialogHost />
      </View>
    );
  }
  return (
    <View style={st.desk}>
      <View style={st.side}>
        <TerryMark size={40} />
        <Text style={st.sideTitle}>TERRY</Text>
        <Text style={st.sideText}>Simulador no navegador. Clique e arraste como se fosse o dedo.</Text>
        <Text style={st.sideText}>
          Funciona aqui: projetos, referências do computador, análise de ritmo e som, roteiro, tomadas com a Galeria ou o Clipe exemplo, editor, aparar e enquadrar.
        </Text>
        <Text style={st.sideText}>Só no celular: câmera, narração e exportação do MP4.</Text>
      </View>
      <View style={st.phone}>
        <View style={st.screen}>
          <FakeStatusBar />
          <View style={{ flex: 1, overflow: 'hidden' }}>
            {children}
            <PortalHost />
            <DialogHost />
          </View>
          <View style={st.homeArea}>
            <View style={st.homeBar} />
          </View>
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  desk: { flex: 1, backgroundColor: '#0A0A0C', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 56, padding: 24 },
  side: { width: 260, gap: 12 },
  sideTitle: { color: C.text, fontSize: 28, fontWeight: '900', letterSpacing: 3 },
  sideText: { color: C.dim, fontSize: 14, lineHeight: 20 },
  phone: { width: PHONE.width + 24, height: PHONE.height + 24, borderRadius: 64, backgroundColor: '#1C1C20', padding: 12, borderWidth: 1, borderColor: '#33333A' },
  screen: { flex: 1, borderRadius: 52, overflow: 'hidden', backgroundColor: C.bg },
  status: { height: PHONE.status, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 30, paddingTop: 6 },
  clock: { color: C.text, fontSize: 15, fontWeight: '700', width: 60 },
  island: { width: 120, height: 34, borderRadius: 17, backgroundColor: '#000', borderWidth: 1, borderColor: '#111' },
  statusRight: { flexDirection: 'row', alignItems: 'center', gap: 6, width: 60, justifyContent: 'flex-end' },
  signal: { flexDirection: 'row', alignItems: 'flex-end', gap: 1.5 },
  battery: { width: 24, height: 12, borderRadius: 3, borderWidth: 1.2, borderColor: C.dim, padding: 1.5 },
  batteryFill: { flex: 1, width: '80%', borderRadius: 1.5, backgroundColor: C.text },
  homeArea: { height: PHONE.home, alignItems: 'center', justifyContent: 'center' },
  homeBar: { width: 134, height: 5, borderRadius: 3, backgroundColor: C.text },
  dialogBackdrop: { backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  dialog: { width: '100%', backgroundColor: C.surface2, borderRadius: R.l, padding: 18, gap: 8, borderWidth: 1, borderColor: C.border },
  dialogBtn: { height: 44, borderRadius: R.m, backgroundColor: C.surface3, alignItems: 'center', justifyContent: 'center' },
  dialogBtnText: { color: C.text, fontSize: 15, fontWeight: '700' },
});
