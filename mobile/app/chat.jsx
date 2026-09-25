// Chat screen.
//
// Two modes, decided by URL params:
//
//   - No route params → document chat. Calls /api/chat/doc.
//     The student is asking about the university.
//
//   - Route params present (fromPlaceId, toPlaceId, etc.) →
//     route chat. Calls /api/chat. The student is walking and
//     asking about the walk.

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
  // Route chat
  sendRouteChatMessage,
  startRouteChatSession,
  endRouteChatSession,
  // Doc chat
  sendDocChatMessage,
  startDocChatSession,
  endDocChatSession,
} from '@/services/api';
import { t } from '@/i18n';
import { COLORS, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';

// Quick-prompt chips for the doc chat. Tapping one fills the input
// with that question and sends it.
const DOC_QUICK_PROMPTS = [
  'When does the semester end?',
  'What are the library hours?',
  'How do I contact the dean?',
  'What are the exam rules?',
];

export default function ChatScreen() {
  const params = useLocalSearchParams();

  // Route context is present when opened from Walking Mode.
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

  // Start the right kind of session on mount.
  useEffect(() => {
    let cancelled = false;
    let startedSessionId = null;

    const start = hasRouteContext ? startRouteChatSession : startDocChatSession;
    const end = hasRouteContext ? endRouteChatSession : endDocChatSession;

    start()
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
        end(startedSessionId).catch(() => {});
      }
    };
  }, [hasRouteContext]);

  // Greeting, tailored to the mode.
  useEffect(() => {
    const greeting = hasRouteContext
      ? t('chat.greetingWalk')
      : t('chat.greetingDoc');
    setMessages([{ role: 'assistant', content: greeting }]);
  }, [hasRouteContext]);

  const send = useCallback(
    async (messageOverride) => {
      const message = (messageOverride ?? input).trim();
      if (!message || sending) return;

      setInput('');
      setError(null);
      setMessages((prev) => [...prev, { role: 'user', content: message }]);
      setSending(true);

      try {
        let response;
        if (hasRouteContext) {
          response = await sendRouteChatMessage({
            message,
            sessionId,
            fromPlaceId,
            toPlaceId,
            currentStepIndex,
            distanceFromStartM,
            currentLat,
            currentLon,
          });
        } else {
          response = await sendDocChatMessage({ message, sessionId });
        }

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
    },
    [
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
    ]
  );

  // Auto-scroll to the bottom when a new message arrives.
  useEffect(() => {
    const timeout = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
    return () => clearTimeout(timeout);
  }, [messages]);

  const showQuickPrompts = !hasRouteContext && messages.length <= 1;

  return (
    <>
      <Stack.Screen
        options={{
          title: hasRouteContext ? t('chat.titleWalk') : t('chat.titleDoc'),
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

        {/* Quick prompts for the doc chat, shown until the student
            has asked something. */}
        {showQuickPrompts ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.promptsRow}
            style={styles.promptsScroll}
          >
            {DOC_QUICK_PROMPTS.map((prompt) => (
              <TouchableOpacity
                key={prompt}
                style={styles.promptChip}
                onPress={() => send(prompt)}
                disabled={sending}
                accessibilityRole="button"
                accessibilityLabel={prompt}
              >
                <Text style={styles.promptText}>{prompt}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}

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
            placeholder={
              hasRouteContext ? t('chat.placeholderWalk') : t('chat.placeholderDoc')
            }
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
  promptsScroll: {
    flexGrow: 0,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSubtle,
  },
  promptsRow: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  promptChip: {
    backgroundColor: COLORS.backgroundSubtle,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: SPACING.sm,
  },
  promptText: {
    fontSize: FONT_SIZE.small,
    color: COLORS.text,
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