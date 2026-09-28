// A two-step picker: choose a program, then choose a year.
//
// Used in two places:
//   - Onboarding, as a slide the student can fill in or skip.
//   - The timetable screen, inline, if no selection is stored yet.
//
// The picker doesn't save anything itself. It calls `onSelect` with
// the chosen program_year_id. The caller decides what to do with it.
//
// The program list can be long (many programs across many colleges
// and departments), so there's a search box above it. The year list
// is short — one program has a handful of year levels — so it stays
// unfiltered.

import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { t } from '@/i18n';
import { listPrograms, listYearsForProgram } from '@/services/timetable';
import { COLORS, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';

export function ProgramYearPicker({ onSelect, selectedProgramYearId = null }) {
  const [programs, setPrograms] = useState([]);
  const [years, setYears] = useState([]);
  const [selectedProgramId, setSelectedProgramId] = useState(null);
  const [selectedYearId, setSelectedYearId] = useState(selectedProgramYearId);

  const [programSearch, setProgramSearch] = useState('');

  const [loadingPrograms, setLoadingPrograms] = useState(true);
  const [loadingYears, setLoadingYears] = useState(false);
  const [error, setError] = useState(null);

  // Load programs once.
  useEffect(() => {
    let cancelled = false;
    setLoadingPrograms(true);
    setError(null);
    listPrograms()
      .then((data) => {
        if (!cancelled) setPrograms(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || t('common.error'));
      })
      .finally(() => {
        if (!cancelled) setLoadingPrograms(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load years when the program changes.
  useEffect(() => {
    if (!selectedProgramId) {
      setYears([]);
      return;
    }
    let cancelled = false;
    setLoadingYears(true);
    listYearsForProgram(selectedProgramId)
      .then((data) => {
        if (!cancelled) setYears(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || t('common.error'));
      })
      .finally(() => {
        if (!cancelled) setLoadingYears(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProgramId]);

  // Filter the program list by the search string. Case-insensitive
  // substring match on name, code, and department. If the search is
  // empty, all programs show.
  const filteredPrograms = useMemo(() => {
    const q = programSearch.trim().toLowerCase();
    if (!q) return programs;
    return programs.filter((p) => {
      const haystack = [
        p.name || '',
        p.code || '',
        p.department || '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [programs, programSearch]);

  function chooseProgram(id) {
    setSelectedProgramId(id);
    setSelectedYearId(null);
  }

  function chooseYear(id) {
    setSelectedYearId(id);
    if (onSelect) onSelect(id);
  }

  if (loadingPrograms) {
    return (
      <View style={styles.state}>
        <ActivityIndicator color={COLORS.textMuted} />
        <Text style={styles.stateText}>{t('timetable.picker.loading')}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.state}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (programs.length === 0) {
    return (
      <View style={styles.state}>
        <Text style={styles.stateText}>{t('timetable.picker.empty')}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
    >
      <Text style={styles.stepLabel}>{t('timetable.picker.stepProgram')}</Text>

      <TextInput
        style={styles.searchInput}
        value={programSearch}
        onChangeText={setProgramSearch}
        placeholder={t('timetable.picker.searchPlaceholder')}
        placeholderTextColor={COLORS.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />

      <View style={styles.list}>
        {filteredPrograms.length === 0 ? (
          <Text style={styles.noMatchText}>
            {t('timetable.picker.noMatch')}
          </Text>
        ) : (
          filteredPrograms.map((p) => {
            const isSelected = selectedProgramId === p.id;
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.option, isSelected && styles.optionSelected]}
                onPress={() => chooseProgram(p.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
              >
                <Text
                  style={[
                    styles.optionText,
                    isSelected && styles.optionTextSelected,
                  ]}
                  numberOfLines={2}
                >
                  {p.name}
                </Text>
                {p.department ? (
                  <Text
                    style={[
                      styles.optionSubtext,
                      isSelected && styles.optionSubtextSelected,
                    ]}
                    numberOfLines={1}
                  >
                    {p.department}
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {selectedProgramId ? (
        <>
          <Text style={[styles.stepLabel, styles.stepLabelSpaced]}>
            {t('timetable.picker.stepYear')}
          </Text>
          {loadingYears ? (
            <ActivityIndicator color={COLORS.textMuted} />
          ) : years.length === 0 ? (
            <Text style={styles.stateText}>{t('timetable.picker.noYears')}</Text>
          ) : (
            <View style={styles.list}>
              {years.map((y) => {
                const isSelected = selectedYearId === y.id;
                const label =
                  y.display_name ||
                  t('timetable.picker.yearLabel', { n: y.year_number });
                return (
                  <TouchableOpacity
                    key={y.id}
                    style={[styles.option, isSelected && styles.optionSelected]}
                    onPress={() => chooseYear(y.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        isSelected && styles.optionTextSelected,
                      ]}
                    >
                      {label}
                    </Text>
                    <Text
                      style={[
                        styles.optionSubtext,
                        isSelected && styles.optionSubtextSelected,
                      ]}
                    >
                      {y.academic_year} · S{y.semester}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: SPACING.lg },
  stepLabel: {
    fontSize: FONT_SIZE.small,
    color: COLORS.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  stepLabelSpaced: {
    marginTop: SPACING.lg,
  },
  searchInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    fontSize: FONT_SIZE.body,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  list: {
    gap: SPACING.sm,
  },
  noMatchText: {
    fontSize: FONT_SIZE.body,
    color: COLORS.textMuted,
    paddingVertical: SPACING.md,
    textAlign: 'center',
  },
  option: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.background,
  },
  optionSelected: {
    backgroundColor: COLORS.primaryDark,
    borderColor: COLORS.primaryDark,
  },
  optionText: {
    fontSize: FONT_SIZE.body,
    color: COLORS.text,
    fontWeight: '500',
  },
  optionTextSelected: {
    color: '#ffffff',
  },
  optionSubtext: {
    fontSize: FONT_SIZE.small - 1,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  optionSubtextSelected: {
    color: '#cbd5e1',
  },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  stateText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZE.body,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: FONT_SIZE.body,
    textAlign: 'center',
  },
});