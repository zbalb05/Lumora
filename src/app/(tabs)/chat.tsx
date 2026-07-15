import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/animated-pressable';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BadgeColors, Brand, MaxContentWidth, Radius, Spacing, TabBarHeight } from '@/constants/theme';
import { clearMessages, createMessage, listMessages } from '@/db/queries/chat-messages';
import { getNoteByStudySet } from '@/db/queries/notes';
import { listStudySets } from '@/db/queries/study-sets';
import type { chatMessages, studySets } from '@/db/schema';
import { chat } from '@/services/gemini';
import { pullRemoteChanges, pushPendingChanges } from '@/services/sync';
import { useTheme } from '@/hooks/use-theme';
import { cleanChatText, splitParagraphs } from '@/utils/markdown';

type Attachment = { uri: string; mimeType: string; base64: string };

type StudySetRow = typeof studySets.$inferSelect;
type MessageRow = typeof chatMessages.$inferSelect;

const AnimatedThemedView = Animated.createAnimatedComponent(ThemedView);

const SUGGESTIONS = [
  {
    icon: '📄',
    badge: BadgeColors.purple,
    title: 'Summarize my notes',
    subtitle: 'Get the key points from this study set',
    prompt: 'Summarize the key points from my notes.',
  },
  {
    icon: '❓',
    badge: BadgeColors.blue,
    title: 'Quiz me',
    subtitle: 'Test yourself with a few quick questions',
    prompt: 'Quiz me on this material with a few questions.',
  },
  {
    icon: '💡',
    badge: BadgeColors.amber,
    title: 'Explain a concept',
    subtitle: "Ask me to break down anything you're stuck on",
    prompt: 'Can you explain ',
  },
] as const;

