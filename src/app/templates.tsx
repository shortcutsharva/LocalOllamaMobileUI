import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useChatStore } from '../lib/store';
import { theme } from '../lib/theme';

const TEMPLATES = [
  {
    title: 'Product launch plan',
    prompt:
      'Help me create a product launch plan for a B2B SaaS tool. Include key steps, a 12-week timeline, and marketing ideas.',
  },
  {
    title: 'Marketing strategy',
    prompt: 'Help me create a B2B marketing strategy. Include positioning, channels, and a 90-day plan.',
  },
  {
    title: 'Competitor analysis',
    prompt: 'Help me analyze competitors. I will paste details — summarize key insights, strengths, and gaps.',
  },
  {
    title: 'Website copy ideas',
    prompt: 'Help me write hero section copy for my landing page. Suggest 5 headline and subheadline options.',
  },
  {
    title: 'User interview summary',
    prompt: 'I will paste user interview notes. Turn them into key themes, quotes, and action items.',
  },
  {
    title: 'Improve my writing',
    prompt: 'Improve the clarity, tone, and grammar of the text I paste next. Explain the key changes.',
  },
];

export default function TemplatesScreen() {
  const router = useRouter();

  const startFromTemplate = (prompt: string, title: string) => {
    const id = useChatStore.getState().newThread();
    useChatStore.getState().renameThread(id, title);
    useChatStore.getState().setPendingPrompt(prompt);
    router.push(`/chat/${id}`);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.container}>
        <Text style={styles.h1}>Templates</Text>
        <Text style={styles.sub}>Start a chat from a proven prompt.</Text>
        <FlatList
          data={TEMPLATES}
          keyExtractor={(t) => t.title}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => startFromTemplate(item.prompt, item.title)}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardPreview} numberOfLines={2}>
                {item.prompt}
              </Text>
            </Pressable>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  container: { flex: 1, paddingHorizontal: 18, paddingTop: 12 },
  h1: { fontSize: 28, fontWeight: '800', color: theme.text },
  sub: { fontSize: 14, color: theme.muted, marginTop: 4, marginBottom: 14 },
  list: { gap: 10, paddingBottom: 20 },
  card: { backgroundColor: theme.card, borderRadius: 14, padding: 14 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
  cardPreview: { fontSize: 13, color: theme.muted, marginTop: 4 },
});
