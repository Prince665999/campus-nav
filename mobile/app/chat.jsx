// Walk chat screen.
//
// Opened from the walking screen with route params (a from-place OR
// from-coordinates, plus a destination and step index). Calls
// /api/chat. The student is walking and asking about the walk.
//
// Without route params there is nothing to ask about, so the screen
// sends the student back home.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatBubble } from '@/components/ChatBubble';
import {
  sendRouteChatMessage,
  startRouteChatSession,
  endRouteChatSession,
} from '@/services/api';
import { t } from '@/i18n';
import { COLORS, FONT_SIZE, SPACING } from '@/constants/theme';

export default function ChatScreen() {
  const params = useLocalSearchParams();

  // Route context: a from-place OR from-coordinates, plus a
  // destination. A place-started walk sends fromPlaceId; a
  // GPS-started walk sends fromLat/fromLon. Both are valid.
  const fromPlaceId =
    params.fromPlaceId && params.fromPlaceId !== ''
      ? Number(params.fromPlaceId)
      : null;
  const fromLat =
    params.fromLat && params.fromLat !== '' ? Number(params.fromLat) : null;
  const fromLon =
    params.fromLon && params.fromLon !== '' ? Number(params.fromLon) : null;
  const toPlaceId =
    params.toPlaceId && params.toPlaceId !== ''
      ? Number(params.toPlaceId)
      : null;
  const currentStepIndex =
    params.currentStepIndex != null && params.currentStepIndex !== ''
      ? Number(params.currentStepIndex)
      : 0;
  const distanceFromStartM =
    params.distanceFromStartM != null && params.distanceFromStartM !== ''
      ? Number(params.distanceFromStartM)
      : 0;
  const currentLat =
    params.currentLat && params.currentLat !== ''
      ? Number(params.currentLat)
      : null;
  const currentLon =
    params.currentLon && params.currentLon !== ''
      ? Number(params.currentLon)
      : null;

  // Route chat needs a destination AND some form of starting point.
  // That covers both a place-started walk and a GPS-started walk.
  const hasRouteContext = !!(
    toPlaceId &&
    (fromPlaceId != null || (fromLat != null && fromLon != null))
  );

  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  // Nothing to chat about without a walk — go home.
  useEffect(() => {
    if (!hasRouteContext) router.replace('/');
  }, [hasRouteContext]);

  // Start a route chat session on mount.
  useEffect(() => {
    if (!hasRouteContext) return undefined;
    let cancelled = false;
    let startedSessionId = null;

    startRouteChatSession()
      .then((data) => {
        if (!cancelled) {
          startedSessionId = data.session_id;
          setSessionId(data.session_id);
        }
      })
      .catch(() => {
        // Session-less chat still works, memory just doesn't persist.
      });

    return () => {
      cancelled = true;
      if (startedSessionId) {
        endRouteChatSession(startedSessionId).catch(() => {});
      }
    };
  }, [hasRouteContext]);

  useEffect(() => {
    setMessages([{ role: 'assistant', content: t('chat.greetingWalk') }]);
  }, []);

  const send = useCallback(
    async (messageOverride) => {
      const message = (messageOverride ?? input).trim();
      if (!message || sending || !hasRouteContext) return;

      setInput('');
      setError(null);
      setMessages((prev) => [...prev, { role: 'user', content: message }]);
      setSending(true);

      try {
        const response = await sendRouteChatMessage({
          message,
          sessionId,
          fromPlaceId,
          fromLat,
          fromLon,
          toPlaceId,
          currentStepIndex,
          distanceFromStartM,
          currentLat,
          currentLon,
        });

        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: response.reply },
        ]);
      } catch (err) {
        // Show the actual failure reason, not just a generic message.
        // The API client already extracts `detail` from the response
        // body, so `err.message` is the useful text.
        const detail = err?.message || t('common.error');
        setError(detail);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `${t('chat.error')} (${detail})`,
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [
      input,
      sending,
      sessionId,
      hasRouteContext,
      fromPlaceId,
      fromLat,
      fromLon,
      toPlaceId,
      currentStepIndex,
      distanceFromStartM,
      currentLat,
      currentLon,
    ]
  );

  // Auto-scroll to the bottom when a new message arrives.
  useEffect(() => {
    const timeout = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
    return () => clearTimeout(timeout);
  }, [messages]);

  return (
    <>
      <Stack.Screen
        options={{
          title: t('chat.titleWalk'),
        }}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
        >
          {messages.map((m, i) => (
            <ChatBubble key={i} role={m.role} content={m.content} />
          ))}
          {sending ? (
            <View style={styles.thinking}>
              <ActivityIndicator color={COLORS.textMuted} size="small" />
            </View>
          ) : null}
        </ScrollView>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View
          style={[
            styles.inputRow,
            { paddingBottom: insets.bottom + SPACING.sm },
          ]}
        >
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder={t('chat.placeholderWalk')}
            placeholderTextColor={COLORS.textFaint}
            multiline
            maxLength={500}
            editable={!sending}
            returnKeyType="send"
            onSubmitEditing={() => send()}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!input.trim() || sending) && styles.sendDisabled,
            ]}
            onPress={() => send()}
            disabled={!input.trim() || sending}
            accessibilityRole="button"
            accessibilityLabel={t('chat.send')}
          >
            <Text style={styles.sendText}>GO</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  messages: { flex: 1 },
  messagesContent: {
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
  },
  thinking: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    alignItems: 'flex-start',
  },
  error: {
    color: COLORS.danger,
    fontSize: FONT_SIZE.small,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
    gap: SPACING.sm,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: COLORS.backgroundSubtle,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    fontSize: FONT_SIZE.body,
    color: COLORS.text,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
  sendText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
});
