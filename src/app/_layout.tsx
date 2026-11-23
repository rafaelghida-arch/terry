import { SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold, useFonts } from '@expo-google-fonts/space-grotesk';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PhoneFrame } from '../ui/simulator';
import { C } from '../ui/theme';

export default function RootLayout() {
  // Fonte de títulos; enquanto carrega, o app já aparece com a fonte do sistema.
  useFonts({ SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold });
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <PhoneFrame>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: 'fade' }}>
        <Stack.Screen name="p/[id]/record" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
      </Stack>
      </PhoneFrame>
    </SafeAreaProvider>
  );
}
