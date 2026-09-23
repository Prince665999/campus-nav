// The search input on the Home screen.

import {
  ActivityIndicator,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { COLORS, FONT_SIZE, RADIUS, SPACING, TOUCH } from '@/constants/theme';
import { ICONS } from '@/constants/icons';

export function SearchBar({
  value,
  onChangeText,
  onSubmit,
  placeholder,
  loading,
}) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.inputRow}>
        <MaterialIcons
          name={ICONS.search}
          size={20}
          color={COLORS.textMuted}
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={onSubmit}
          accessibilityLabel={placeholder}
          accessibilityHint="Type a place name or a sentence like 'take me to the library'"
        />
        {value ? (
          <TouchableOpacity
            onPress={() => onChangeText('')}
            style={styles.clearButton}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <MaterialIcons name={ICONS.clear} size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        ) : null}
        {loading ? (
          <ActivityIndicator style={styles.spinner} color={COLORS.textMuted} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    minHeight: TOUCH.minHeight,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  searchIcon: { marginRight: SPACING.sm },
  input: {
    flex: 1,
    fontSize: FONT_SIZE.body,
    color: COLORS.text,
    paddingVertical: 12,
  },
  clearButton: {
    padding: SPACING.sm,
    minWidth: TOUCH.minWidth,
    minHeight: TOUCH.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: { marginLeft: SPACING.sm },
});