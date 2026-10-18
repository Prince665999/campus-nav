// Root layout for Expo Router.

import { useEffect } from 'react';
import { Link, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { SettingsProvider, useSettings } from '@/context/SettingsContext';
import { COLORS, TOUCH } from '@/constants/theme';
import { ICONS } from '@/constants/icons';
import * as haptics from '@/services/haptics';

function SettingsButton() {
  return (
    <Link href="/settings" asChild>
      <TouchableOpacity
        style={{
          paddingHorizontal: 12,
          paddingVertical: 4,
          minHeight: TOUCH.minHeight,
          justifyContent: 'center',
        }}
        accessibilityRole="button"
        accessibilityLabel="Settings"
      >
        <MaterialIcons name={ICONS.settings} size={22} color={COLORS.headerText} />
      </TouchableOpacity>
    </Link>
  );
}

function AppStack() {
  const { settings } = useSettings();

  useEffect(() => {
    haptics.setEnabled(settings.hapticsEnabled);
  }, [settings.hapticsEnabled]);

  return (
    <Stack
      key={settings.language}
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.headerBackground },
        headerTintColor: COLORS.headerText,
        headerTitleStyle: { fontWeight: '600', color: COLORS.headerText },
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
      <Stack.Screen name="building-rooms" options={{ title: 'Rooms' }} />
      <Stack.Screen name="route-preview" options={{ title: 'Route' }} />
      <Stack.Screen name="walking" options={{ title: 'Walking' }} />
      <Stack.Screen name="arrival" options={{ title: 'Arrival' }} />
      <Stack.Screen name="chat" options={{ title: 'Chat' }} />
      <Stack.Screen name="explore" options={{ title: 'Explore' }} />
      <Stack.Screen name="timetable" options={{ title: 'Timetable' }} />
      <Stack.Screen
        name="onboarding"
        options={{
          headerShown: false,
          animation: 'fade',
        }}
      />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <StatusBar style="light" />
        <AppStack />
      </SettingsProvider>
    </SafeAreaProvider>
  );
}

