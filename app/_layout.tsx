import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

// 自定义主题
const CustomLightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#FF6B35',
    background: '#FFFBF5',
    card: '#FFFFFF',
    text: '#1F2937',
    border: '#FED7AA',
  },
};

const CustomDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: '#FF8F6B',
    background: '#1F1B24',
    card: '#2D2635',
    text: '#F9FAFB',
    border: '#4C3D5C',
  },
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? CustomDarkTheme : CustomLightTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen 
          name="cartoon/[id]" 
          options={{ 
            presentation: 'card',
            animation: 'slide_from_right',
          }} 
        />
        <Stack.Screen 
          name="season/[id]" 
          options={{ 
            presentation: 'card',
            animation: 'slide_from_right',
          }} 
        />
        <Stack.Screen 
          name="episode/[id]" 
          options={{ 
            presentation: 'card',
            animation: 'slide_from_right',
          }} 
        />
        <Stack.Screen 
          name="dubbing/[id]" 
          options={{ 
            presentation: 'card',
            animation: 'slide_from_bottom',
          }} 
        />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
