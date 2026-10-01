import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { checkConnection, listModels, normalizeBaseUrl, type LMModel } from '../lib/lmstudio';
import { useChatStore } from '../lib/store';
import { theme } from '../lib/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const settings = useChatStore((s) => s.settings);
  const setSettings = useChatStore((s) => s.setSettings);
  const clearAll = useChatStore((s) => s.clearAll);

  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [systemPrompt, setSystemPrompt] = useState(settings.systemPrompt);
  const [temperature, setTemperature] = useState(String(settings.temperature));
  const [models, setModels] = useState<LMModel[]>([]);
  const [loading, setLoading] = useState<'test' | 'refresh' | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestController = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      requestController.current?.abort();
      requestController.current = null;
    },
    [],
  );

  const save = () => {
    const temp = Math.min(2, Math.max(0, Number(temperature) || 0.7));
    setSettings({
      baseUrl: normalizeBaseUrl(baseUrl),
      systemPrompt,
      temperature: temp,
    });
    setStatus('Saved. Base URL is normalized (trailing /v1 removed).');
    setTimeout(() => setStatus(null), 3000);
  };

  const refreshModels = async () => {
    if (loading) return;
    const controller = new AbortController();
    requestController.current = controller;
    setLoading('refresh');
    setError(null);
    setStatus(null);
    try {
      const url = normalizeBaseUrl(baseUrl || settings.baseUrl);
      const list = await listModels(url, controller.signal);
      if (controller.signal.aborted) return;
      setModels(list);
      setSettings({ baseUrl: url });
      if (list.length > 0 && !list.some((m) => m.id === settings.model)) {
        setSettings({ model: list[0].id });
      }
      setStatus(`Models refreshed. Found ${list.length} model(s).`);
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e instanceof Error ? e.message : 'Connection failed.');
      }
    } finally {
      if (requestController.current === controller) {
        requestController.current = null;
        setLoading(null);
      }
    }
  };

  const testConnection = async () => {
    if (loading) return;
    const controller = new AbortController();
    requestController.current = controller;
    setLoading('test');
    setError(null);
    setStatus(null);
    try {
      const result = await checkConnection(baseUrl || settings.baseUrl, controller.signal);
      if (!controller.signal.aborted) {
        setStatus(`Server reachable. ${result.models} model(s) available.`);
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e instanceof Error ? e.message : 'Connection failed.');
      }
    } finally {
      if (requestController.current === controller) {
        requestController.current = null;
        setLoading(null);
      }
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.h1}>Connect to LM Studio</Text>
        <Text style={styles.body}>
          On your PC: LM Studio → Developer tab → Start Server (default port 1234). Enable "Serve
          on local network". Use your PC's LAN IP, e.g. http://192.168.1.10:1234. Your phone must
          be on the same Wi-Fi.
        </Text>

        <Text style={styles.label}>Server URL</Text>
        <TextInput
          accessibilityLabel="Server URL"
          style={styles.input}
          value={baseUrl}
          onChangeText={setBaseUrl}
          placeholder="http://192.168.1.10:1234"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />

        <View style={styles.row}>
          <Pressable
            style={[styles.primary, loading && styles.buttonDisabled]}
            onPress={testConnection}
            disabled={loading !== null}
            accessibilityRole="button"
            accessibilityState={{ disabled: loading !== null, busy: loading === 'test' }}
          >
            <Text style={styles.primaryText}>Test connection</Text>
          </Pressable>
          <Pressable
            style={[styles.secondary, loading && styles.buttonDisabled]}
            onPress={refreshModels}
            disabled={loading !== null}
            accessibilityRole="button"
            accessibilityState={{ disabled: loading !== null, busy: loading === 'refresh' }}
          >
            <Text style={styles.secondaryText}>Refresh models</Text>
          </Pressable>
        </View>

        {loading && (
          <View style={styles.progress} accessibilityRole="progressbar">
            <ActivityIndicator />
            <Text style={styles.progressText}>
              {loading === 'test' ? 'Testing connection…' : 'Refreshing models…'}
            </Text>
          </View>
        )}
        <View accessibilityLiveRegion="polite">
          {status && <Text style={styles.status}>{status}</Text>}
          {error && <Text style={styles.error}>{error}</Text>}
        </View>

        <Text style={styles.label}>Model ({models.length})</Text>
        {models.map((m) => {
          const selected = settings.model === m.id;
          return (
            <Pressable
              key={m.id}
              style={[styles.modelRow, selected && styles.modelSelected]}
              onPress={() => setSettings({ model: m.id })}
            >
              <Text style={[styles.modelText, selected && styles.modelTextSelected]}>
                {selected ? '● ' : '○ '}{m.id}
              </Text>
            </Pressable>
          );
        })}
        {models.length === 0 && !loading && (
          <Text style={styles.body}>No models yet — load one in LM Studio, then refresh.</Text>
        )}

        <Text style={styles.label}>System prompt</Text>
        <TextInput
          accessibilityLabel="System prompt"
          style={[styles.input, styles.multiline]}
          value={systemPrompt}
          onChangeText={setSystemPrompt}
          multiline
          placeholder="You are a helpful assistant."
        />

        <Text style={styles.label}>Temperature (0 – 2)</Text>
        <TextInput
          accessibilityLabel="Temperature, 0 to 2"
          style={styles.input}
          value={temperature}
          onChangeText={setTemperature}
          keyboardType="decimal-pad"
          placeholder="0.7"
        />

        <Pressable style={styles.primary} onPress={save}>
          <Text style={styles.primaryText}>Save settings</Text>
        </Pressable>

        <Pressable
          style={styles.danger}
          onPress={clearAll}
        >
          <Text style={styles.dangerText}>Delete all chats</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  container: { padding: 16, gap: 10, paddingBottom: 40 },
  back: { fontSize: 16, color: theme.muted, marginBottom: 4 },
  h1: { fontSize: 20, fontWeight: '800', color: theme.text },
  body: { fontSize: 14, color: theme.muted, lineHeight: 20 },
  label: { fontSize: 13, fontWeight: '700', color: theme.muted, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#fff',
    color: theme.text,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 10, marginTop: 10 },
  primary: {
    flex: 1,
    backgroundColor: theme.text,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontWeight: '700' },
  secondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    backgroundColor: theme.sidebarBg,
  },
  secondaryText: { color: theme.text, fontWeight: '700' },
  buttonDisabled: { opacity: 0.55 },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  progressText: { color: theme.muted, fontSize: 13 },
  status: { color: theme.accent, fontSize: 13 },
  error: { color: theme.danger, fontSize: 13 },
  modelRow: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
  },
  modelSelected: { borderColor: theme.accent, backgroundColor: theme.accentSoft },
  modelText: { color: theme.text, fontSize: 14 },
  modelTextSelected: { fontWeight: '700' },
  danger: { marginTop: 16, padding: 12, alignItems: 'center' },
  dangerText: { color: theme.danger, fontWeight: '700' },
});
