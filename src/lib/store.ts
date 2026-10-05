import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { deleteAttachmentFiles } from './attachments';

export type Role = 'user' | 'assistant';

export type AttachmentKind = 'image' | 'text';

export interface Attachment {
  id: string;
  kind: AttachmentKind;
  name: string;
  mimeType: string;
  /** kind === 'image': file:// URI inside the app document dir, so it survives restarts. */
  uri?: string;
  /** kind === 'text': extracted text (PDF or plain text source), already capped. */
  text?: string;
  sizeBytes?: number;
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  attachments?: Attachment[];
}

export interface ChatThread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  /** Per-chat model override. Undefined means fall back to settings.model. */
  model?: string;
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
  models: string[];
  modelsFetchedAt: number | null;
  streaming: boolean;
  pendingPrompt: string | null;
  setPendingPrompt: (v: string | null) => void;
  newThread: () => string;
  selectThread: (id: string | null) => void;
  deleteThread: (id: string) => void;
  renameThread: (id: string, title: string) => void;
  setThreadModel: (id: string, model: string | undefined) => void;
  setModels: (ids: string[]) => void;
  addMessage: (threadId: string, msg: Omit<ChatMessage, 'id' | 'createdAt'> & { id?: string }) => string;
  appendToMessage: (threadId: string, messageId: string, delta: string) => void;
  setSettings: (patch: Partial<Settings>) => void;
  setStreaming: (v: boolean) => void;
  clearAll: () => void;
  getActive: () => ChatThread | null;
}

const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

export function titleFromMessage(text: string, fallbackName?: string): string {
  const firstLine = text.split('\n')[0].trim().replace(/^#+\s*/, '');
  return (firstLine || fallbackName || 'New chat').slice(0, 42);
}

const attachmentsOf = (threads: ChatThread[]) =>
  threads.flatMap((t) => t.messages.flatMap((m) => m.attachments ?? []));

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
      models: [],
      modelsFetchedAt: null,
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

      deleteThread: (id) => {
        const target = get().threads.find((t) => t.id === id);
        if (target) void deleteAttachmentFiles(attachmentsOf([target]));
        set((s) => {
          const threads = s.threads.filter((t) => t.id !== id);
          const activeId = s.activeId === id ? (threads[0]?.id ?? null) : s.activeId;
          return { threads, activeId };
        });
      },

      renameThread: (id, title) =>
        set((s) => ({
          threads: s.threads.map((t) =>
            t.id === id ? { ...t, title: title.trim() || t.title, updatedAt: Date.now() } : t,
          ),
        })),

      setThreadModel: (id, model) =>
        set((s) => ({
          threads: s.threads.map((t) => (t.id === id ? { ...t, model } : t)),
        })),

      setModels: (ids) => set({ models: ids, modelsFetchedAt: Date.now() }),

      addMessage: (threadId, msg) => {
        const id = msg.id ?? uid();
        const message: ChatMessage = {
          id,
          role: msg.role,
          content: msg.content,
          createdAt: Date.now(),
          ...(msg.attachments && msg.attachments.length > 0
            ? { attachments: msg.attachments }
            : {}),
        };
        set((s) => ({
          threads: s.threads.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  updatedAt: Date.now(),
                  title:
                    t.messages.length === 0 && msg.role === 'user'
                      ? titleFromMessage(msg.content, msg.attachments?.[0]?.name)
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

      clearAll: () => {
        void deleteAttachmentFiles(attachmentsOf(get().threads));
        set({ threads: [], activeId: null });
      },

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
        models: s.models,
        modelsFetchedAt: s.modelsFetchedAt,
      }),
    },
  ),
);
