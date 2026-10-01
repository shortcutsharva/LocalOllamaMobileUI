import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { timeAgo } from '../lib/format';
import { useChatStore } from '../lib/store';
import { theme } from '../lib/theme';

function lastUserPreview(messages: { role: string; content: string }[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  return lastUser ? lastUser.content.slice(0, 60) : 'New conversation';
}

export default function ChatsScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const threads = useChatStore((s) => s.threads);
  const newThread = useChatStore((s) => s.newThread);
  const selectThread = useChatStore((s) => s.selectThread);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...threads].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!q) return sorted;
    return sorted.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.messages.some((m) => m.content.toLowerCase().includes(q)),
    );
  }, [threads, query]);

  const openChat = (id: string) => {
    selectThread(id);
    router.push(`/chat/${id}`);
  };

  const startNew = () => {
    const id = newThread();
    router.push(`/chat/${id}`);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.h1}>Chats</Text>
          <Pressable style={styles.plus} onPress={startNew} hitSlop={10}>
            <Text style={styles.plusText}>＋</Text>
          </Pressable>
        </View>

        <View style={styles.search}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search chats..."
            placeholderTextColor={theme.faint}
          />
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <Pressable
              style={[styles.card, index === 0 && filtered.length > 1 && styles.cardActive]}
              onPress={() => openChat(item.id)}
            >
              <View style={styles.cardRow}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.cardTime}>{timeAgo(item.updatedAt)}</Text>
              </View>
              <Text style={styles.cardPreview} numberOfLines={1}>
                {lastUserPreview(item.messages)}
              </Text>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No chats yet</Text>
              <Text style={styles.emptySub}>Tap + to start your first conversation.</Text>
              <Pressable style={styles.emptyBtn} onPress={startNew}>
                <Text style={styles.emptyBtnText}>Start chatting</Text>
              </Pressable>
            </View>
          }
        />

        <View
          style={styles.tabbar}
          accessibilityRole="toolbar"
          accessibilityLabel="Main navigation"
        >
          <Pressable
            style={styles.tab}
            accessibilityRole="button"
            accessibilityState={{ selected: true }}
          >
            <Ionicons name="chatbubbles-outline" size={22} color={theme.text} />
            <Text style={[styles.tabLabel, styles.tabActiveLabel]}>Chats</Text>
          </Pressable>
          <Pressable
            style={styles.tab}
            onPress={() => router.push('/templates')}
            accessibilityRole="button"
            accessibilityState={{ selected: false }}
          >
            <Ionicons name="grid-outline" size={22} color={theme.faint} />
            <Text style={styles.tabLabel}>Templates</Text>
          </Pressable>
          <Link href="/settings" asChild>
            <Pressable
              style={styles.tab}
              accessibilityRole="button"
              accessibilityState={{ selected: false }}
            >
              <Ionicons name="settings-outline" size={22} color={theme.faint} />
              <Text style={styles.tabLabel}>Settings</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  container: { flex: 1, paddingHorizontal: 18 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 12,
  },
  h1: { fontSize: 32, fontWeight: '800', color: theme.text, letterSpacing: -0.5 },
  plus: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  plusText: { fontSize: 26, fontWeight: '300', color: theme.text },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.searchBg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 14,
  },
  searchIcon: { fontSize: 18, color: theme.faint },
  searchInput: { flex: 1, fontSize: 16, color: theme.text },
  list: { gap: 10, paddingBottom: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
  },
  cardActive: { backgroundColor: theme.card },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: theme.text, flex: 1 },
  cardTime: { fontSize: 12, color: theme.faint },
  cardPreview: { fontSize: 14, color: theme.muted, marginTop: 4 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
  emptySub: { fontSize: 14, color: theme.muted },
  emptyBtn: {
    marginTop: 12,
    backgroundColor: theme.text,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  emptyBtnText: { color: '#fff', fontWeight: '700' },
  tabbar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingTop: 8,
    paddingBottom: 4,
  },
  tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 4 },
  tabLabel: { fontSize: 11, color: theme.faint },
  tabActiveLabel: { color: theme.text, fontWeight: '700' },
});
