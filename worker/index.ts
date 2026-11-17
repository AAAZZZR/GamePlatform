// worker/index.ts — game.tryit.wtf 的 Worker
// 網頁都是靜態檔（Next.js static export 出來的 out/），由 Cloudflare 直接送，不會叫醒這支程式。
// 這裡只處理 /ws：牽線用的 WebSocket。進房間前依序過三道門：同網域、每 IP 限流、全站每日上限。
import { CLOSE, SIGNAL_PATH, isSignalRole, isValidRoomId, type CloseCode } from '../lib/signal';

export { SignalRoom } from './room';
export { DailyBudget } from './budget';

// 今天的全站額度用完後，這個 isolate 先記住，之後不用每次都去問 DailyBudget
let budgetExhaustedDay: string | null = null;

function isSameOrigin(origin: string | null, host: string): boolean {
  if (!origin) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    // Origin 不是合法網址（例如 "null"）就當作不同來源
    return false;
  }
}

/** 先接受再立刻用 close code 斷線，讓瀏覽器讀得到被拒絕的原因（HTTP 狀態碼瀏覽器的 WebSocket 讀不到） */
function rejectSocket(code: CloseCode, reason: string): Response {
  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  server.accept();
  server.close(code, reason);
  return new Response(null, { status: 101, webSocket: client });
}

async function takeDailyBudget(env: Env): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  if (budgetExhaustedDay === today) return false;

  const limit = Number(env.DAILY_CONNECTION_LIMIT);
  if (!Number.isFinite(limit)) {
    throw new Error(`DAILY_CONNECTION_LIMIT must be a number, got "${env.DAILY_CONNECTION_LIMIT}"`);
  }

  const ok = await env.BUDGET.get(env.BUDGET.idFromName('global')).take(today, limit);
  if (!ok) budgetExhaustedDay = today;
  return ok;
}

async function handleSignal(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket', { status: 426 });
  }
  if (!isSameOrigin(request.headers.get('Origin'), url.host)) {
    return new Response('Forbidden', { status: 403 });
  }

  const room = url.searchParams.get('room');
  const role = url.searchParams.get('role');
  if (!isValidRoomId(room) || !isSignalRole(role)) {
    return new Response('Bad request', { status: 400 });
  }

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const { success } = await env.RL_CONNECT.limit({ key: ip });
  if (!success) return rejectSocket(CLOSE.ipLimited, 'too many connections from this IP');

  if (!(await takeDailyBudget(env))) return rejectSocket(CLOSE.dailyLimit, 'daily limit reached');

  return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(request);
}

// Workers 規定入口要 default export
export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === SIGNAL_PATH) return handleSignal(request, env, url);
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
