// Landing screen for the link inside a QR code: campusnav://qr/<CODE>.
//
// Opens when a student scans the code with the phone's own camera (if the
// phone offers to open it in the app) or taps the link. It does the same
// thing as scanning inside the app: sets the starting point, then goes home.

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';

import { COLORS, FONT_SIZE, SPACING, TOUCH } from '@/constants/theme';
import { t } from '@/i18n';
import { startFromQr } from '@/services/qr';

export default function QrLanding() {
  const { code } = useLocalSearchParams();
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await startFromQr(String(code || ''));
        if (!cancelled) router.replace('/');
      } catch (e) {
        if (cancelled) return;
        setError(
          e.reason === 'unknown'
            ? t('qr.errorUnknown')
            : e.reason === 'invalid'
              ? t('qr.errorInvalid')
              : t('qr.errorNetwork')
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('qr.title') }} />
      {error ? (
        <>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity
            style={styles.primary}
            onPress={() => router.replace('/scan')}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>{t('qr.scanAgain')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondary}
            onPress={() => router.replace('/')}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryText}>{t('qr.goHome')}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.status}>{t('qr.finding')}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  status: {
    marginTop: SPACING.md,
    color: COLORS.text,
    fontSize: FONT_SIZE.body,
  },
  error: {
    color: COLORS.danger,
    fontSize: FONT_SIZE.large,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  primary: {
    minHeight: TOUCH.minHeight,
    minWidth: 200,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  primaryText: {
    color: COLORS.headerText,
    fontSize: FONT_SIZE.body,
    fontWeight: '600',
  },
  secondary: {
    minHeight: TOUCH.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.sm,
  },
  secondaryText: { color: COLORS.primary, fontSize: FONT_SIZE.body },
});
