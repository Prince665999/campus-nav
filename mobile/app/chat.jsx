// Chat screen.
//
// Two modes, decided by what the screen is opened with:
//
//   - No route params: a general chat. The student can ask for a
//     destination in free text ("take me to the cafeteria"), which
//     navigates to the route preview.
//
//   - With route params (fromPlaceId, toPlaceId, currentStep, etc.):
//     an in-walk chat. Questions are answered using the route
//     timeline, the narration, and nearby places.

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
  extractDestination,
  sendChatMessage,
  startChatSession,
  endChatSession,
} from '@/services/api';
import { t } from '@/i18n';
import { COLORS, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';

export default function ChatScreen() {
  const params = useLocalSearchParams();

  // The route context, if this chat was opened from a walk.
  const hasRouteContext = params.fromPlaceId && params.toPlaceId;
  const fromPlaceId = params.fromPlaceId ? Number(params.fromPlaceId) : null;
  const toPlaceId = params.toPlaceId ? Number(params.toPlaceId) : null;
  const currentStepIndex =
    params.currentStepIndex != null ? Number(params.currentStepIndex) : null;
  const distanceFromStartM =
    params.distanceFromStartM != null ? Number(params.distanceFromStartM) : null;
  const currentLat = params.currentLat != null ? Number(params.currentLat) : null;
  const currentLon = params.currentLon != null ? Number(params.currentLon) : null;

  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  // Start a chat session on mount, end it on unmount.
  useEffect(() => {
    let cancelled = false;
    let startedSessionId = null;

    startChatSession()
      .then((data) => {
        if (!cancelled) {
          startedSessionId = data.session_id;
          setSessionId(data.session_id);
        }
      })
      .catch(() => {
        // Session-less chat still works; memory just doesn't persist.
      });

    return () => {
      cancelled = true;
      if (startedSessionId) {
        endChatSession(startedSessionId).catch(() => {});
      }
    };
  }, []);

  // Greeting, tailored to the mode.
  useEffect(() => {
    const greeting = hasRouteContext
      ? t('chat.greetingWalk')
      : t('chat.greetingGeneral');
    setMessages([{ role: 'assistant', content: greeting }]);
  }, [hasRouteContext]);

  const send = useCallback(async () => {
    const message = input.trim();
    if (!message || sending) return;

    setInput('');
    setError(null);
    setMessages((prev) => [...prev, { role: 'user', content: message }]);
    setSending(true);

    try {
      // Without a route context, try to interpret the message as a
      // destination request first.
      if (!hasRouteContext) {
        const extracted = await extractDestination(message);
        if (extracted.matched) {
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: t('chat.foundDestination', {
                name: `#${extracted.place_id}`,
              }),
            },
          ]);
          // Navigate to route preview.
          router.push({
            pathname: '/route-preview',
            params: {
              fromId: String(extracted.place_id === 1 ? 2 : 1), // temp "from"
              toId: String(extracted.place_id),
            },
          });
          setSending(false);
          return;
        }
      }

      // Otherwise, treat it as a chat question.
      const response = await sendChatMessage({
        message,
        sessionId,
        fromPlaceId,
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
      setError(err.message || t('common.error'));
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: t('chat.error') },
      ]);
    } finally {
      setSending(false);
    }
  }, [
    input,
    sending,
    sessionId,
    hasRouteContext,
    fromPlaceId,
    toPlaceId,
    currentStepIndex,
    distanceFromStartM,
    currentLat,
    currentLon,
  ]);

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
          title: hasRouteContext ? t('chat.titleWalk') : t('chat.title'),
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
            placeholder={t('chat.placeholder')}
            placeholderTextColor={COLORS.textFaint}
            multiline
            maxLength={500}
            editable={!sending}
            returnKeyType="send"
            onSubmitEditing={send}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!input.trim() || sending) && styles.sendDisabled]}
            onPress={send}
            disabled={!input.trim() || sending}
            accessibilityRole="button"
            accessibilityLabel={t('chat.send')}
          >
            <Text style={styles.sendText}>↑</Text>
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