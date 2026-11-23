// Diálogos: Alert nativo no celular; no simulador, um diálogo desenhado dentro da moldura.
import { Alert, Platform } from 'react-native';

export type DialogButton = { text: string; style?: 'cancel' | 'destructive' | 'default'; onPress?: () => void };
export type DialogState = { title: string; message?: string; buttons: DialogButton[] } | null;

let current: DialogState = null;
const listeners = new Set<(d: DialogState) => void>();

export function subscribeDialog(l: (d: DialogState) => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function closeDialog() {
  current = null;
  listeners.forEach((l) => l(current));
}

export function showDialog(title: string, message?: string, buttons: DialogButton[] = [{ text: 'OK' }]) {
  if (Platform.OS !== 'web') {
    showDialog(title, message, buttons);
    return;
  }
  current = { title, message, buttons };
  listeners.forEach((l) => l(current));
}
