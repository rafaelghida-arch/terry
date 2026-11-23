import { router } from 'expo-router';
import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, TerryMark } from './icons';
import { usePortal } from './simulator';
import { C, R, T } from './theme';

export function Screen({ children, edges = ['top', 'bottom'] }: { children: ReactNode; edges?: ('top' | 'bottom')[] }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={edges}>
      {children}
    </SafeAreaView>
  );
}

export function TopBar({ title, onBack, right, step }: { title?: string; onBack?: () => void; right?: ReactNode; step?: string }) {
  return (
    <View style={s.topbar}>
      <Pressable hitSlop={12} onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))} style={s.iconBtn} accessibilityLabel="Voltar">
        <Icon.Back />
      </Pressable>
      <View style={{ flex: 1, alignItems: 'center' }}>
        {title ? <Text numberOfLines={1} style={s.topTitle}>{title}</Text> : null}
        {step ? <Text style={T.tiny}>{step}</Text> : null}
      </View>
      <View style={{ minWidth: 40, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

type BtnProps = {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
};

export function Button({ label, onPress, kind = 'primary', icon, disabled, loading, style, small }: BtnProps) {
  const bg = kind === 'primary' ? C.accent : kind === 'secondary' ? C.surface3 : 'transparent';
  const fg = kind === 'primary' ? C.accentInk : kind === 'danger' ? C.danger : C.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.btn,
        small && s.btnSmall,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
        kind === 'ghost' && { borderWidth: 1, borderColor: C.border },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon}
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[s.btnText, small && { fontSize: 14 }, { color: fg }, { flexShrink: 1 }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, selected && { borderColor: C.accent, backgroundColor: '#0B2A2E' }]}>
      <Text style={[s.chipText, selected && { color: C.accent }]}>{label}</Text>
    </Pressable>
  );
}

/** Fala do TERRY: uma frase, com a marca. Aparece só quando há algo concreto. */
export function TerryLine({ text, style }: { text?: string | null; style?: StyleProp<ViewStyle> }) {
  if (!text) return null;
  return (
    <View style={[s.terry, style]}>
      <TerryMark size={26} />
      <Text style={s.terryText}>{text}</Text>
    </View>
  );
}

export function ToolButton({ label, icon, onPress, active, disabled }: { label: string; icon: ReactNode; onPress: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [s.tool, { opacity: disabled ? 0.35 : pressed ? 0.6 : 1 }]}>
      {icon}
      <Text style={[s.toolText, active && { color: C.accent }]}>{label}</Text>
    </Pressable>
  );
}

export function Sheet(props: { visible: boolean; onClose: () => void; title: string; children: ReactNode; action?: ReactNode }) {
  if (Platform.OS === 'web') return <WebSheet {...props} />;
  return (
    <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onClose}>
      <SheetBody {...props} />
    </Modal>
  );
}

/** No simulador o painel sobe dentro da tela do celular desenhado. */
function WebSheet(props: { visible: boolean; onClose: () => void; title: string; children: ReactNode; action?: ReactNode }) {
  usePortal(props.visible ? <SheetBody {...props} /> : null);
  return null;
}

function SheetBody({ onClose, title, children, action }: { onClose: () => void; title: string; children: ReactNode; action?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={s.grabber} />
        <View style={s.sheetHead}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Icon.Close size={20} />
          </Pressable>
          <Text style={T.h3}>{title}</Text>
          <View style={{ minWidth: 20 }}>{action}</View>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 520 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          {children}
        </ScrollView>
      </View>
    </>
  );
}

export function ProgressBar({ value, height = 4 }: { value: number; height?: number }) {
  return (
    <View style={{ height, backgroundColor: C.surface3, borderRadius: height, overflow: 'hidden' }}>
      <View style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`, height, backgroundColor: C.accent }} />
    </View>
  );
}

export function Thumb({ uri, style, children }: { uri?: string; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  return (
    <View style={[{ backgroundColor: C.surface2, overflow: 'hidden' }, style]}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
      {children}
    </View>
  );
}

export function Badge({ label, tone = 'mute' }: { label: string; tone?: 'mute' | 'accent' | 'warn' }) {
  const color = tone === 'accent' ? C.accent : tone === 'warn' ? '#FFB020' : C.dim;
  return (
    <View style={[s.badge, { borderColor: color }]}>
      <Text style={[s.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

export function Footer({ children }: { children: ReactNode }) {
  return <View style={s.footer}>{children}</View>;
}

export const s = StyleSheet.create({
  topbar: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topTitle: { ...T.h3, fontSize: 16 },
  btn: { height: 50, borderRadius: R.m, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18 },
  btnSmall: { height: 38, paddingHorizontal: 12, borderRadius: R.s },
  btnText: { fontSize: 16, fontWeight: '700' },
  chip: { paddingHorizontal: 14, height: 38, borderRadius: 19, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2, justifyContent: 'center' },
  chipText: { color: C.text, fontSize: 14, fontWeight: '600' },
  terry: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: C.surface, borderRadius: R.l, padding: 12, borderWidth: 1, borderColor: C.border },
  terryText: { ...T.body, flex: 1, paddingTop: 2 },
  tool: { alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: 64, paddingVertical: 6 },
  toolText: { color: C.dim, fontSize: 11, fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, borderTopWidth: 1, borderColor: C.border },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.surface3, marginTop: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  badge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, alignSelf: 'flex-start' },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  footer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6, borderTopWidth: StyleSheet.hairlineWidth, borderColor: C.border, backgroundColor: C.bg, gap: 10 },
});
