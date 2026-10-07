import { SalaryBand, type Command } from '@applier/protocol';
import { z } from 'zod';
import type { CommandBus } from './services/command-bus';

/**
 * The agent's door: a tiny MCP server (Streamable HTTP, JSON replies, stateless) so Claude Code
 * and Codex can drive the extension with plain tool calls instead of clicking through a browser.
 *   claude mcp add --transport http applier-autofill http://127.0.0.1:7357/mcp
 */

const Target = {
  tab: z.number().int().optional().describe('Tab id returned by autofill_open_and_fill'),
  url: z.string().optional().describe('Or: a URL prefix of an already open tab'),
};
const CvArg = z
  .string()
  .optional()
  .describe(
    'Which tailored CV to attach: part of its folder name under out/SAVED/ (e.g. the vacancy id). Omitted: guessed from the page, else none.',
  );
const BandArg = SalaryBand.optional().describe(
  'The salary band this vacancy published. Omit when it published none.',
);

interface Tool {
  name: string;
  description: string;
  input: z.ZodObject;
  /** Seconds the extension may need. */
  timeoutS: number;
  command(args: never): Command;
}

const tool = <S extends z.ZodObject>(t: {
  name: string;
  description: string;
  input: S;
  timeoutS: number;
  command(args: z.infer<S>): Command;
}): Tool => t as unknown as Tool;

const TOOLS: Tool[] = [
  tool({
    name: 'autofill_open_and_fill',
    description:
      "Open a job-offer URL in a background tab of the user's own Chrome, open the application form if it hides behind an Apply button (justjoin.it), fill it from profile.json and attach the tailored CV. Returns what was filled, what still needs an answer (manual), what did not stick, and a token for autofill_submit. Does NOT submit. If the offer applies on an external ATS, `external` is that URL: call this tool again with it.",
    input: z.object({ url: z.url(), cv: CvArg, band: BandArg }),
    timeoutS: 90,
    command: (a): Command => ({
      op: 'open-and-fill',
      url: a.url,
      ...(a.cv ? { cv: a.cv } : {}),
      ...(a.band ? { band: a.band } : {}),
    }),
  }),
  tool({
    name: 'autofill_fill',
    description:
      'Fill the form already showing in a tab (after the agent answered a manual field, solved a login, or the page changed). Same result as autofill_open_and_fill. Fields already filled are left alone.',
    input: z.object({ ...Target, cv: CvArg, band: BandArg }),
    timeoutS: 60,
    command: (a): Command => ({
      op: 'fill',
      ...(a.tab !== undefined ? { tab: a.tab } : {}),
      ...(a.url ? { url: a.url } : {}),
      ...(a.cv ? { cv: a.cv } : {}),
      ...(a.band ? { band: a.band } : {}),
    }),
  }),
  tool({
    name: 'autofill_read_form',
    description:
      'Read back every control of the form in a tab as the page shows it now: label, kind, required, current value. Use it to verify a fill instead of screenshots.',
    input: z.object(Target),
    timeoutS: 30,
    command: (a): Command => ({
      op: 'read-form',
      ...(a.tab !== undefined ? { tab: a.tab } : {}),
      ...(a.url ? { url: a.url } : {}),
    }),
  }),
  tool({
    name: 'autofill_submit',
    description:
      "SUBMITS THE APPLICATION: presses the form's own submit button and waits for the site's success signal. Real and irreversible. Only after the user has approved this vacancy. Needs the token the last fill returned; refuses when the form is invalid or the salary quote is under the floor. `signal: none` means nothing visibly happened: look at the page, never press again blindly.",
    input: z.object({ ...Target, token: z.string().min(1) }),
    timeoutS: 40,
    command: (a): Command => ({
      op: 'submit',
      token: a.token,
      ...(a.tab !== undefined ? { tab: a.tab } : {}),
      ...(a.url ? { url: a.url } : {}),
    }),
  }),
  tool({
    name: 'autofill_close_tab',
    description: 'Close a tab opened by autofill_open_and_fill.',
    input: z.object(Target),
    timeoutS: 15,
    command: (a): Command => ({
      op: 'close-tab',
      ...(a.tab !== undefined ? { tab: a.tab } : {}),
      ...(a.url ? { url: a.url } : {}),
    }),
  }),
];

const STATUS_TOOL = {
  name: 'autofill_status',
  description:
    'Is the Applier extension connected to this server? Call it first; if it is not, no other autofill tool can work.',
  inputSchema: { type: 'object', properties: {} },
};

const PROTOCOL_VERSION = '2025-03-26';

interface RpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const text = (value: unknown, isError = false) => ({
  content: [
    { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) },
  ],
  ...(isError ? { isError: true } : {}),
});

async function callTool(bus: CommandBus, name: string, args: unknown) {
  if (name === STATUS_TOOL.name) return text({ extensionConnected: bus.connected });
  const found = TOOLS.find((t) => t.name === name);
  if (!found) return text(`Unknown tool ${name}`, true);
  const parsed = found.input.safeParse(args ?? {});
  if (!parsed.success) return text(`Bad arguments: ${z.prettifyError(parsed.error)}`, true);
  const args2 = parsed.data as { tab?: number; url?: string };
  if (found.name !== 'autofill_open_and_fill' && args2.tab === undefined && !args2.url) {
    return text('Name the tab: pass `tab` (from autofill_open_and_fill) or `url`.', true);
  }
  try {
    const data = await bus.dispatch(found.command(parsed.data as never), found.timeoutS * 1000);
    return text(data);
  } catch (e) {
    return text(e instanceof Error ? e.message : String(e), true);
  }
}

/** One JSON-RPC message in, the reply out (null: a notification, nothing to say). */
export async function handleRpc(bus: CommandBus, msg: RpcRequest): Promise<unknown | null> {
  const reply = (result: unknown) => ({ jsonrpc: '2.0', id: msg.id ?? null, result });
  const fail = (code: number, message: string) => ({
    jsonrpc: '2.0',
    id: msg.id ?? null,
    error: { code, message },
  });
  if (msg.id === undefined) return null;
  switch (msg.method) {
    case 'initialize':
      return reply({
        protocolVersion:
          typeof msg.params?.['protocolVersion'] === 'string'
            ? msg.params['protocolVersion']
            : PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'applier-autofill', version: '0.1.0' },
      });
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({
        tools: [
          STATUS_TOOL,
          ...TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: z.toJSONSchema(t.input, { io: 'input' }),
          })),
        ],
      });
    case 'tools/call':
      return reply(await callTool(bus, String(msg.params?.['name']), msg.params?.['arguments']));
    default:
      return fail(-32601, `Method not found: ${msg.method}`);
  }
}
