// A bottom sheet for submitting a problem report.
//
// Used from the place detail screen and from walking mode. Presents
// a list of report kinds, an optional free-text body, and a submit
// button.

import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createReport } from '@/services/api';
import { t } from '@/i18n';
import { COLORS, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';

const KINDS = [
  'wrong_direction',
  'blocked',
  'bad_photo',
  'wrong_name',
  'missing_path',
  'missing_place',
  'incorrect_info',
  'other',
];

export function ReportSheet({ visible, onClose, placeId = null, edgeId = null }) {
  const insets = useSafeAreaInsets();

  const [kind, setKind] = useState(null);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const reset = () => {
    setKind(null);
    setBody('');
    setError(null);
    setDone(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!kind) {
      setError('Please pick what went wrong.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createReport({ kind, body, placeId, edgeId });
      setDone(true);
      // Auto-close after a moment so the student sees the confirmation.
      setTimeout(handleClose, 1200);
    } catch (err) {
      setError(err.message || t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <View style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.md }]}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('report.title')}</Text>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {done ? (
            <View style={styles.doneBox}>
              <Text style={styles.doneText}>{t('report.thanks')}</Text>
            </View>
          ) : (
            <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
              <Text style={styles.sectionLabel}>{t('report.whatWrong')}</Text>

              {KINDS.map((k) => (
                <TouchableOpacity
                  key={k}
                  style={[styles.option, kind === k && styles.optionSelected]}
                  onPress={() => setKind(k)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: kind === k }}
                >
                  <Text
                    style={[
                      styles.optionText,
                      kind === k && styles.optionTextSelected,
                    ]}
                  >
                    {t(`report.kinds.${k}`)}
                  </Text>
                </TouchableOpacity>
              ))}

              <Text style={styles.sectionLabel}>{t('report.detailsOptional')}</Text>
              <TextInput
                style={styles.input}
                multiline
                numberOfLines={4}
                value={body}
                onChangeText={setBody}
                placeholder={t('report.detailsPlaceholder')}
                placeholderTextColor={COLORS.textFaint}
                maxLength={2000}
              />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <TouchableOpacity
                style={[styles.submit, (!kind || submitting) && styles.submitDisabled]}
                onPress={handleSubmit}
                disabled={!kind || submitting}
                accessibilityRole="button"
              >
                {submitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.submitText}>{t('report.submit')}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  closeButton: { padding: 6 },
  closeText: { fontSize: 20, color: COLORS.textMuted },
  scroll: { flexGrow: 0 },
  sectionLabel: {
    fontSize: FONT_SIZE.small,
    color: COLORS.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  option: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.sm,
  },
  optionSelected: {
    backgroundColor: COLORS.primaryDark,
    borderColor: COLORS.primaryDark,
  },
  optionText: { fontSize: FONT_SIZE.body, color: COLORS.text },
  optionTextSelected: { color: '#ffffff', fontWeight: '600' },
  input: {
    backgroundColor: COLORS.backgroundSubtle,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    minHeight: 96,
    textAlignVertical: 'top',
    color: COLORS.text,
    fontSize: FONT_SIZE.body,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: FONT_SIZE.small,
    marginTop: SPACING.sm,
  },
  submit: {
    backgroundColor: COLORS.primaryDark,
    borderRadius: RADIUS.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
  },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  doneBox: {
    paddingVertical: SPACING.xl * 2,
    alignItems: 'center',
  },
  doneText: {
    fontSize: 17,
    color: COLORS.text,
    fontWeight: '600',
    textAlign: 'center',
  },
});