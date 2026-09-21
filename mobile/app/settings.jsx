// Settings screen.
//
// Language, voice, units, and Wi-Fi notification preferences.

import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

import { useSettings } from '@/context/SettingsContext';
import { AVAILABLE_LANGUAGES, t } from '@/i18n';
import { COLORS, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';

export default function SettingsScreen() {
  const { settings, updateSetting } = useSettings();

  return (
    <View style={styles.container}>
      <Section title={t('settings.language')}>
        <View style={styles.segmented}>
          {AVAILABLE_LANGUAGES.map((lang) => (
            <SegmentButton
              key={lang.code}
              label={lang.label}
              active={settings.language === lang.code}
              onPress={() => updateSetting('language', lang.code)}
            />
          ))}
        </View>
        <Text style={styles.hint}>{t('settings.languageDescription')}</Text>
      </Section>

      <Section title={t('settings.voice')}>
        <Row
          label={t('settings.speakInstructions')}
          description={t('settings.voiceDescription')}
        >
          <Switch
            value={settings.voiceEnabled}
            onValueChange={(v) => updateSetting('voiceEnabled', v)}
          />
        </Row>
      </Section>

      <Section title={t('settings.units')}>
        <View style={styles.segmented}>
          <SegmentButton
            label={t('settings.unitsMetric')}
            active={settings.units === 'metric'}
            onPress={() => updateSetting('units', 'metric')}
          />
          <SegmentButton
            label={t('settings.unitsImperial')}
            active={settings.units === 'imperial'}
            onPress={() => updateSetting('units', 'imperial')}
          />
        </View>
      </Section>

      <Section title={t('settings.wifi')}>
        <Row
          label={t('settings.wifiNotifications')}
          description={t('settings.wifiDescription')}
        >
          <Switch
            value={settings.wifiProximityEnabled}
            onValueChange={(v) => updateSetting('wifiProximityEnabled', v)}
          />
        </Row>
      </Section>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {t('settings.version', { version: '0.9.0' })}
        </Text>
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
  hint: {
    fontSize: FONT_SIZE.small,
    color: COLORS.textFaint,
    marginTop: SPACING.sm,
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
    borderRadius: RADIUS.sm,
  },
  segmentActive: { backgroundColor: COLORS.background },
  segmentText: { fontSize: FONT_SIZE.body, color: COLORS.textMuted },
  segmentTextActive: { color: COLORS.text, fontWeight: '600' },
  footer: { alignItems: 'center', padding: SPACING.xl },
  footerText: { color: COLORS.textFaint, fontSize: FONT_SIZE.small },
});