function ChatEmptyState({
  studySetTitle,
  onPickSuggestion,
}: {
  studySetTitle: string | null;
  onPickSuggestion: (prompt: string) => void;
}) {
  return (
    <View style={styles.emptyState}>
      <LinearGradient
        colors={Brand.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.emptyHero}>
        <View style={styles.emptyHeroIcon}>
          <ThemedText style={styles.emptyHeroEmoji}>🤖</ThemedText>
        </View>
        <ThemedText type="subtitle" style={styles.emptyHeroTitle}>
          Hey! How can I help you?
        </ThemedText>
        <ThemedText type="small" style={styles.emptyHeroSubtitle}>
          {studySetTitle
            ? `Ask me anything about ${studySetTitle}`
            : 'Ask a general question, or pick a study set above'}
        </ThemedText>
      </LinearGradient>

      <ThemedText type="smallBold" style={styles.emptyThingsLabel}>
        Things you can try
      </ThemedText>
      <View style={styles.suggestionList}>
        {SUGGESTIONS.map((s) => (
          <AnimatedPressable key={s.title} onPress={() => onPickSuggestion(s.prompt)}>
            <ThemedView type="backgroundElement" style={styles.suggestionCard}>
              <View style={[styles.suggestionIcon, { backgroundColor: s.badge.bg }]}>
                <ThemedText style={styles.suggestionEmoji}>{s.icon}</ThemedText>
              </View>
              <View style={styles.suggestionText}>
                <ThemedText type="smallBold">{s.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {s.subtitle}
                </ThemedText>
              </View>
            </ThemedView>
          </AnimatedPressable>
        ))}
      </View>
    </View>
  );
}

function MessageGroup({ item }: { item: MessageRow }) {
  const isUser = item.role === 'user';
  const paragraphs = splitParagraphs(cleanChatText(item.content));
  const body = paragraphs.length > 0 ? paragraphs : [''];

  if (isUser) {
    return (
      <View style={[styles.messageGroup, styles.messageGroupUser]}>
        <ThemedView type="backgroundSelected" style={[styles.bubble, styles.bubbleUser]}>
          {body.map((paragraph, i) => (
            <ThemedText key={i}>{paragraph}</ThemedText>
          ))}
        </ThemedView>
      </View>
    );
  }

  return (
    <View style={styles.messageGroup}>
      <View style={styles.roleRow}>
        <ThemedText style={styles.roleAvatar}>🤖</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          AI Tutor
        </ThemedText>
      </View>
      <View style={styles.assistantBody}>
        {body.map((paragraph, i) => (
          <ThemedText key={i}>{paragraph}</ThemedText>
        ))}
      </View>
    </View>
  );
}

function TypingBubble({ onCancel }: { onCancel: () => void }) {
  return (
    <View style={styles.messageGroup}>
      <View style={styles.roleRow}>
        <ThemedText style={styles.roleAvatar}>🤖</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          AI Tutor
        </ThemedText>
      </View>
      <View style={styles.typingRow}>
        <View style={styles.typingIndicator}>
          <ActivityIndicator size="small" />
        </View>
        <AnimatedPressable onPress={onCancel} hitSlop={8}>
          <ThemedView type="backgroundElement" style={styles.cancelButton}>
            <ThemedText type="small">Stop</ThemedText>
          </ThemedView>
        </AnimatedPressable>
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [studySetList, setStudySetList] = useState<StudySetRow[]>([]);
  const [studySetId, setStudySetId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [allChatsVisible, setAllChatsVisible] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const listRef = useRef<FlatList<MessageRow>>(null);
  const inputRef = useRef<TextInput>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const keyboard = useAnimatedKeyboard();
  const keyboardPadStyle = useAnimatedStyle(() => ({
    paddingBottom: keyboard.height.value,
  }));
  const inputRowStyle = useAnimatedStyle(() => ({
    paddingBottom:
      keyboard.height.value > 0 ? Spacing.three : Spacing.three + TabBarHeight + insets.bottom,
  }));

  useFocusEffect(
    useCallback(() => {
      listStudySets().then(setStudySetList);
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      listMessages(studySetId).then(setMessages);
    }, [studySetId])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await pushPendingChanges();
    await pullRemoteChanges();
    const [sets, msgs] = await Promise.all([listStudySets(), listMessages(studySetId)]);
    setStudySetList(sets);
    setMessages(msgs);
    setRefreshing(false);
  };

  useEffect(() => {
    const timeout = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(timeout);
  }, [messages.length, sending]);

  const handlePickAttachment = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    if (result.canceled) return;

    const asset = result.assets[0];
    const base64 = await readAsStringAsync(asset.uri, { encoding: EncodingType.Base64 });
    setAttachment({ uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg', base64 });
  };

  const handleDeleteChat = () => {
    if (messages.length === 0 || sending) return;
    Alert.alert('Delete this chat?', 'This deletes the current conversation. This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete chat',
        style: 'destructive',
        onPress: async () => {
          await clearMessages(studySetId);
          setMessages([]);
        },
      },
    ]);
  };

  const handleSend = async () => {
    const content = input.trim();
    if ((!content && !attachment) || sending) return;

    const sentAttachment = attachment;
    setInput('');
    setAttachment(null);
    setSending(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const userMessage = await createMessage(
      studySetId,
      'user',
      content || (sentAttachment ? '📎 Photo' : content)
    );
    setMessages((prev) => [...prev, userMessage]);

    try {
      const context = studySetId ? (await getNoteByStudySet(studySetId))?.markdown ?? null : null;
      const history = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const reply = await chat(
        context,
        history,
        sentAttachment ? { base64: sentAttachment.base64, mimeType: sentAttachment.mimeType } : undefined,
        controller.signal
      );
      const assistantMessage = await createMessage(studySetId, 'assistant', reply);
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      if (controller.signal.aborted) return;
      const errorMessage = await createMessage(
        studySetId,
        'assistant',
        error instanceof Error ? `Sorry, something went wrong: ${error.message}` : 'Sorry, something went wrong.'
      );
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      abortControllerRef.current = null;
      setSending(false);
    }
  };

  const handleCancelSend = () => {
    abortControllerRef.current?.abort();
  };

  const allThreads = [{ id: null, title: 'General' } as { id: string | null; title: string }, ...studySetList];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.topRow}>
          <AnimatedPressable
            onPress={() => setAllChatsVisible(true)}
            disabled={sending}
            hitSlop={8}
            style={[styles.allChatsButtonFlex, sending && styles.disabled]}>
            <ThemedView type="backgroundElement" style={styles.allChatsButton}>
              <Ionicons name="chatbubbles-outline" size={16} color={theme.text} />
              <ThemedText type="smallBold" numberOfLines={1} style={styles.allChatsButtonLabel}>
                {allThreads.find((item) => item.id === studySetId)?.title ?? 'General'}
              </ThemedText>
              <Ionicons name="chevron-down" size={14} color={theme.textSecondary} />
            </ThemedView>
          </AnimatedPressable>
          {messages.length > 0 && (
            <AnimatedPressable onPress={handleDeleteChat} hitSlop={8} style={styles.deleteChatButton}>
              <Ionicons name="trash-outline" size={18} color={Brand.danger} />
            </AnimatedPressable>
          )}
        </View>

        <Modal
          visible={allChatsVisible}
          animationType="fade"
          transparent
          onRequestClose={() => setAllChatsVisible(false)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setAllChatsVisible(false)}>
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <ThemedView type="backgroundElement" style={styles.modalCardInner}>
                <View style={styles.modalHeaderRow}>
                  <ThemedText type="smallBold">All chats</ThemedText>
                  <AnimatedPressable onPress={() => setAllChatsVisible(false)} hitSlop={8}>
                    <Ionicons name="close" size={20} color={theme.textSecondary} />
                  </AnimatedPressable>
                </View>
                <ScrollView style={styles.modalList} contentContainerStyle={styles.modalListContent}>
                  {allThreads.map((item) => (
                    <AnimatedPressable
                      key={item.id ?? 'general'}
                      onPress={() => {
                        setStudySetId(item.id);
                        setAllChatsVisible(false);
                      }}>
                      <ThemedView
                        type={studySetId === item.id ? 'backgroundSelected' : 'background'}
                        style={styles.modalRow}>
                        <ThemedText numberOfLines={1} style={styles.modalRowText}>
                          {item.title}
                        </ThemedText>
                        {studySetId === item.id && (
                          <Ionicons name="checkmark" size={18} color={Brand.accent} />
                        )}
                      </ThemedView>
                    </AnimatedPressable>
                  ))}
                </ScrollView>
              </ThemedView>
            </Pressable>
          </Pressable>
        </Modal>

        <Animated.View style={[styles.flex, keyboardPadStyle]}>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            style={styles.messagesList}
            contentContainerStyle={styles.messages}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={Brand.accent}
                colors={[Brand.accent]}
              />
            }
            ListEmptyComponent={
              <ChatEmptyState
                studySetTitle={studySetList.find((s) => s.id === studySetId)?.title ?? null}
                onPickSuggestion={(prompt) => {
                  setInput(prompt);
                  inputRef.current?.focus();
                }}
              />
            }
            ListFooterComponent={sending ? <TypingBubble onCancel={handleCancelSend} /> : null}
            renderItem={({ item }) => <MessageGroup item={item} />}
          />

          {attachment && (
            <ThemedView style={styles.attachmentPreview}>
              <Image source={{ uri: attachment.uri }} style={styles.attachmentThumb} />
              <AnimatedPressable onPress={() => setAttachment(null)} hitSlop={8}>
                <ThemedView type="backgroundSelected" style={styles.attachmentRemove}>
                  <ThemedText type="small">✕</ThemedText>
                </ThemedView>
              </AnimatedPressable>
            </ThemedView>
          )}

          <AnimatedThemedView style={[styles.inputRow, inputRowStyle]}>
            <AnimatedPressable onPress={handlePickAttachment} disabled={sending} hitSlop={8}>
              <ThemedView type="backgroundElement" style={styles.attachButton}>
                <ThemedText type="smallBold">+</ThemedText>
              </ThemedView>
            </AnimatedPressable>
            <ThemedView type="backgroundElement" style={styles.inputWrapper}>
              <TextInput
                ref={inputRef}
                value={input}
                onChangeText={setInput}
                placeholder="Ask your AI tutor…"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { color: theme.text }]}
                multiline
                editable={!sending}
              />
            </ThemedView>
            <AnimatedPressable
              onPress={handleSend}
              disabled={sending || (!input.trim() && !attachment)}
              hitSlop={12}>
              <View style={styles.sendButton}>
                {sending ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <ThemedText type="smallBold" style={styles.sendLabel}>
                    Send
                  </ThemedText>
                )}
              </View>
            </AnimatedPressable>
          </AnimatedThemedView>
        </Animated.View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  allChatsButtonFlex: {
    flex: 1,
  },
  disabled: {
    opacity: 0.5,
  },
  allChatsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
  },
  allChatsButtonLabel: {
    flexShrink: 1,
  },
  deleteChatButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: '#00000066',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
  },
  modalCardInner: {
    borderRadius: Radius.card,
    padding: Spacing.three,
    gap: Spacing.two,
    maxHeight: 420,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.one,
  },
  modalList: {
    flexGrow: 0,
  },
  modalListContent: {
    gap: Spacing.one,
    paddingVertical: Spacing.half,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  modalRowText: {
    flex: 1,
  },
  messagesList: {
    flex: 1,
  },
  messages: {
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  messageGroup: {
    gap: Spacing.one,
    alignItems: 'flex-start',
  },
  messageGroupUser: {
    alignItems: 'flex-end',
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.one,
  },
  roleAvatar: {
    fontSize: 14,
  },
  assistantBody: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  bubble: {
    padding: Spacing.three,
    borderRadius: Spacing.four,
    maxWidth: '85%',
    gap: Spacing.two,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  typingIndicator: {
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.one,
    alignItems: 'flex-start',
  },
  cancelButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.half,
    borderRadius: Radius.pill,
  },
  emptyState: {
    gap: Spacing.three,
  },
  emptyHero: {
    borderRadius: Radius.card,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
  },
  emptyHeroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyHeroEmoji: {
    fontSize: 28,
  },
  emptyHeroTitle: {
    color: '#FFFFFF',
    textAlign: 'center',
  },
  emptyHeroSubtitle: {
    color: '#F3E8FF',
    textAlign: 'center',
  },
  emptyThingsLabel: {
    paddingHorizontal: Spacing.one,
  },
  suggestionList: {
    gap: Spacing.two,
  },
  suggestionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.card,
  },
  suggestionIcon: {
    width: 44,
    height: 44,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionEmoji: {
    fontSize: 20,
  },
  suggestionText: {
    flex: 1,
    gap: Spacing.half,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  attachButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  attachmentThumb: {
    width: 48,
    height: 48,
    borderRadius: Spacing.two,
  },
  attachmentRemove: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWrapper: {
    flex: 1,
    borderRadius: Spacing.three,
  },
  input: {
    maxHeight: 120,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  sendButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    minWidth: 64,
    alignItems: 'center',
    backgroundColor: Brand.accent,
  },
  sendLabel: {
    color: '#FFFFFF',
  },
});
