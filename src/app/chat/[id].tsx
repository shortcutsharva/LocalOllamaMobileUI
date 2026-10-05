import { Feather, Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { KeyboardStickyView, useKeyboardState } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AssistantMessage } from '../../components/AssistantMessage';
import {
  isPdfExtractionAvailable,
  pickDocument,
  pickImage,
  takePhoto,
  toRequestContent,
} from '../../lib/attachments';
import { listModels, sendChatCompletion, type ChatMessageDTO } from '../../lib/lmstudio';
import { useChatStore, type Attachment, type ChatMessage } from '../../lib/store';
import { theme } from '../../lib/theme';
import { useChatRouteId } from './useChatId';

const SUGGESTIONS = [
  'Create a product launch plan',
  'Brainstorm marketing ideas',
  'Summarize a document',
  'Improve my writing',
];

export default function ChatDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const routeId = useChatRouteId();
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const keyboardVisible = useKeyboardState((s) => s.isVisible);

  const [input, setInput] = useState('');
  const [composerHeight, setComposerHeight] = useState(0);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachSheetOpen, setAttachSheetOpen] = useState(false);
  const [attachBusy, setAttachBusy] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameText, setRenameText] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const thread = useChatStore((s) => s.threads.find((t) => t.id === routeId) ?? null);
  const activeId = useChatStore((s) => s.activeId);
  const settings = useChatStore((s) => s.settings);
  const streaming = useChatStore((s) => s.streaming);
  const pendingPrompt = useChatStore((s) => s.pendingPrompt);
  const models = useChatStore((s) => s.models);
  const publishModels = useChatStore((s) => s.setModels);
  const setThreadModel = useChatStore((s) => s.setThreadModel);

  const threadId = routeId ?? activeId;
  const effectiveModel = thread?.model ?? settings.model;

  const sendText = async (raw: string) => {
    const text = raw.trim();
    const tid = useChatStore.getState().activeId ?? routeId;
    const outgoing = attachments;
    if ((!text && outgoing.length === 0) || useChatStore.getState().streaming || !tid) return;
    setError(null);
    setInput('');
    setAttachments([]);
    const st = useChatStore.getState();
    st.addMessage(tid, { role: 'user', content: text, attachments: outgoing });

    const current = useChatStore.getState().threads.find((t) => t.id === tid);
    const cfg = useChatStore.getState().settings;
    const history: ChatMessageDTO[] = [];
    if (cfg.systemPrompt.trim()) {
      history.push({ role: 'system', content: cfg.systemPrompt.trim() });
    }
    for (const m of current?.messages ?? []) {
      history.push({ role: m.role, content: await toRequestContent(m.content, m.attachments) });
    }

    const assistantId = useChatStore.getState().addMessage(tid, { role: 'assistant', content: '' });
    st.setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const full = await sendChatCompletion({
        baseUrl: cfg.baseUrl,
        model: current?.model ?? cfg.model,
        messages: history,
        temperature: cfg.temperature,
        signal: controller.signal,
        onToken: (token) => st.appendToMessage(tid, assistantId, token),
      });
      if (!full) st.appendToMessage(tid, assistantId, 'The model returned an empty response.');
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        st.appendToMessage(tid, assistantId, '\n\n*Stopped.*');
      } else {
        const message = e?.message ?? 'Something went wrong.';
        const sentImages = outgoing.some((a) => a.kind === 'image');
        setError(
          sentImages && /image|vision|multimodal|content/i.test(message)
            ? `${message} This model may not accept images — try a vision-capable model.`
            : message,
        );
      }
    } finally {
      st.setStreaming(false);
      abortRef.current = null;
    }
  };

  useEffect(() => {
    if (routeId) useChatStore.getState().selectThread(routeId);
  }, [routeId]);

  useEffect(() => {
    if (pendingPrompt && routeId && !streaming) {
      const p = pendingPrompt;
      useChatStore.getState().setPendingPrompt(null);
      const t = setTimeout(() => void sendText(p), 0);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt, routeId]);

  useEffect(() => {
    if (thread && thread.messages.length > 0) {
      const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      return () => clearTimeout(t);
    }
  }, [thread?.messages.length]);

  useEffect(() => {
    if (!keyboardVisible) return;
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    return () => clearTimeout(t);
  }, [keyboardVisible]);

  const copyText = async (text: string) => {
    await Clipboard.setStringAsync(text);
  };

  const runAttachmentPick = async (pick: () => Promise<Attachment | null>) => {
    setAttachSheetOpen(false);
    setAttachBusy(true);
    setError(null);
    try {
      const attachment = await pick();
      if (attachment) setAttachments((prev) => [...prev, attachment]);
    } catch (e) {
      const err = e as { message?: string; code?: string };
      const passwordIssue =
        err?.code === 'PASSWORD_REQUIRED' || err?.code === 'INCORRECT_PASSWORD';
      setError(
        passwordIssue
          ? 'That PDF is password-protected. Save an unlocked copy and attach that instead.'
          : err?.message ?? 'Could not attach that file.',
      );
    } finally {
      setAttachBusy(false);
    }
  };

  const loadModels = async () => {
    const baseUrl = useChatStore.getState().settings.baseUrl;
    if (!baseUrl) return;
    setModelsLoading(true);
    setError(null);
    try {
      const list = await listModels(baseUrl);
      publishModels(list.map((m) => m.id));
      if (list.length === 0) {
        setError('No models found. Load a model in LM Studio, then refresh.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load models.');
    } finally {
      setModelsLoading(false);
    }
  };

  const openModelPicker = () => {
    setModelPickerOpen(true);
    if (models.length === 0) void loadModels();
  };

  if (!thread) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.centerText}>Chat not found.</Text>
          <Pressable style={styles.pill} onPress={() => router.replace('/')}>
            <Text style={styles.pillText}>Back to chats</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const isEmpty = thread.messages.length === 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerBtn}>
            <Ionicons name="chevron-back" size={24} color={theme.text} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {thread.title}
          </Text>
          <Pressable onPress={() => setMenuOpen(true)} hitSlop={10} style={styles.headerBtn}>
            <Ionicons name="ellipsis-horizontal" size={22} color={theme.text} />
          </Pressable>
        </View>

        <Pressable style={styles.modelBar} onPress={openModelPicker}>
          <Ionicons name="hardware-chip-outline" size={13} color={theme.faint} />
          <Text style={styles.modelBarText} numberOfLines={1}>
            {effectiveModel || 'Select a model'}
          </Text>
          {thread.model ? (
            <View style={styles.modelBarTag}>
              <Text style={styles.modelBarTagText}>this chat</Text>
            </View>
          ) : null}
          <Ionicons name="chevron-down" size={13} color={theme.faint} />
        </Pressable>

        {!effectiveModel && (
          <Pressable style={styles.banner} onPress={openModelPicker}>
            <Text style={styles.bannerText}>No model selected — tap to choose one.</Text>
          </Pressable>
        )}
        {error && (
          <Pressable style={styles.error} onPress={() => setError(null)}>
            <Text style={styles.errorText}>{error} (tap to dismiss)</Text>
          </Pressable>
        )}

        {isEmpty ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="chatbubble-outline" size={28} color={theme.muted} />
            </View>
            <Text style={styles.emptyTitle}>How can I help you?</Text>
            <Text style={styles.emptySub}>Ask a question, get ideas, write, analyze, and more.</Text>
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <Pressable key={s} style={styles.suggestPill} onPress={() => sendText(s)}>
                  <Text style={styles.suggestText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={thread.messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={[
              styles.list,
              { paddingBottom: keyboardVisible ? composerHeight + 20 : 20 },
            ]}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item, index }) =>
              item.role === 'user' ? (
                <View style={styles.userRow}>
                  <View style={styles.userBubble}>
                    {item.attachments?.length ? (
                      <View style={styles.bubbleAttachments}>
                        {item.attachments.map((attachment) =>
                          attachment.kind === 'image' && attachment.uri ? (
                            <Image
                              key={attachment.id}
                              source={{ uri: attachment.uri }}
                              style={styles.bubbleImage}
                            />
                          ) : (
                            <View key={attachment.id} style={styles.bubbleFile}>
                              <Ionicons
                                name={
                                  attachment.mimeType === 'application/pdf'
                                    ? 'document-text-outline'
                                    : 'document-outline'
                                }
                                size={13}
                                color={theme.muted}
                              />
                              <Text style={styles.bubbleFileText} numberOfLines={1}>
                                {attachment.name}
                              </Text>
                            </View>
                          ),
                        )}
                      </View>
                    ) : null}
                    {item.content ? <Text style={styles.userText}>{item.content}</Text> : null}
                  </View>
                </View>
              ) : (
                <View style={styles.aiBlock}>
                  {item.content ? (
                    <AssistantMessage
                      content={item.content}
                      streaming={streaming && index === thread.messages.length - 1}
                    />
                  ) : (
                    <ActivityIndicator size="small" color={theme.muted} />
                  )}
                  {!!item.content && !streaming && (
                    <Pressable onPress={() => copyText(item.content)} hitSlop={8}>
                      <Text style={styles.copyLink}>Copy</Text>
                    </Pressable>
                  )}
                </View>
              )
            }
          />
        )}

        <KeyboardStickyView>
          <View
            style={[
              styles.composerWrap,
              { paddingBottom: keyboardVisible ? 10 : Math.max(insets.bottom, 14) },
            ]}
            onLayout={(e: LayoutChangeEvent) => setComposerHeight(e.nativeEvent.layout.height)}
          >
            {attachments.length > 0 && (
              <View style={styles.chipStrip}>
                {attachments.map((attachment) => (
                  <View key={attachment.id} style={styles.chip}>
                    {attachment.kind === 'image' && attachment.uri ? (
                      <Image source={{ uri: attachment.uri }} style={styles.chipImage} />
                    ) : (
                      <Ionicons name="document-outline" size={13} color={theme.muted} />
                    )}
                    <Text style={styles.chipText} numberOfLines={1}>
                      {attachment.name}
                    </Text>
                    <Pressable
                      hitSlop={8}
                      onPress={() =>
                        setAttachments((prev) => prev.filter((a) => a.id !== attachment.id))
                      }
                    >
                      <Ionicons name="close-circle" size={16} color={theme.faint} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
            {attachBusy && (
              <View style={styles.attachBusy}>
                <ActivityIndicator size="small" color={theme.muted} />
                <Text style={styles.attachBusyText}>Reading attachment…</Text>
              </View>
            )}
            <View style={styles.composer}>
              <Pressable
                style={styles.attachBtn}
                hitSlop={8}
                onPress={() => setAttachSheetOpen(true)}
              >
                <Feather name="paperclip" size={20} color={theme.muted} />
              </Pressable>
              <TextInput
                style={styles.textInput}
                value={input}
                onChangeText={setInput}
                placeholder="Message..."
                placeholderTextColor={theme.faint}
                multiline
                maxLength={8000}
                editable={!streaming}
              />
              {streaming ? (
                <Pressable
                  style={[styles.sendBtn, styles.stopBtn]}
                  onPress={() => abortRef.current?.abort()}
                >
                  <Ionicons name="square" size={14} color="#fff" />
                </Pressable>
              ) : (
                <Pressable
                  style={[
                    styles.sendBtn,
                    !input.trim() && attachments.length === 0 && styles.sendIdle,
                  ]}
                  onPress={() => sendText(input)}
                  disabled={!input.trim() && attachments.length === 0}
                >
                  <Ionicons name="arrow-up" size={20} color="#fff" />
                </Pressable>
              )}
            </View>
          </View>
        </KeyboardStickyView>

        <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
          <Pressable style={styles.menuOverlay} onPress={() => setMenuOpen(false)}>
            <View style={styles.menu}>
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  setMenuOpen(false);
                  setRenameText(thread.title);
                  setRenameOpen(true);
                }}
              >
                <Text style={styles.menuText}>Rename</Text>
              </Pressable>
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  const all = thread.messages.map((m) => `${m.role}: ${m.content}`).join('\n\n');
                  copyText(all);
                  setMenuOpen(false);
                }}
              >
                <Text style={styles.menuText}>Copy conversation</Text>
              </Pressable>
              <Pressable
                style={[styles.menuItem, styles.menuLast]}
                onPress={() => {
                  setMenuOpen(false);
                  Alert.alert('Delete this chat?', thread.title, [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => {
                        useChatStore.getState().deleteThread(thread.id);
                        router.replace('/');
                      },
                    },
                  ]);
                }}
              >
                <Text style={[styles.menuText, styles.menuDanger]}>Delete</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>

        <Modal
          visible={renameOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setRenameOpen(false)}
        >
          <View style={styles.renameOverlay}>
            <View style={styles.renameCard}>
              <Text style={styles.renameTitle}>Rename chat</Text>
              <TextInput
                style={styles.renameInput}
                value={renameText}
                onChangeText={setRenameText}
                autoFocus
                maxLength={60}
              />
              <View style={styles.renameRow}>
                <Pressable style={styles.renameCancel} onPress={() => setRenameOpen(false)}>
                  <Text style={styles.renameCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={styles.renameSave}
                  onPress={() => {
                    useChatStore.getState().renameThread(thread.id, renameText);
                    setRenameOpen(false);
                  }}
                >
                  <Text style={styles.renameSaveText}>Save</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={attachSheetOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setAttachSheetOpen(false)}
        >
          <Pressable style={styles.sheetOverlay} onPress={() => setAttachSheetOpen(false)}>
            <View style={styles.sheet}>
              <Pressable style={styles.sheetItem} onPress={() => runAttachmentPick(pickImage)}>
                <Ionicons name="image-outline" size={18} color={theme.text} />
                <Text style={styles.sheetText}>Photo library</Text>
              </Pressable>
              <Pressable style={styles.sheetItem} onPress={() => runAttachmentPick(takePhoto)}>
                <Ionicons name="camera-outline" size={18} color={theme.text} />
                <Text style={styles.sheetText}>Take photo</Text>
              </Pressable>
              <Pressable
                style={styles.sheetItem}
                onPress={() => runAttachmentPick(() => pickDocument())}
              >
                <Ionicons name="document-outline" size={18} color={theme.text} />
                <Text style={styles.sheetText}>
                  {isPdfExtractionAvailable() ? 'Document or PDF' : 'Text file'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>

        <Modal
          visible={modelPickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setModelPickerOpen(false)}
        >
          <View style={styles.modelOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setModelPickerOpen(false)} />
            <View style={styles.modelSheet}>
              <View style={styles.modelSheetHeader}>
                <Text style={styles.modelSheetTitle}>Model for this chat</Text>
                <Pressable hitSlop={8} onPress={() => void loadModels()}>
                  <Text style={styles.modelRefresh}>
                    {modelsLoading ? 'Refreshing…' : 'Refresh'}
                  </Text>
                </Pressable>
              </View>

              {modelsLoading && models.length === 0 ? (
                <View style={styles.modelSheetLoading}>
                  <ActivityIndicator size="small" color={theme.muted} />
                </View>
              ) : (
                <FlatList
                  data={models}
                  keyExtractor={(m) => m}
                  style={styles.modelList}
                  ListEmptyComponent={
                    <Text style={styles.modelEmpty}>
                      No models found. Load one in LM Studio, then refresh.
                    </Text>
                  }
                  renderItem={({ item }) => {
                    const selected = effectiveModel === item;
                    return (
                      <Pressable
                        style={[styles.modelRow, selected && styles.modelSelected]}
                        onPress={() => {
                          setThreadModel(thread.id, item);
                          setModelPickerOpen(false);
                        }}
                      >
                        <Text style={[styles.modelText, selected && styles.modelTextSelected]}>
                          {selected ? `● ${item}` : `○ ${item}`}
                        </Text>
                      </Pressable>
                    );
                  }}
                />
              )}

              {thread.model ? (
                <Pressable
                  style={styles.modelDefault}
                  onPress={() => {
                    setThreadModel(thread.id, undefined);
                    setModelPickerOpen(false);
                  }}
                >
                  <Text style={styles.modelDefaultText}>
                    Use default{settings.model ? ` (${settings.model})` : ''}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  centerText: { color: theme.muted, fontSize: 16 },
  pill: { backgroundColor: theme.text, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10 },
  pillText: { color: '#fff', fontWeight: '700' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: theme.text },
  banner: { marginHorizontal: 16, backgroundColor: theme.accentSoft, borderRadius: 10, padding: 10 },
  bannerText: { color: theme.text, fontSize: 13 },
  error: { marginHorizontal: 16, marginTop: 8, backgroundColor: '#FDECEC', borderRadius: 8, padding: 10 },
  errorText: { color: theme.danger, fontSize: 13 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 26, fontWeight: '800', color: theme.text, letterSpacing: -0.3 },
  emptySub: { fontSize: 14, color: theme.muted, marginTop: 8, textAlign: 'center' },
  suggestions: { marginTop: 28, gap: 10, alignItems: 'center' },
  suggestPill: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  suggestText: { fontSize: 14, color: theme.text },
  list: { paddingHorizontal: 18, paddingTop: 8, gap: 18 },
  userRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  userBubble: {
    backgroundColor: theme.userBubble,
    borderRadius: 16,
    borderTopRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 11,
    maxWidth: '85%',
  },
  userText: { color: theme.text, fontSize: 15, lineHeight: 22 },
  aiBlock: { paddingRight: 8 },
  copyLink: { color: theme.faint, fontSize: 12, marginTop: 2 },
  bubbleAttachments: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  bubbleImage: { width: 132, height: 132, borderRadius: 10 },
  bubbleFile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    maxWidth: 200,
  },
  bubbleFileText: { flexShrink: 1, fontSize: 12, color: theme.muted },
  modelBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 14,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    backgroundColor: theme.card,
  },
  modelBarText: { flex: 1, fontSize: 12, color: theme.muted },
  modelBarTag: {
    backgroundColor: theme.accentSoft,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  modelBarTagText: { fontSize: 10, color: theme.accent, fontWeight: '700' },
  chipStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 200,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  chipImage: { width: 22, height: 22, borderRadius: 4 },
  chipText: { flexShrink: 1, fontSize: 12, color: theme.muted },
  attachBusy: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 8 },
  attachBusyText: { fontSize: 12, color: theme.muted },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    paddingBottom: 26,
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  sheetText: { fontSize: 15, color: theme.text },
  modelOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    padding: 24,
  },
  modelSheet: { backgroundColor: '#fff', borderRadius: 14, padding: 16, maxHeight: '70%' },
  modelSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  modelSheetTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
  modelRefresh: { fontSize: 13, color: theme.accent, fontWeight: '600' },
  modelSheetLoading: { paddingVertical: 24, alignItems: 'center' },
  modelList: { flexGrow: 0 },
  modelEmpty: { fontSize: 13, color: theme.muted, paddingVertical: 8 },
  modelRow: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  modelSelected: { borderColor: theme.accent, backgroundColor: theme.accentSoft },
  modelText: { color: theme.text, fontSize: 14 },
  modelTextSelected: { fontWeight: '700' },
  modelDefault: { paddingVertical: 10, alignItems: 'center' },
  modelDefaultText: { color: theme.muted, fontWeight: '600' },
  composerWrap: { paddingHorizontal: 14, paddingTop: 8, backgroundColor: theme.bg },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 26,
    backgroundColor: '#fff',
    paddingLeft: 6,
    paddingRight: 6,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  attachBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  textInput: { flex: 1, fontSize: 16, maxHeight: 120, paddingHorizontal: 6, paddingVertical: 8, color: theme.text },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIdle: { backgroundColor: theme.sendIdle },
  stopBtn: { backgroundColor: theme.danger },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.15)', justifyContent: 'flex-start', alignItems: 'flex-end', paddingTop: 90, paddingRight: 16 },
  menu: { backgroundColor: '#fff', borderRadius: 12, minWidth: 200, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, elevation: 5, overflow: 'hidden' },
  menuItem: { paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: theme.border },
  menuLast: { borderBottomWidth: 0 },
  menuText: { fontSize: 15, color: theme.text },
  menuDanger: { color: theme.danger },
  renameOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  renameCard: { backgroundColor: '#fff', borderRadius: 14, padding: 18, width: '100%', gap: 12 },
  renameTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
  renameInput: { borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: 12, fontSize: 15, color: theme.text },
  renameRow: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  renameCancel: { paddingHorizontal: 14, paddingVertical: 10 },
  renameCancelText: { color: theme.muted, fontWeight: '600' },
  renameSave: { backgroundColor: theme.text, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 10 },
  renameSaveText: { color: '#fff', fontWeight: '700' },
});
