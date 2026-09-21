// Arrival screen.
//
// Shown when the student reaches the destination. Shows the
// destination's photo, a "was this helpful?" feedback row, and a
// save-to-favorites button.

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  addFavorite,
  createReport,
  getPlace,
  isFavorite,
  listMediaForPlace,
} from '@/services/api';
import { t } from '@/i18n';
import { COLORS, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';

export default function ArrivalScreen() {
  const { toId } = useLocalSearchParams();
  const placeId = Number(toId);

  const insets = useSafeAreaInsets();

  const [place, setPlace] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [favorited, setFavorited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedbackSent, setFeedbackSent] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [placeData, photos, favFlag] = await Promise.all([
          getPlace(placeId),
          listMediaForPlace(placeId).catch(() => []),
          isFavorite(placeId).catch(() => false),
        ]);
        if (cancelled) return;
        setPlace(placeData);
        setFavorited(favFlag);
        if (photos.length > 0) {
          setPhoto(photos.find((p) => p.is_primary) || photos[0]);
        }
      } catch {
        // Silent. The screen shows what it can.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [placeId]);

  const sendFeedback = useCallback(
    async (kind) => {
      if (feedbackSent) return;
      setFeedbackSent(kind);
      try {
        await createReport({ kind, placeId });
      } catch {
        // If it fails, we already showed the thanks — don't retract it.
      }
    },
    [feedbackSent, placeId]
  );

  const saveFavorite = useCallback(async () => {
    if (favorited) return;
    setFavorited(true);
    try {
      await addFavorite(placeId);
    } catch {
      setFavorited(false);
    }
  }, [favorited, placeId]);

  const goHome = useCallback(() => {
    router.replace('/');
  }, []);

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: t('arrival.title') }} />
        <View style={styles.state}>
          <ActivityIndicator color={COLORS.textMuted} />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: t('arrival.title'),
          headerBackVisible: false,
        }}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: insets.bottom + SPACING.lg }}
      >
        {photo ? (
          <Image
            source={{ uri: photo.url_card }}
            style={styles.photo}
            resizeMode="cover"
          />
        ) : null}

        <View style={styles.body}>
          <Text style={styles.arrived}>{t('arrival.arrived')}</Text>
          {place ? <Text style={styles.name}>{place.name}</Text> : null}
          {place?.name_sw ? (
            <Text style={styles.nameSw}>{place.name_sw}</Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('arrival.wasHelpful')}</Text>
          <View style={styles.thumbs}>
            <TouchableOpacity
              style={[
                styles.thumbButton,
                feedbackSent === 'helpful' && styles.thumbActive,
              ]}
              onPress={() => sendFeedback('helpful')}
              disabled={feedbackSent != null}
              accessibilityRole="button"
              accessibilityLabel={t('arrival.helpful')}
            >
              <Text style={styles.thumbIcon}>👍</Text>
              <Text style={styles.thumbLabel}>{t('arrival.helpful')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.thumbButton,
                feedbackSent === 'not_helpful' && styles.thumbActive,
              ]}
              onPress={() => sendFeedback('not_helpful')}
              disabled={feedbackSent != null}
              accessibilityRole="button"
              accessibilityLabel={t('arrival.notHelpful')}
            >
              <Text style={styles.thumbIcon}>👎</Text>
              <Text style={styles.thumbLabel}>{t('arrival.notHelpful')}</Text>
            </TouchableOpacity>
          </View>
          {feedbackSent ? (
            <Text style={styles.thanks}>{t('arrival.thanks')}</Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[
              styles.secondaryButton,
              favorited && styles.secondaryButtonDisabled,
            ]}
            onPress={saveFavorite}
            disabled={favorited}
            accessibilityRole="button"
          >
            <Text
              style={[
                styles.secondaryButtonText,
                favorited && styles.secondaryButtonTextDisabled,
              ]}
            >
              {favorited ? t('arrival.saved') : t('arrival.savePlace')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={goHome}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>{t('arrival.done')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.backgroundSubtle,
  },
  photo: {
    width: '100%',
    height: 220,
    backgroundColor: COLORS.borderSubtle,
  },
  body: {
    padding: SPACING.lg,
    alignItems: 'center',
  },
  arrived: {
    fontSize: FONT_SIZE.small,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  name: {
    fontSize: FONT_SIZE.hero,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  nameSw: {
    fontSize: 16,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  section: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSubtle,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.small,
    color: COLORS.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.md,
  },
  thumbs: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  thumbButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  thumbActive: {
    backgroundColor: COLORS.primaryDark,
    borderColor: COLORS.primaryDark,
  },
  thumbIcon: { fontSize: 28 },
  thumbLabel: {
    fontSize: FONT_SIZE.small,
    color: COLORS.text,
    marginTop: 6,
    fontWeight: '500',
  },
  thanks: {
    fontSize: FONT_SIZE.body,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.md,
  },
  actions: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    gap: SPACING.md,
  },
  primaryButton: {
    backgroundColor: COLORS.primaryDark,
    borderRadius: RADIUS.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  secondaryButton: {
    borderRadius: RADIUS.md,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.primaryDark,
  },
  secondaryButtonDisabled: {
    borderColor: COLORS.border,
    backgroundColor: COLORS.backgroundSubtle,
  },
  secondaryButtonText: {
    color: COLORS.primaryDark,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonTextDisabled: { color: COLORS.textFaint },
});