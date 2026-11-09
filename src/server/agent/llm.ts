/**
 * Minimal client for any OpenAI-compatible chat-completions endpoint.
 *
 * Provider, model and key come from the environment, so moving between Gemini, Groq,
 * OpenRouter or a local Ollama is a config change, not a code change.
 */

export type ToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
  /**
   * Anything else the provider attached to the call. Gemini 3 puts its `thought_signature`
   * here and rejects the next request if the call is sent back without it, so a call is
   * echoed exactly as received.
   */
  [extra: string]: unknown;
};

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; name: string; content: string };

export type ToolSpec = {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type LlmReply = { content: string | null; toolCalls: ToolCall[] };

/** Thrown for anything the caller should show the user as a friendly message. */
export class LlmError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
/** Tried in order after `DEFAULT_MODEL` when it stays overloaded (only with the default config). */
const DEFAULT_FALLBACKS: string[] = [];
const TIMEOUT_MS = 30_000;

/** `signal` aborts the call when the client gave up — stop, or the tab closed. */
export type LlmCall = (
  messages: ChatMessage[],
  tools: ToolSpec[],
  signal?: AbortSignal,
) => Promise<LlmReply>;

/** Statuses worth another attempt: the provider is busy, not the request wrong. */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
/** Wait before the second attempt on the same model; then move on to the next model. */
const BACKOFF_MS = [800];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One HTTP call to the provider. Returns the response; network failure becomes a 504. */
async function post(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  tools: ToolSpec[],
  signal?: AbortSignal,
): Promise<Response> {
  try {
    return await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages,
        ...(tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
      }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)])
        : AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new LlmError('The AI assistant did not answer in time. Try again.', 504);
  }
}

export const chatCompletion: LlmCall = async (messages, tools, signal) => {
  const apiKey = process.env.LLM_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) throw new LlmError('The AI assistant is not configured on this server.', 503);

  const baseUrl = (process.env.LLM_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const primary = process.env.LLM_MODEL ?? DEFAULT_MODEL;
  // Only `LLM_FALLBACK_MODEL` adds a second model; model ids differ per provider, so there is
  // no built-in chain.
  const configuredFallback = process.env.LLM_FALLBACK_MODEL;
  const chain = configuredFallback
    ? [configuredFallback]
    : process.env.LLM_MODEL
      ? []
      : DEFAULT_FALLBACKS;
  const models = [primary, ...chain.filter((model) => model !== primary)];

  let res: Response | null = null;
  for (const model of models) {
    for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
      if (attempt > 0) await sleep(BACKOFF_MS[attempt - 1] ?? 1_000);
      // No point trying the next attempt or model once nobody is waiting.
      if (signal?.aborted) throw new LlmError('The request was cancelled.', 499);
      res = await post(baseUrl, apiKey, model, messages, tools, signal);
      if (res.ok || !RETRYABLE.has(res.status)) break;
      console.warn(`[agent] ${model} answered ${res.status}, attempt ${attempt + 1}`);
    }
    if (res?.ok || (res && !RETRYABLE.has(res.status))) break;
  }

  if (!res) throw new LlmError('The AI assistant is unavailable right now.', 502);

  // Busy is always 429, whatever the provider said: 503 is kept for "not configured", so a
  // client can retry the one and not the other.
  if (res.status === 429 || res.status === 503) {
    throw new LlmError('The AI assistant is busy right now. Please try again in a moment.', 429);
  }
  if (!res.ok) {
    console.error('[agent] LLM error', res.status, await res.text().catch(() => ''));
    throw new LlmError('The AI assistant is unavailable right now.', 502);
  }

  const json = (await res.json()) as {
    choices?: {
      message?: {
        content?: string | null;
        tool_calls?: (Record<string, unknown> & {
          id?: string;
          function?: { name?: string; arguments?: string };
        })[];
      };
    }[];
  };
  const message = json.choices?.[0]?.message;
  if (!message) throw new LlmError('The AI assistant returned an empty answer.', 502);

  const toolCalls: ToolCall[] = [];
  (message.tool_calls ?? []).forEach((call, index) => {
    const name = call.function?.name;
    if (!name) return;
    toolCalls.push({
      ...call,
      // Some compatible providers omit the id; the follow-up `tool` message needs one.
      id: call.id ?? `call_${Date.now()}_${index}`,
      type: 'function',
      function: { ...call.function, name, arguments: call.function?.arguments ?? '{}' },
    });
  });

  return { content: message.content ?? null, toolCalls };
};
