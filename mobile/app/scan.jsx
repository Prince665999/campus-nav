// Scan a QR code to say where you are.
//
// The camera reads the code printed on the wall. Typing the code printed
// under the QR also works, for a damaged sticker, a denied camera
// permission, or a build made before the camera package was added.

import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

import { COLORS, FONT_SIZE, SPACING, TOUCH } from '@/constants/theme';
import { t } from '@/i18n';
import { startFromQr } from '@/services/qr';

// expo-camera is a native module. It exists only in an app build made after
// it was installed. Load it defensively so that an older build still opens
// this screen and the typed-code box still works.
let CameraModule = null;
try {
  CameraModule = require('expo-camera');
} catch {
  CameraModule = null;
}

// Wait this long after a failed scan before reading another code, so the
// camera doesn't hammer the server while it is still pointed at the same QR.
const RETRY_DELAY_MS = 2000;

function CameraScanner({ onCode }) {
  const { CameraView, useCameraPermissions } = CameraModule;
  const [permission, requestPermission] = useCameraPermissions();

  if (!permission) {
    return (
      <View style={styles.cameraFallback}>
        <ActivityIndicator color={COLORS.headerText} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.cameraFallback}>
        <Text style={styles.cameraFallbackText}>{t('qr.cameraDenied')}</Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={requestPermission}
          accessibilityRole="button"
        >
          <Text style={styles.permissionButtonText}>
            {t('qr.grantPermission')}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.camera}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => onCode(data)}
      />
      <View style={styles.frameWrap} pointerEvents="none">
        <View style={styles.frame} />
        <Text style={styles.hint}>{t('qr.hint')}</Text>
      </View>
    </View>
  );
}

export default function ScanScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [typed, setTyped] = useState('');
  const busyRef = useRef(false);

  const handleCode = useCallback(async (raw) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await startFromQr(raw);
      router.replace('/');
    } catch (e) {
      const message =
        e.reason === 'unknown'
          ? t('qr.errorUnknown')
          : e.reason === 'invalid'
            ? t('qr.errorInvalid')
            : t('qr.errorNetwork');
      setError(message);
      setBusy(false);
      setTimeout(() => {
        busyRef.current = false;
      }, RETRY_DELAY_MS);
    }
  }, []);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: t('qr.title') }} />

      {CameraModule ? (
        <CameraScanner onCode={handleCode} />
      ) : (
        <View style={styles.cameraFallback}>
          <MaterialIcons
            name="qr-code-scanner"
            size={48}
            color={COLORS.headerText}
          />
          <Text style={styles.cameraFallbackText}>{t('qr.notAvailable')}</Text>
        </View>
      )}

      <View style={styles.panel}>
        {busy ? (
          <View style={styles.statusRow}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.statusText}>{t('qr.finding')}</Text>
          </View>
        ) : error ? (
          <Text style={styles.errorText} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}

        <Text style={styles.label}>{t('qr.manualLabel')}</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={typed}
            onChangeText={setTyped}
            placeholder={t('qr.manualPlaceholder')}
            placeholderTextColor={COLORS.textFaint}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={() => handleCode(typed)}
          />
          <TouchableOpacity
            style={[styles.go, !typed.trim() && styles.goDisabled]}
            onPress={() => handleCode(typed)}
            disabled={!typed.trim() || busy}
            accessibilityRole="button"
          >
            <Text style={styles.goText}>{t('qr.manualSubmit')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundSubtle },
  camera: { flex: 1, backgroundColor: '#000' },
  cameraFallback: {
    flex: 1,
    backgroundColor: COLORS.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  cameraFallbackText: {
    color: COLORS.headerText,
    fontSize: FONT_SIZE.body,
    textAlign: 'center',
    marginTop: SPACING.md,
  },
  permissionButton: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.background,
    borderRadius: 24,
    paddingHorizontal: SPACING.lg,
    minHeight: TOUCH.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionButtonText: {
    color: COLORS.primaryDark,
    fontSize: FONT_SIZE.body,
    fontWeight: '600',
  },
  frameWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: 240,
    height: 240,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: '#ffffff',
    opacity: 0.9,
  },
  hint: {
    marginTop: SPACING.md,
    color: '#ffffff',
    fontSize: FONT_SIZE.body,
    textAlign: 'center',
    paddingHorizontal: SPACING.lg,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
  },
  panel: {
    backgroundColor: COLORS.background,
    padding: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  statusText: {
    marginLeft: SPACING.sm,
    color: COLORS.text,
    fontSize: FONT_SIZE.body,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: FONT_SIZE.body,
    marginBottom: SPACING.sm,
  },
  label: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZE.small,
    marginBottom: SPACING.xs,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: {
    flex: 1,
    minHeight: TOUCH.minHeight,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZE.body,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  go: {
    marginLeft: SPACING.sm,
    minHeight: TOUCH.minHeight,
    paddingHorizontal: SPACING.md,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goDisabled: { opacity: 0.45 },
  goText: {
    color: COLORS.headerText,
    fontSize: FONT_SIZE.body,
    fontWeight: '600',
  },
});
