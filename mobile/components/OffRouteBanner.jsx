// Banner shown when the student has been off-route for several
// consecutive GPS fixes. Offers a recalculate button.

import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export function OffRouteBanner({ onRecalculate, onDismiss }) {
  return (
    <View style={styles.banner}>
      <View style={styles.body}>
        <Text style={styles.title}>You seem off route</Text>
        <Text style={styles.subtitle}>
          Are you on a different path?
        </Text>
      </View>
      <TouchableOpacity
        style={styles.button}
        onPress={onRecalculate}
        accessibilityRole="button"
        accessibilityLabel="Recalculate route"
      >
        <Text style={styles.buttonText}>Recalculate</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        style={styles.dismissButton}
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
    backgroundColor: '#fef3c7',
    borderBottomWidth: 1,
    borderBottomColor: '#fcd34d',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  body: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600', color: '#78350f' },
  subtitle: { fontSize: 13, color: '#92400e', marginTop: 2 },
  button: {
    backgroundColor: '#78350f',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  buttonText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  dismissButton: { padding: 6 },
  dismissText: { color: '#78350f', fontSize: 16, fontWeight: '600' },
});