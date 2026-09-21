// Settings screen.
//
// Language, voice, units, and Wi-Fi notification preferences.

import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

import { useSettings } from '@/context/SettingsContext';
import { COLORS, FONT_SIZE, SPACING } from '@/constants/theme';

export default function SettingsScreen() {
  const { settings, updateSetting } = useSettings();

  return (
    <View style={styles.container}>
      <Section title="Voice">
        <Row
          label="Speak instructions"
          description="Read each turn aloud as you reach it."
        >
          <Switch
            value={settings.voiceEnabled}
            onValueChange={(v) => updateSetting('voiceEnabled', v)}
          />
        </Row>
      </Section>

      <Section title="Units">
        <View style={styles.segmented}>
          <SegmentButton
            label="Metric"
            active={settings.units === 'metric'}
            onPress={() => updateSetting('units', 'metric')}
          />
          <SegmentButton
            label="Imperial"
            active={settings.units === 'imperial'}
            onPress={() => updateSetting('units', 'imperial')}
          />
        </View>
      </Section>

      <Section title="Wi-Fi">
        <Row
          label="Wi-Fi notifications"
          description="Show a banner when you're near a mapped Wi-Fi spot."
        >
          <Switch
            value={settings.wifiProximityEnabled}
            onValueChange={(v) => updateSetting('wifiProximityEnabled', v)}
          />
        </Row>
      </Section>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Campus Navigation v0.7.0</Text>
      </View>
    </View>
  );
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, description, children }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {description ? (
          <Text style={styles.rowDescription}>{description}</Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function SegmentButton({ label, active, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.segment, active && styles.segmentActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundSubtle },
  section: {
    backgroundColor: COLORS.background,
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.small,
    color: COLORS.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
  },
  rowText: { flex: 1, paddingRight: SPACING.md },
  rowLabel: { fontSize: FONT_SIZE.body, color: COLORS.text },
  rowDescription: {
    fontSize: FONT_SIZE.small,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: COLORS.borderSubtle,
    borderRadius: 10,
    padding: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentActive: { backgroundColor: COLORS.background },
  segmentText: { fontSize: FONT_SIZE.body, color: COLORS.textMuted },
  segmentTextActive: { color: COLORS.text, fontWeight: '600' },
  footer: { alignItems: 'center', padding: SPACING.xl },
  footerText: { color: COLORS.textFaint, fontSize: FONT_SIZE.small },
});