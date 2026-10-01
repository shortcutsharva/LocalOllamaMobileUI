import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type Role = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
}

export interface ChatThread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface Settings {
  baseUrl: string;
  model: string;
  systemPrompt: string;
  temperature: number;
}

interface ChatState {
  threads: ChatThread[];
  activeId: string | null;
  settings: Settings;
  streaming: boolean;
  pendingPrompt: string | null;
  setPendingPrompt: (v: string | null) => void;
  newThread: () => string;
  selectThread: (id: string | null) => void;
  deleteThread: (id: string) => void;
  renameThread: (id: string, title: string) => void;
  addMessage: (threadId: string, msg: Omit<ChatMessage, 'id' | 'createdAt'> & { id?: string }) => string;
  appendToMessage: (threadId: string, messageId: string, delta: string) => void;
  setSettings: (patch: Partial<Settings>) => void;
  setStreaming: (v: boolean) => void;
  clearAll: () => void;
  getActive: () => ChatThread | null;
}

const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

export function titleFromMessage(text: string): string {
  const firstLine = text.split('\n')[0].trim().replace(/^#+\s*/, '');
  return (firstLine || 'New chat').slice(0, 42);
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      threads: [],
      activeId: null,
      settings: {
        baseUrl: 'http://192.168.1.2:1234',
        model: '',
        systemPrompt: 'You are a helpful assistant.',
        temperature: 0.7,
      },
      streaming: false,
      pendingPrompt: null,

      setPendingPrompt: (v) => set({ pendingPrompt: v }),

      newThread: () => {
        const id = uid();
        const now = Date.now();
        const thread: ChatThread = {
          id,
          title: 'New chat',
          createdAt: now,
          updatedAt: now,
          messages: [],
        };
        set((s) => ({ threads: [thread, ...s.threads], activeId: id }));
        return id;
      },

      selectThread: (id) => set({ activeId: id }),

      deleteThread: (id) =>
        set((s) => {
          const threads = s.threads.filter((t) => t.id !== id);
          const activeId = s.activeId === id ? (threads[0]?.id ?? null) : s.activeId;
          return { threads, activeId };
        }),

      renameThread: (id, title) =>
        set((s) => ({
          threads: s.threads.map((t) =>
            t.id === id ? { ...t, title: title.trim() || t.title, updatedAt: Date.now() } : t,
          ),
        })),

      addMessage: (threadId, msg) => {
        const id = msg.id ?? uid();
        const message: ChatMessage = {
          id,
          role: msg.role,
          content: msg.content,
          createdAt: Date.now(),
        };
        set((s) => ({
          threads: s.threads.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  updatedAt: Date.now(),
                  title:
                    t.messages.length === 0 && msg.role === 'user'
                      ? titleFromMessage(msg.content)
                      : t.title,
                  messages: [...t.messages, message],
                }
              : t,
          ),
        }));
        return id;
      },

      appendToMessage: (threadId, messageId, delta) =>
        set((s) => ({
          threads: s.threads.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  updatedAt: Date.now(),
                  messages: t.messages.map((m) =>
                    m.id === messageId ? { ...m, content: m.content + delta } : m,
                  ),
                }
              : t,
          ),
        })),

      setSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),

      setStreaming: (v) => set({ streaming: v }),

      clearAll: () => set({ threads: [], activeId: null }),

      getActive: () => {
        const { threads, activeId } = get();
        return threads.find((t) => t.id === activeId) ?? null;
      },
    }),
    {
      name: 'local-llm-chat-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        threads: s.threads,
        activeId: s.activeId,
        settings: s.settings,
      }),
    },
  ),
);
