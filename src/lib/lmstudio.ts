export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessageDTO {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatContentPart[];
}

export interface LMModel {
  id: string;
  owned_by?: string;
  created?: number;
}

export function normalizeBaseUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, '');
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  url = url.replace(/\/v1$/, '');
  return url;
}

export async function listModels(baseUrl: string, signal?: AbortSignal): Promise<LMModel[]> {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) throw new Error('Enter your LM Studio server URL first.');

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(`${base}/v1/models`, { method: 'GET', signal: controller.signal });
    if (!res.ok) throw new Error(`LM Studio responded with ${res.status}. Is the server running?`);
    const json = await res.json();
    return (json?.data ?? []) as LMModel[];
  } catch (error) {
    if (controller.signal.aborted) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      throw new Error('Connection timed out. Check the server URL and that LM Studio is running.');
    }
    if (error instanceof Error && error.message.startsWith('LM Studio responded with')) throw error;
    throw new Error(
      'Could not reach LM Studio. Check the IP/port, Wi-Fi, and that "Serve on local network" is on.',
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

interface SendChatArgs {
  baseUrl: string;
  model: string;
  messages: ChatMessageDTO[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onToken?: (token: string) => void;
}

export async function sendChatCompletion({
  baseUrl,
  model,
  messages,
  temperature = 0.7,
  maxTokens = 2048,
  signal,
  onToken,
}: SendChatArgs): Promise<string> {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) throw new Error('Set your LM Studio server URL in Settings.');
  if (!model) throw new Error('Pick a model for this chat first.');

  const body = JSON.stringify({
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: true,
  });

  let res: Response;
  try {
    res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal,
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e;
    throw new Error(
      'Could not reach LM Studio. Check the IP/port, Wi-Fi, and that "Serve on local network" is on.',
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      res.status === 404
        ? 'Endpoint not found. Enable the local server in LM Studio (Developer tab).'
        : `LM Studio error ${res.status}: ${text.slice(0, 200)}`,
    );
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('text/event-stream') || !res.body) {
    const json = await res.json().catch(() => null);
    const full = json?.choices?.[0]?.message?.content ?? '';
    if (onToken && full) onToken(full);
    return full;
  }

  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const event of events) {
      for (const line of event.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          const delta: string =
            json?.choices?.[0]?.delta?.content ?? json?.choices?.[0]?.message?.content ?? '';
          if (delta) {
            full += delta;
            onToken?.(delta);
          }
        } catch {
        }
      }
    }
    if (signal?.aborted) {
      await reader.cancel().catch(() => {});
      throw new DOMException('Aborted', 'AbortError');
    }
  }
  return full;
}

export async function checkConnection(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<{ ok: boolean; models: number }> {
  const models = await listModels(baseUrl, signal);
  return { ok: true, models: models.length };
}
