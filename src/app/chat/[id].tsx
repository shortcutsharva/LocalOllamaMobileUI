import { Feather, Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AssistantMessage } from '../../components/AssistantMessage';
import { sendChatCompletion, type ChatMessageDTO } from '../../lib/lmstudio';
import { useChatStore } from '../../lib/store';
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
  const listRef = useRef<FlatList>(null);

  const [input, setInput] = useState('');
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

  const threadId = routeId ?? activeId;

  const sendText = async (raw: string) => {
    const text = raw.trim();
    const tid = useChatStore.getState().activeId ?? routeId;
    if (!text || useChatStore.getState().streaming || !tid) return;
    setError(null);
    setInput('');
    const st = useChatStore.getState();
    st.addMessage(tid, { role: 'user', content: text });

    const current = useChatStore.getState().threads.find((t) => t.id === tid);
    const cfg = useChatStore.getState().settings;
    const history: ChatMessageDTO[] = [
      ...(cfg.systemPrompt.trim()
        ? [{ role: 'system' as const, content: cfg.systemPrompt.trim() }]
        : []),
      ...(current?.messages ?? []).map((m) => ({ role: m.role, content: m.content })),
    ];

    const assistantId = useChatStore.getState().addMessage(tid, { role: 'assistant', content: '' });
    st.setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const full = await sendChatCompletion({
        baseUrl: cfg.baseUrl,
        model: cfg.model,
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
        setError(e?.message ?? 'Something went wrong.');
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
      sendText(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt, routeId]);

  useEffect(() => {
    if (thread && thread.messages.length > 0) {
      const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      return () => clearTimeout(t);
    }
  }, [thread?.messages.length]);

  const copyText = async (text: string) => {
    await Clipboard.setStringAsync(text);
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
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
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

        {!settings.model && (
          <Pressable style={styles.banner} onPress={() => router.push('/settings')}>
            <Text style={styles.bannerText}>No model selected — tap to open Settings.</Text>
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
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) =>
              item.role === 'user' ? (
                <View style={styles.userRow}>
                  <View style={styles.userBubble}>
                    <Text style={styles.userText}>{item.content}</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.aiBlock}>
                  {item.content ? (
                    <AssistantMessage content={item.content} />
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

        <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          <View style={styles.composer}>
            <Pressable
              style={styles.attachBtn}
              hitSlop={8}
              onPress={() => Alert.alert('Attachments', 'File attachments are not supported yet.')}
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
                style={[styles.sendBtn, !input.trim() && styles.sendIdle]}
                onPress={() => sendText(input)}
                disabled={!input.trim()}
              >
                <Ionicons name="arrow-up" size={20} color="#fff" />
              </Pressable>
            )}
          </View>
        </View>

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
      </KeyboardAvoidingView>
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
  list: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 20, gap: 18 },
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
