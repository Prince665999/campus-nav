// The Wi-Fi proximity banner.
//
// Shows when the student is near a mapped Wi-Fi spot. One primary
// button — Connect — that does the best the phone allows: native
// suggestion where supported, clipboard copy otherwise.

import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { connectToNetwork, messageForResult, CONNECT_RESULTS } from '@/services/wifi';
import { t } from '@/i18n';
import { COLORS, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';

export function WifiBanner({ spot, onDismiss }) {
  const [working, setWorking] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const handleConnect = useCallback(async () => {
    setWorking(true);
    setFeedback(null);
    try {
      const result = await connectToNetwork(spot);
      const message = messageForResult(result, spot.ssid || spot.name);

      // If we handed off to a system prompt, close the banner. The
      // system is now in charge.
      if (result === CONNECT_RESULTS.SUGGESTED) {
        onDismiss();
        return;
      }

      setFeedback(message);
    } finally {
      setWorking(false);
    }
  }, [spot, onDismiss]);

  if (!spot) return null;

  const title = spot.ssid ? t('wifi.availableNamed', { ssid: spot.ssid }) : t('wifi.available');

  return (
    <View style={styles.banner}>
      <View style={styles.iconBox}>
        <Text style={styles.icon}>📶</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {feedback ? (
          <Text style={styles.feedback} numberOfLines={3}>
            {feedback}
          </Text>
        ) : (
          <Text style={styles.subtitle} numberOfLines={1}>
            {spot.name} · {Math.round(spot.distance_m)} m
          </Text>
        )}
      </View>

      <TouchableOpacity
        style={styles.connectButton}
        onPress={handleConnect}
        disabled={working}
        accessibilityRole="button"
        accessibilityLabel={t('wifi.connect')}
      >
        {working ? (
          <ActivityIndicator color="#ffffff" size="small" />
        ) : (
          <Text style={styles.connectText}>{t('wifi.connect')}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onDismiss}
        style={styles.dismissButton}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
      >
        <Text style={styles.dismissText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0f2fe',
    borderBottomWidth: 1,
    borderBottomColor: '#7dd3fc',
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    gap: 12,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 16 },
  body: { flex: 1 },
  title: { fontSize: 14, fontWeight: '600', color: '#0c4a6e' },
  subtitle: { fontSize: 12, color: '#075985', marginTop: 1 },
  feedback: { fontSize: 12, color: '#075985', marginTop: 1, lineHeight: 16 },
  connectButton: {
    backgroundColor: '#0369a1',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    minWidth: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  dismissButton: { padding: 4 },
  dismissText: { color: '#0c4a6e', fontSize: 16, fontWeight: '600' },
});