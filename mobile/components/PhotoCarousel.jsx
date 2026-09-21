// Horizontal photo carousel.
//
// Shows each photo at "card" size (800px). Tapping opens a full-
// screen view at "full" size (1600px). If there are no photos, the
// component renders nothing — the caller doesn't need to check first.

import { useState } from 'react';
import {
  Dimensions,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { COLORS, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - SPACING.lg * 2;
const CARD_HEIGHT = Math.round(CARD_WIDTH * 0.65);

export function PhotoCarousel({ photos }) {
  const [openIndex, setOpenIndex] = useState(null);

  if (!photos || photos.length === 0) {
    return null;
  }

  return (
    <>
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>
          {photos.length === 1 ? 'Photo' : `Photos (${photos.length})`}
        </Text>
        <View style={styles.scroll}>
          {photos.map((photo, i) => (
            <TouchableOpacity
              key={photo.id}
              onPress={() => setOpenIndex(i)}
              activeOpacity={0.85}
              accessibilityRole="imagebutton"
              accessibilityLabel={`Photo ${i + 1} of ${photos.length}`}
            >
              <Image
                source={{ uri: photo.url_card }}
                style={styles.card}
                resizeMode="cover"
              />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <Modal
        visible={openIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setOpenIndex(null)}
      >
        <View style={styles.modalBg}>
          <TouchableOpacity
            style={styles.modalClose}
            onPress={() => setOpenIndex(null)}
            accessibilityRole="button"
            accessibilityLabel="Close photo"
          >
            <Text style={styles.modalCloseText}>✕</Text>
          </TouchableOpacity>

          {openIndex !== null ? (
            <Image
              source={{ uri: photos[openIndex].url_full }}
              style={styles.fullImage}
              resizeMode="contain"
            />
          ) : null}

          {photos[openIndex]?.credit ? (
            <Text style={styles.credit}>
              {photos[openIndex].credit}
            </Text>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSubtle,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.small,
    color: COLORS.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  scroll: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.md,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.borderSubtle,
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalClose: {
    position: 'absolute',
    top: 48,
    right: 20,
    padding: 12,
    zIndex: 1,
  },
  modalCloseText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '600',
  },
  fullImage: {
    width: '100%',
    height: '80%',
  },
  credit: {
    position: 'absolute',
    bottom: 40,
    color: '#d1d5db',
    fontSize: 13,
  },
});