import { useLocalSearchParams } from 'expo-router';

export function useChatRouteId(): string | null {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  if (Array.isArray(id)) return id[0] ?? null;
  return id ?? null;
}
