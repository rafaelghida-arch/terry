import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PhoneFrame } from '../ui/simulator';
import { C } from '../ui/theme';

export default function RootLayout() {
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
