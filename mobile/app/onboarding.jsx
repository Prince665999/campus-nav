// Onboarding. Shown once, on first launch.
//
// Four slides now: welcome, search, walk, and program/year selection.
// Swipe or tap Next. Skip is always available on the first three
// slides. On the last slide, the student either picks or taps
// "Get started" without picking — both work.

import { useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProgramYearPicker } from '@/components/ProgramYearPicker';
import { useSettings } from '@/context/SettingsContext';
import { t } from '@/i18n';
import { COLORS, FONT_SIZE, RADIUS, SPACING, TOUCH } from '@/constants/theme';
import { ICONS } from '@/constants/icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SLIDES = [
  {
    key: 'welcome',
    icon: 'place',
    titleKey: 'onboarding.welcome',
    bodyKey: 'onboarding.welcomeBody',
  },
  {
    key: 'search',
    icon: 'search',
    titleKey: 'onboarding.searchTitle',
    bodyKey: 'onboarding.searchBody',
  },
  {
    key: 'walk',
    icon: 'walk',
    titleKey: 'onboarding.walkTitle',
    bodyKey: 'onboarding.walkBody',
  },
  {
    key: 'timetable',
    icon: 'schedule',
    titleKey: 'onboarding.timetableTitle',
    bodyKey: 'onboarding.timetableBody',
    isPicker: true,
  },
];

export default function OnboardingScreen() {
  const { updateSetting } = useSettings();
  const insets = useSafeAreaInsets();
  const listRef = useRef(null);
  const [index, setIndex] = useState(0);
  // Set when the student picks a program/year on the last slide.
  const [pickedProgramYearId, setPickedProgramYearId] = useState(null);

  function finish() {
    updateSetting('hasSeenOnboarding', true);
    // Only save the selection if they actually picked one. Skipping
    // leaves the setting untouched (null by default).
    if (pickedProgramYearId != null) {
      updateSetting('programYearId', pickedProgramYearId);
    }
    router.replace('/');
  }

  function next() {
    if (index < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: index + 1, animated: true });
      setIndex(index + 1);
    } else {
      finish();
    }
  }

  function onScroll(event) {
    const offset = event.nativeEvent.contentOffset.x;
    const newIndex = Math.round(offset / SCREEN_WIDTH);
    if (newIndex !== index) setIndex(newIndex);
  }

  const isLast = index === SLIDES.length - 1;
  const isPickerSlide = SLIDES[index]?.isPicker === true;

  return (
    <View style={styles.container}>
      {/* Skip is hidden on the picker slide — the student can tap
          "Get started" without picking instead. */}
      {!isPickerSlide ? (
        <View style={[styles.skipRow, { top: insets.top + SPACING.sm }]}>
          <TouchableOpacity
            onPress={finish}
            style={styles.skipButton}
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.skip')}
          >
            <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        getItemLayout={(data, i) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * i,
          index: i,
        })}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
            {item.isPicker ? (
              <>
                <View style={styles.pickerHeader}>
                  <View style={styles.iconCircleSmall}>
                    <MaterialIcons
                      name="schedule"
                      size={40}
                      color={COLORS.primaryDark}
                    />
                  </View>
                  <Text style={styles.slideTitle}>{t(item.titleKey)}</Text>
                  <Text style={styles.slideBody}>{t(item.bodyKey)}</Text>
                </View>
                <View style={styles.pickerBody}>
                  <ProgramYearPicker onSelect={setPickedProgramYearId} />
                </View>
              </>
            ) : (
              <>
                <View style={styles.iconCircle}>
                  <MaterialIcons
                    name={ICONS[item.icon] || ICONS.place}
                    size={56}
                    color={COLORS.primaryDark}
                  />
                </View>
                <Text style={styles.slideTitle}>{t(item.titleKey)}</Text>
                <Text style={styles.slideBody}>{t(item.bodyKey)}</Text>
              </>
            )}
          </View>
        )}
      />

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === index && styles.dotActive]}
          />
        ))}
      </View>

      <View
        style={[styles.footer, { paddingBottom: insets.bottom + SPACING.md }]}
      >
        <TouchableOpacity
          style={styles.nextButton}
          onPress={next}
          accessibilityRole="button"
          accessibilityLabel={
            isLast ? t('onboarding.getStarted') : t('onboarding.next')
          }
        >
          <Text style={styles.nextText}>
            {isLast ? t('onboarding.getStarted') : t('onboarding.next')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  skipRow: {
    position: 'absolute',
    right: SPACING.md,
    zIndex: 10,
  },
  skipButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: TOUCH.minHeight,
    justifyContent: 'center',
  },
  skipText: {
    fontSize: FONT_SIZE.body,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  iconCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: COLORS.backgroundSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  iconCircleSmall: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.backgroundSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  slideTitle: {
    fontSize: FONT_SIZE.hero,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  slideBody: {
    fontSize: FONT_SIZE.large,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 26,
  },
  pickerHeader: {
    alignItems: 'center',
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.md,
  },
  pickerBody: {
    flex: 1,
    alignSelf: 'stretch',
    paddingTop: SPACING.sm,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: SPACING.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.border,
  },
  dotActive: {
    backgroundColor: COLORS.primary,
    width: 24,
  },
  footer: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  nextButton: {
    backgroundColor: COLORS.primaryDark,
    borderRadius: RADIUS.md,
    paddingVertical: 16,
    minHeight: TOUCH.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
});