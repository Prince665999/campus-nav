// Root layout for Expo Router.

import { Link, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text, TouchableOpacity } from 'react-native';

import { SettingsProvider, useSettings } from '@/context/SettingsContext';
import { COLORS } from '@/constants/theme';

function SettingsButton() {
  return (
    <Link href="/settings" asChild>
      <TouchableOpacity
        style={{ paddingHorizontal: 12, paddingVertical: 4 }}
        accessibilityRole="button"
        accessibilityLabel="Settings"
      >
        <Text style={{ fontSize: 20 }}>⚙️</Text>
      </TouchableOpacity>
    </Link>
  );
}

function AppStack() {
  const { settings } = useSettings();

  return (
    <Stack
      key={settings.language}
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.background },
        headerTintColor: COLORS.text,
        headerTitleStyle: { fontWeight: '600' },
        contentStyle: { backgroundColor: COLORS.backgroundSubtle },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Campus Navigation',
          headerRight: () => <SettingsButton />,
        }}
      />
      <Stack.Screen name="place/[id]" options={{ title: 'Place' }} />
      <Stack.Screen name="route-preview" options={{ title: 'Route' }} />
      <Stack.Screen name="walking" options={{ title: 'Walking' }} />
      <Stack.Screen name="arrival" options={{ title: 'Arrival' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <StatusBar style="auto" />
        <AppStack />
      </SettingsProvider>
    </SafeAreaProvider>
  );
}