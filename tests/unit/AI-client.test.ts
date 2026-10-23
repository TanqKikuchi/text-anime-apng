import { describe, expect, it } from 'vitest';
import { AiError, AiSession, buildSystem, buildTool, costUsd } from '../../src/ai/client';

interface Captured {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}

function fakeFetch(responses: readonly (() => Response)[], captured: Captured[]): typeof fetch {
  let index = 0;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    captured.push({ url: String(input), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    const make = responses[Math.min(index, responses.length - 1)]!;
    index += 1;
    return make();
  }) as typeof fetch;
}

const json = (status: number, body: unknown) => () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const toolReply = json(200, {
  id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', stop_reason: 'tool_use', stop_sequence: null,
  content: [{ type: 'tool_use', id: 'toolu_1', name: 'apply_design', input: { templateId: 'x', reply: 'ホラー風にしました' } }],
  usage: { input_tokens: 1000, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
});
const textReply = json(200, {
  id: 'msg_2', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', stop_reason: 'end_turn', stop_sequence: null,
  content: [{ type: 'text', text: 'どんな文字にしますか?' }],
  usage: { input_tokens: 10, output_tokens: 5 },
});

describe('AI-03 AiSession', () => {
  it('sends the key from the browser, the tool and the state, and parses a tool call', async () => {
    const captured: Captured[] = [];
    const session = new AiSession({ apiKey: 'sk-test', model: 'claude-sonnet-5-5', lang: 'ja', fetch: fakeFetch([toolReply, textReply], captured) });
    const turn = await session.send('ホラーっぽく', '{"scene":1}');
    expect(turn.commands).toEqual([{ id: 'toolu_1', input: { templateId: 'x', reply: 'ホラー風にしました' } }]);
    expect(turn.reply).toBe('ホラー風にしました');
    expect(turn.costUsd).toBeCloseTo((1000 * 2 + 200 * 10) / 1e6);
    const first = captured[0]!;
    expect(first.url).toContain('api.anthropic.com/v1/messages');
    expect(first.headers.get('authorization')).toBe('Bearer sk-test');
    expect(first.headers.get('anthropic-dangerous-direct-browser-access')).toBe('true');
    expect(first.body.model).toBe('claude-sonnet-5-5');
    expect(first.body.tool_choice).toEqual({ type: 'auto', disable_parallel_tool_use: true });
    expect(JSON.stringify(first.body.messages)).toContain('{\\"scene\\":1}');

    // The next turn answers the pending tool call first, with the recorded result.
    session.setResult('toolu_1', '適用しました。調整された項目: templateId');
    await session.send('もっと赤く', '{"scene":2}');
    const messages = captured[1]!.body.messages as { role: string; content: { type: string; tool_use_id?: string; content?: string }[] }[];
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user']);
    expect(messages[2]!.content[0]).toEqual({ type: 'tool_result', tool_use_id: 'toolu_1', content: '適用しました。調整された項目: templateId' });
  });

  it('maps HTTP errors to friendly kinds and keeps history unchanged on failure', async () => {
    const captured: Captured[] = [];
    const auth = new AiSession({ apiKey: 'bad', model: 'claude-haiku-5-5', lang: 'ja', fetch: fakeFetch([json(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } })], captured) });
    await expect(auth.send('a', '{}')).rejects.toMatchObject({ kind: 'auth' });

    const limited = () => new Response(JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }), { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '0' } });
    const rate = new AiSession({ apiKey: 'k', model: 'claude-haiku-5-5', lang: 'ja', fetch: fakeFetch([limited, limited, textReply], captured) });
    await expect(rate.send('a', '{}')).rejects.toBeInstanceOf(AiError);
    captured.length = 0;
    await rate.send('b', '{}');
    expect((captured.at(-1)!.body.messages as unknown[]).length).toBe(1);
  });

  it('treats a refusal as an error', async () => {
    const refusal = json(200, { id: 'm', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', stop_reason: 'refusal', stop_sequence: null, content: [], usage: { input_tokens: 1, output_tokens: 0 } });
    const session = new AiSession({ apiKey: 'k', model: 'claude-haiku-5-5', lang: 'ja', fetch: fakeFetch([refusal], []) });
    await expect(session.send('a', '{}')).rejects.toMatchObject({ kind: 'refusal' });
  });
});

describe('AI-04 prompt and pricing', () => {
  it('builds a deterministic system prompt in the UI language and a tool listing every template', () => {
    expect(buildSystem('en')).toBe(buildSystem('en'));
    expect(buildSystem('en')).toContain('English');
    const schema = buildTool().input_schema as { properties: { templateId: { enum: string[] } }; required: string[] };
    expect(schema.required).toEqual(['reply']);
    expect(schema.properties.templateId.enum.length).toBeGreaterThan(40);
  });

  it('prices cache reads and writes', () => {
    expect(costUsd('claude-haiku-5-5', { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000_000, cache_read_input_tokens: 1_000_000 })).toBeCloseTo(0.1 * 1.25 + 0.1 * 0.1);
  });
});
