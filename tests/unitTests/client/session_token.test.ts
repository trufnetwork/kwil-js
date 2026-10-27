import { inspect } from 'util';
import { Wallet } from 'ethers';
import { KwilSigner, NodeKwil, SessionLogoutError, WebKwil } from '../../../src';
import { sessionTokenKey } from '../../../src/core/auth';

// Every request goes through mockGateway.handle, with the headers the client
// built its axios instance with merged with the request's own.
type MockResponse = { status: number; data: any; headers: Record<string, string[]> };
const mockSent: { method: string; headers: Record<string, string>; params: any }[] = [];
const mockGateway: {
  handle: (method: string, headers: Record<string, string>, params: any) => Promise<MockResponse>;
} = { handle: async () => ({ status: 500, data: {}, headers: {} }) };

jest.mock('axios', () => ({
  create: jest.fn((cfg: any) => ({
    post: jest.fn(async (_url: string, body: any, config?: any) => {
      const headers = { ...(cfg.headers || {}), ...((config && config.headers) || {}) };
      mockSent.push({ method: body.method, headers, params: body.params });
      // answer in a later turn of the event loop, as a real request does, so a
      // runaway loop times a test out instead of starving the worker
      await new Promise((r) => setImmediate(r));
      return mockGateway.handle(body.method, headers, body.params);
    }),
    get: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
  })),
}));

const PROVIDER = 'https://gateway.example';
const CHAIN_ID = 'test-chain';

const ok = (result: any, headers: Record<string, string[]> = {}): MockResponse => ({
  status: 200,
  data: { jsonrpc: '2.0', id: 1, result },
  headers,
});
const unauthorized = (message: string): MockResponse => ({
  status: 401,
  data: { jsonrpc: '2.0', id: 1, error: { code: -901, message } },
  headers: {},
});
const callResult = () =>
  ok({ query_result: { column_names: ['x'], column_types: [], values: [[1]] }, logs: '' });

// kgw models the gateway as kgw#121 built it (on kgw main as #122): a cookie
// that holds every account's session, and (when it issues tokens) a token that
// names one session. Every token the gateway signed verifies, and a token that
// verifies is used instead of the cookie: its session must still be live and
// belong to the call's sender. A token the gateway never signed leaves the
// cookie in charge. A sign-in reuses the account's live session in the cookie
// and makes a new one otherwise. Logout with a token ends that session and
// leaves the cookie alone.
function kgw(opts: { issuesTokens: boolean }) {
  let next = 0;
  const sessions = new Map<string, string>(); // live session id -> account
  const owners = new Map<string, string>(); // every session id made -> account
  const signed = new Map<string, string>(); // every token signed -> session id
  const newSession = (account: string): string => {
    next += 1;
    const sid = `s${next}`;
    sessions.set(sid, account);
    owners.set(sid, account);
    return sid;
  };
  const tokenFor = (sid: string): string => {
    signed.set(`t-${sid}`, sid);
    return `t-${sid}`;
  };
  let held: { method: string; arrived: () => void; wait: Promise<void> } | undefined;
  const state = {
    signIns: 0,
    refuseAuthorizationHeader: false,
    down: false,
    // the next n calls that carry a token are stopped before any answer
    blips: 0,
    // calls time out on the client
    timeout: false,
    // calls are answered with an error, as when no node is available
    callError: false,
    // the network fails in Node, where the error's request holds the raw header text
    downNode: false,
    // calls that carry a token are answered with an error
    tokenCallError: false,
    // logouts that carry a token are answered with an error
    tokenLogoutError: false,
    // the logouts of these tokens are answered with an error
    failTokenLogout: new Set<string>(),
    logoutError: false,
    // the node's mode as user.health reports it
    mode: 'open',
    // calls are answered without a session, as the gateway answers exempt reads
    publicCalls: false,
    // a session made outside the client, as an earlier page load would have
    seed(account: string): string {
      return tokenFor(newSession(account));
    },
    // ends a token's session on the gateway, as its lifetime running out would
    expire(token: string): void {
      sessions.delete(signed.get(token)!);
    },
    // holds the answer to the next request of a method until release; sent
    // resolves once it arrives
    holdNext(method: string): { sent: Promise<void>; release: () => void } {
      let arrived!: () => void;
      let release!: () => void;
      const sent = new Promise<void>((r) => (arrived = r));
      held = { method, arrived, wait: new Promise<void>((r) => (release = r)) };
      return { sent, release };
    },
    // whether the session a token names is still live on the gateway
    isLive(token: string): boolean {
      return sessions.has(signed.get(token)!);
    },
  };

  const cookieEntries = (h: Record<string, string>): string[] => {
    const m = /__Host-kgw_session=([^;]*)/.exec(h.Cookie || '');
    return m && m[1] ? m[1].split('|').filter(Boolean) : [];
  };
  const setCookie = (entries: string[]) => ({
    'set-cookie': [
      entries.length
        ? `__Host-kgw_session=${entries.join('|')}; Path=/`
        : '__Host-kgw_session=; Path=/; Max-Age=0',
    ],
  });
  const bearer = (h: Record<string, string>) =>
    opts.issuesTokens && (h.Authorization || '').startsWith('Bearer ')
      ? h.Authorization.slice('Bearer '.length)
      : undefined;

  mockGateway.handle = async (method, headers, params) => {
    if (state.downNode) {
      throw Object.assign(new Error('connect ECONNREFUSED'), {
        isAxiosError: true,
        code: 'ECONNREFUSED',
        config: { headers: { ...headers } },
        request: {
          _header: `POST /rpc/v1 HTTP/1.1\r\nAuthorization: ${headers.Authorization}\r\nCookie: ${headers.Cookie}\r\n`,
        },
      });
    }
    if (held && held.method === method) {
      const h = held;
      held = undefined;
      h.arrived();
      await h.wait;
    }
    let blocked = state.down || (state.refuseAuthorizationHeader && !!headers.Authorization);
    if (!blocked && method === 'user.call' && headers.Authorization && state.blips > 0) {
      state.blips -= 1;
      blocked = true;
    }
    if (blocked) {
      // stopped before any answer, as axios 0.27 reports a refused CORS preflight or a
      // dead network in a browser: the XMLHttpRequest, with status 0, is the response
      const xhr = { status: 0 };
      throw Object.assign(new Error('Network Error'), {
        isAxiosError: true,
        code: 'ERR_NETWORK',
        config: { headers: { ...headers } },
        request: xhr,
        response: xhr,
      });
    }
    if (state.timeout && method === 'user.call') {
      throw Object.assign(new Error('timeout of 10000ms exceeded'), {
        isAxiosError: true,
        code: 'ECONNABORTED',
        config: { headers: { ...headers } },
      });
    }
    switch (method) {
      case 'user.health':
        return ok({ mode: state.mode });
      case 'user.challenge':
        return ok({ challenge: 'ab'.repeat(32) });
      case 'kgw.authn_param':
        return ok({
          nonce: 'abc123',
          statement: 'I agree',
          issue_at: '2026-10-26T00:00:00Z',
          expiration_time: '2026-10-26T00:00:30Z',
          chain_id: CHAIN_ID,
          domain: PROVIDER,
          version: '1',
          uri: `${PROVIDER}/rpc/v1`,
        });
      case 'kgw.authn': {
        state.signIns += 1;
        const account = String(params.sender).toLowerCase();
        const entries = cookieEntries(headers);
        const live = entries
          .map((e) => e.split(':'))
          .find(([acc, sid]) => acc === account && sessions.get(sid) === account);
        const sid = live ? live[1] : newSession(account);
        const result: any = { result: live ? 'already authenticated' : 'ok' };
        if (opts.issuesTokens) {
          result.token = tokenFor(sid);
        }
        return ok(result, setCookie(live ? entries : [`${account}:${sid}`, ...entries]));
      }
      case 'kgw.logout': {
        const sent = bearer(headers);
        if (
          state.logoutError ||
          (sent && (state.tokenLogoutError || state.failTokenLogout.has(sent)))
        ) {
          // as kgw answers when it cannot remove the session
          return {
            status: 500,
            data: { jsonrpc: '2.0', id: 1, error: { code: -900, message: 'remove session error' } },
            headers: {},
          };
        }
        const account = String(params.account || '').toLowerCase();
        const token = bearer(headers);
        const entries = cookieEntries(headers);
        if (token && (signed.has(token) || !entries.length)) {
          // a token logs out its own session; one it never signed, with no cookie, ends nothing
          const sid = signed.get(token);
          if (sid && (!account || owners.get(sid) === account)) {
            sessions.delete(sid);
          }
          return ok({ result: 'ok' });
        }
        const remaining = entries.filter((e) => {
          const [acc, sid] = e.split(':');
          if (!account || acc === account) {
            sessions.delete(sid);
            return false;
          }
          return true;
        });
        return ok({ result: 'ok' }, setCookie(remaining));
      }
      case 'user.call': {
        if (state.mode === 'private' || state.publicCalls) {
          return callResult();
        }
        if (state.callError || (state.tokenCallError && headers.Authorization)) {
          return {
            status: 500,
            data: { jsonrpc: '2.0', id: 1, error: { code: -900, message: 'no available backend' } },
            headers: {},
          };
        }
        const sender = String(params.sender || '').toLowerCase();
        const token = bearer(headers);
        const sid = token ? signed.get(token) : undefined;
        if (sid) {
          if (owners.get(sid) !== sender) {
            return unauthorized(`no cookie for account: ${sender}`);
          }
          return sessions.has(sid) ? callResult() : unauthorized(`no valid cookie for ${sender}`);
        }
        const entries = cookieEntries(headers);
        if (!entries.length) {
          return unauthorized(token ? 'invalid token' : 'cookie not found');
        }
        const live = entries.some((e) => {
          const [acc, sid] = e.split(':');
          return acc === sender && sessions.get(sid) === sender;
        });
        return live ? callResult() : unauthorized(`no valid cookie for ${sender}`);
      }
      default:
        return {
          status: 500,
          data: { jsonrpc: '2.0', id: 1, error: { code: -1, message: method } },
          headers: {},
        };
    }
  };
  return state;
}

const sentTo = (method: string) => mockSent.filter((s) => s.method === method);
const keyOf = (w: { address: string }) => w.address.slice(2).toLowerCase();

describe('gateway session tokens', () => {
  const walletA = Wallet.createRandom();
  const walletB = Wallet.createRandom();
  const signerA = new KwilSigner(walletA, walletA.address);
  const signerB = new KwilSigner(walletB, walletB.address);
  const body = { namespace: 'main', name: 'whoami' };
  const config = { kwilProvider: PROVIDER, chainId: CHAIN_ID };

  beforeEach(() => {
    mockSent.length = 0;
  });

  // A wallet's in-app browser: the client runs as in a browser, and the
  // gateway's cookie never comes back.
  describe('in a browser that drops the cookie', () => {
    beforeAll(() => {
      (global as any).window = {};
    });
    afterAll(() => {
      delete (global as any).window;
    });

    it("keeps each wallet's token from sign-in and sends it on that wallet's calls only", async () => {
      kgw({ issuesTokens: true });
      const seen: [string, string | undefined][] = [];
      const kwil = new WebKwil({ ...config, onSessionToken: (id, t) => seen.push([id, t]) });

      expect((await kwil.call(body, signerA)).status).toBe(200);
      expect(kwil.getSessionToken(walletA.address)).toBe('t-s1');
      expect(seen).toEqual([[keyOf(walletA), 't-s1']]);

      expect((await kwil.call(body, signerA)).status).toBe(200);
      expect(sentTo('kgw.authn')).toHaveLength(1);
      expect(sentTo('user.call').map((c) => c.headers.Authorization)).toStrictEqual([
        undefined,
        'Bearer t-s1',
        'Bearer t-s1',
      ]);

      ['user.health', 'kgw.authn_param', 'kgw.authn'].forEach((m) =>
        sentTo(m).forEach((s) => expect(s.headers.Authorization).toBeUndefined())
      );
    });

    it('starts from saved tokens without signing in', async () => {
      const gw = kgw({ issuesTokens: true });
      const token = gw.seed(keyOf(walletA));
      const kwil = new WebKwil({ ...config, sessionTokens: { [walletA.address]: token } });

      expect((await kwil.call(body, signerA)).status).toBe(200);
      expect(gw.signIns).toBe(0);
      expect(sentTo('user.call')[0].headers.Authorization).toBe(`Bearer ${token}`);
    });

    it('drops a refused token, signs in once and reports both changes', async () => {
      const gw = kgw({ issuesTokens: true });
      const seen: [string, string | undefined][] = [];
      const kwil = new WebKwil({
        ...config,
        sessionTokens: { [keyOf(walletA)]: 'stale' },
        onSessionToken: (id, t) => seen.push([id, t]),
      });

      expect((await kwil.call(body, signerA)).status).toBe(200);
      expect(seen).toEqual([
        [keyOf(walletA), undefined],
        [keyOf(walletA), 't-s1'],
      ]);
      expect(gw.signIns).toBe(1);
    });

    it('drops a refused token even when it does not sign in again', async () => {
      kgw({ issuesTokens: true });
      const kwil = new WebKwil({
        ...config,
        autoAuthenticate: false,
        sessionTokens: { [keyOf(walletA)]: 'stale' },
      });
      const res = await kwil.call(body, signerA);
      expect((res as any).authCode).toBe(-901);
      expect(kwil.getSessionToken(walletA.address)).toBeUndefined();
    });

    it('signs in once for calls of one wallet that fail together', async () => {
      const gw = kgw({ issuesTokens: true });
      const kwil = new WebKwil(config);

      const results = await Promise.all(Array.from({ length: 5 }, () => kwil.call(body, signerA)));
      results.forEach((r) => expect(r.status).toBe(200));
      expect(gw.signIns).toBe(1);
      expect(sentTo('kgw.authn_param')).toHaveLength(1);
    });

    it('retries with a token that arrived while its call was in flight, without a sign-in', async () => {
      const gw = kgw({ issuesTokens: true });
      const token = gw.seed(keyOf(walletA));
      const kwil = new WebKwil({ ...config, sessionTokens: { [keyOf(walletA)]: token } });
      await kwil.call(body, signerA);
      gw.expire(token);

      // the slow call goes out with the old token and is answered only later
      const hold = gw.holdNext('user.call');
      const slow = kwil.call(body, signerA);
      await hold.sent;
      // meanwhile another call is refused, signs in and gets a new token
      expect((await kwil.call(body, signerA)).status).toBe(200);
      expect(kwil.getSessionToken(walletA.address)).toBe('t-s2');
      hold.release();

      expect((await slow).status).toBe(200);
      expect(gw.signIns).toBe(1);
      expect(kwil.getSessionToken(walletA.address)).toBe('t-s2');
    });

    it('gives each wallet its own token, so switching needs no new sign-in', async () => {
      const gw = kgw({ issuesTokens: true });
      const kwil = new WebKwil(config);

      const together = await Promise.all([
        kwil.call(body, signerA),
        kwil.call(body, signerB),
        kwil.call(body, signerA),
      ]);
      together.forEach((r) => expect(r.status).toBe(200));
      expect(gw.signIns).toBe(2);

      for (const s of [signerA, signerB, signerA, signerB]) {
        // eslint-disable-next-line no-await-in-loop
        expect((await kwil.call(body, s)).status).toBe(200);
      }
      expect(gw.signIns).toBe(2);
    });

    it('keeps the token when the gateway answers the logout with an error', async () => {
      const gw = kgw({ issuesTokens: true });
      const kwil = new WebKwil(config);
      await kwil.call(body, signerA);
      gw.logoutError = true;
      const error = await kwil.auth.logoutKGW(signerA).catch((e) => e);
      expect(error).toBeInstanceOf(SessionLogoutError);
      expect(error.identifiers).toStrictEqual([keyOf(walletA)]);
      // the cookie logout was answered with an error too
      expect(error.cause).toBeInstanceOf(Error);
      expect(kwil.getSessionToken(walletA.address)).toBe('t-s1');
    });

    it('logs out a token that replaced the one being logged out', async () => {
      const gw = kgw({ issuesTokens: true });
      const first = gw.seed(keyOf(walletA));
      const kwil = new WebKwil({ ...config, sessionTokens: { [keyOf(walletA)]: first } });
      await kwil.call(body, signerA);
      const replacement = gw.seed(keyOf(walletA));
      mockSent.length = 0;

      const hold = gw.holdNext('kgw.logout');
      const logout = kwil.auth.logoutKGW(signerA);
      await hold.sent;
      // a sign-in for the same wallet finishes while the logout is in flight
      kwil.setSessionToken(walletA.address, replacement);
      hold.release();
      await logout;

      expect(gw.isLive(first)).toBe(false);
      expect(gw.isLive(replacement)).toBe(false);
      expect(kwil.getSessionToken(walletA.address)).toBeUndefined();
      expect(sentTo('kgw.logout').map((l) => l.headers.Authorization)).toStrictEqual([
        `Bearer ${first}`,
        `Bearer ${replacement}`,
        undefined,
      ]);
    });

    it('reports a token logout the gateway did not confirm, after the cookie logout', async () => {
      const gw = kgw({ issuesTokens: true });
      const kwil = new WebKwil(config);
      await kwil.call(body, signerA);
      gw.tokenLogoutError = true;
      mockSent.length = 0;

      const error = await kwil.auth.logoutKGW(signerA).catch((e) => e);
      expect(error).toBeInstanceOf(SessionLogoutError);
      expect(error.identifiers).toStrictEqual([keyOf(walletA)]);
      expect(error.cause).toBeUndefined();
      expect(error.message).toContain(
        `did not confirm the logout of the session token held for ${keyOf(walletA)}`
      );
      expect(sentTo('kgw.logout').map((l) => l.headers.Authorization)).toStrictEqual([
        'Bearer t-s1',
        undefined,
      ]);
      expect(kwil.getSessionToken(walletA.address)).toBe('t-s1');
      expect(gw.isLive('t-s1')).toBe(true);

      // tried again, the logout ends the session
      gw.tokenLogoutError = false;
      expect((await kwil.auth.logoutKGW(signerA)).data).toEqual({ result: 'ok' });
      expect(gw.isLive('t-s1')).toBe(false);
      expect(kwil.getSessionToken(walletA.address)).toBeUndefined();
    });

    it('names only the wallets whose token logout was not confirmed', async () => {
      const gw = kgw({ issuesTokens: true });
      const kwil = new WebKwil(config);
      await kwil.call(body, signerA);
      await kwil.call(body, signerB);
      gw.failTokenLogout.add('t-s1');

      const error = await kwil.auth.logoutKGW().catch((e) => e);
      expect(error).toBeInstanceOf(SessionLogoutError);
      expect(error.identifiers).toStrictEqual([keyOf(walletA)]);
      expect(kwil.getSessionToken(walletA.address)).toBe('t-s1');
      expect(kwil.getSessionToken(walletB.address)).toBeUndefined();
      expect(gw.isLive('t-s1')).toBe(true);
      expect(gw.isLive('t-s2')).toBe(false);
    });

    it('does not take an answer without a JSON-RPC result as a token logout', async () => {
      const gw = kgw({ issuesTokens: true });
      const kwil = new WebKwil(config);
      await kwil.call(body, signerA);
      const handle = mockGateway.handle;
      mockGateway.handle = async (method, headers, params) =>
        method === 'kgw.logout' && headers.Authorization
          ? { status: 200, data: '<html>maintenance</html>', headers: {} }
          : handle(method, headers, params);
      try {
        await expect(kwil.auth.logoutKGW(signerA)).rejects.toBeInstanceOf(SessionLogoutError);
        expect(gw.isLive('t-s1')).toBe(true);
        expect(kwil.getSessionToken(walletA.address)).toBe('t-s1');
      } finally {
        mockGateway.handle = handle;
      }
    });

    it('sends each token logout once, even when onSessionToken stores the token back', async () => {
      kgw({ issuesTokens: true });
      const kwil: WebKwil = new WebKwil({
        ...config,
        onSessionToken: (id, token) => {
          if (!token) {
            kwil.setSessionToken(id, 't-s1');
          }
        },
      });
      await kwil.call(body, signerA);
      mockSent.length = 0;

      expect((await kwil.auth.logoutKGW(signerA)).data).toEqual({ result: 'ok' });
      expect(sentTo('kgw.logout').map((l) => l.headers.Authorization)).toStrictEqual([
        'Bearer t-s1',
        undefined,
      ]);
    });

    it('holds an unconfirmed token again after a sign-in replaced it mid-logout', async () => {
      const gw = kgw({ issuesTokens: true });
      const kwil = new WebKwil(config);
      await kwil.call(body, signerA);
      const replacement = gw.seed(keyOf(walletA));
      gw.failTokenLogout.add('t-s1');

      const hold = gw.holdNext('kgw.logout');
      const logout = kwil.auth.logoutKGW(signerA).catch((e) => e);
      await hold.sent;
      // a sign-in for the same wallet finishes while the failing logout is in flight
      kwil.setSessionToken(walletA.address, replacement);
      hold.release();
      const error = await logout;

      expect(error).toBeInstanceOf(SessionLogoutError);
      expect(error.identifiers).toStrictEqual([keyOf(walletA)]);
      expect(gw.isLive(replacement)).toBe(false);
      expect(gw.isLive('t-s1')).toBe(true);
      // the client holds the token whose logout went unconfirmed, as the error says
      expect(kwil.getSessionToken(walletA.address)).toBe('t-s1');
    });

    it('logs out a token another wallet stored while logoutKGW() was in flight', async () => {
      const gw = kgw({ issuesTokens: true });
      const kwil = new WebKwil(config);
      await kwil.call(body, signerA);
      const other = gw.seed(keyOf(walletB));

      const hold = gw.holdNext('kgw.logout');
      const logout = kwil.auth.logoutKGW();
      await hold.sent;
      // a sign-in for another wallet finishes while the logout is in flight
      kwil.setSessionToken(walletB.address, other);
      hold.release();
      await logout;

      expect(gw.isLive('t-s1')).toBe(false);
      expect(gw.isLive(other)).toBe(false);
      expect(kwil.getSessionToken(walletB.address)).toBeUndefined();
    });

    it('tries the held token again before asking the wallet, after tokens went off', async () => {
      const gw = kgw({ issuesTokens: true });
      const token = gw.seed(keyOf(walletA));
      const kwil = new WebKwil({ ...config, sessionTokens: { [keyOf(walletA)]: token } });
      await kwil.call(body, signerA);
      mockSent.length = 0;

      // the network drops for the first two tries with the token and for the last
      // one, while the call without it gets through: tokens go off for calls
      gw.blips = 3;
      expect((await kwil.call(body, signerA)).status).toBe(200);
      // the call without the token was refused, so the held token was tried again
      expect(gw.signIns).toBe(0);
      expect(kwil.getSessionToken(walletA.address)).toBe(token);
      expect((await kwil.call(body, signerA)).status).toBe(200);
      expect(gw.signIns).toBe(0);
      expect(sentTo('user.call').map((c) => c.headers.Authorization)).toStrictEqual([
        `Bearer ${token}`,
        `Bearer ${token}`,
        undefined,
        `Bearer ${token}`,
        `Bearer ${token}`,
        `Bearer ${token}`,
      ]);
    });

    it('signs in once when the held token tried again is refused too', async () => {
      const gw = kgw({ issuesTokens: true });
      const token = gw.seed(keyOf(walletA));
      const kwil = new WebKwil({ ...config, sessionTokens: { [keyOf(walletA)]: token } });
      await kwil.call(body, signerA);
      gw.expire(token);
      mockSent.length = 0;

      gw.blips = 3;
      expect((await kwil.call(body, signerA)).status).toBe(200);
      expect(gw.signIns).toBe(1);
      expect(kwil.getSessionToken(walletA.address)).toBe('t-s2');
      expect(sentTo('user.call').map((c) => c.headers.Authorization)).toStrictEqual([
        `Bearer ${token}`,
        `Bearer ${token}`,
        undefined,
        `Bearer ${token}`,
        `Bearer ${token}`,
        'Bearer t-s2',
      ]);
    });

    it('drops a refused held token and signs in, when tokens were already off', async () => {
      const gw = kgw({ issuesTokens: true });
      const token = gw.seed(keyOf(walletA));
      const kwil = new WebKwil({ ...config, sessionTokens: { [keyOf(walletA)]: token } });
      await kwil.call(body, signerA);

      // a read the gateway answers without a session turns tokens off for calls
      gw.publicCalls = true;
      gw.blips = 3;
      expect((await kwil.call(body, signerA)).status).toBe(200);
      gw.publicCalls = false;

      // the held token has expired by the next read that needs the session
      gw.expire(token);
      mockSent.length = 0;
      expect((await kwil.call(body, signerA)).status).toBe(200);
      expect(gw.signIns).toBe(1);
      expect(kwil.getSessionToken(walletA.address)).toBe('t-s2');
      expect(sentTo('user.call').map((c) => c.headers.Authorization)).toStrictEqual([
        undefined,
        `Bearer ${token}`,
        'Bearer t-s2',
      ]);
    });

    it("turns tokens back on with the app's own sign-in", async () => {
      const gw = kgw({ issuesTokens: true });
      const token = gw.seed(keyOf(walletA));
      const kwil = new WebKwil({
        ...config,
        autoAuthenticate: false,
        sessionTokens: { [keyOf(walletA)]: token },
      });
      await kwil.call(body, signerA);

      // a read the gateway answers without a session turns tokens off for calls
      gw.publicCalls = true;
      gw.blips = 3;
      expect((await kwil.call(body, signerA)).status).toBe(200);
      gw.publicCalls = false;

      // the app signs another wallet in itself; its token goes out at once
      await kwil.auth.authenticateKGW(signerB);
      mockSent.length = 0;
      expect((await kwil.call(body, signerB)).status).toBe(200);
      expect(sentTo('user.call').map((c) => c.headers.Authorization)).toStrictEqual([
        'Bearer t-s2',
      ]);
    });

    it('does not leave a rejected onSessionToken promise unhandled', async () => {
      kgw({ issuesTokens: true });
      const unhandled: unknown[] = [];
      const listen = (reason: unknown) => {
        unhandled.push(reason);
      };
      process.on('unhandledRejection', listen);
      try {
        const kwil = new WebKwil({
          ...config,
          onSessionToken: async () => {
            throw new Error('storage blocked');
          },
        });
        expect((await kwil.call(body, signerA)).status).toBe(200);
        await new Promise((r) => setTimeout(r, 20));
      } finally {
        process.off('unhandledRejection', listen);
      }
      expect(unhandled).toStrictEqual([]);
    });

    it('does not let a failing onSessionToken break the call', async () => {
      kgw({ issuesTokens: true });
      const kwil = new WebKwil({
        ...config,
        onSessionToken: () => {
          throw new Error('storage blocked');
        },
      });
      expect((await kwil.call(body, signerA)).status).toBe(200);
      expect(kwil.getSessionToken(walletA.address)).toBe('t-s1');
    });

    it('keeps the token out of an error that leaves the client', async () => {
      const gw = kgw({ issuesTokens: true });
      const token = gw.seed(keyOf(walletA));
      const kwil = new WebKwil({ ...config, sessionTokens: { [keyOf(walletA)]: token } });
      await kwil.call(body, signerA); // learns the gateway mode while it is up
      gw.down = true;

      const error: any = await kwil.call(body, signerA).catch((e) => e);
      expect(error).toBeInstanceOf(Error);
      expect(error.config.headers.Authorization).toBe('[redacted]');
      expect(kwil.getSessionToken(walletA.address)).toBe(token);
    });

    it('keeps sending the token after an error the gateway answered', async () => {
      const gw = kgw({ issuesTokens: true });
      const token = gw.seed(keyOf(walletA));
      const kwil = new WebKwil({ ...config, sessionTokens: { [keyOf(walletA)]: token } });
      await kwil.call(body, signerA);

      gw.callError = true;
      await expect(kwil.call(body, signerA)).rejects.toThrow('no available backend');
      gw.callError = false;
      expect((await kwil.call(body, signerA)).status).toBe(200);
      expect(gw.signIns).toBe(0);
      expect(kwil.getSessionToken(walletA.address)).toBe(token);
      expect(sentTo('user.call').map((c) => c.headers.Authorization)).toStrictEqual(
        Array(3).fill(`Bearer ${token}`)
      );
    });

    it('keeps sending the token after a call times out', async () => {
      const gw = kgw({ issuesTokens: true });
      const token = gw.seed(keyOf(walletA));
      const kwil = new WebKwil({ ...config, sessionTokens: { [keyOf(walletA)]: token } });
      await kwil.call(body, signerA);

      gw.timeout = true;
      await expect(kwil.call(body, signerA)).rejects.toThrow('timeout');
      gw.timeout = false;
      expect((await kwil.call(body, signerA)).status).toBe(200);
      expect(gw.signIns).toBe(0);
      expect(kwil.getSessionToken(walletA.address)).toBe(token);
      expect(sentTo('user.call').map((c) => c.headers.Authorization)).toStrictEqual(
        Array(3).fill(`Bearer ${token}`)
      );
    });

    it('throws a network error on a call that carried no token, with no more tries', async () => {
      const gw = kgw({ issuesTokens: true });
      const token = gw.seed(keyOf(walletA));
      const kwil = new WebKwil({ ...config, sessionTokens: { [keyOf(walletA)]: token } });
      await kwil.call(body, signerA);
      mockSent.length = 0;

      gw.down = true;
      await expect(kwil.call(body)).rejects.toThrow('Network Error');
      expect(sentTo('user.call')).toHaveLength(1);
      gw.down = false;
      mockSent.length = 0;
      expect((await kwil.call(body, signerA)).status).toBe(200);
      expect(sentTo('user.call')[0].headers.Authorization).toBe(`Bearer ${token}`);
    });

    it('throws the first error when the call without the token times out', async () => {
      const gw = kgw({ issuesTokens: true });
      const token = gw.seed(keyOf(walletA));
      const kwil = new WebKwil({ ...config, sessionTokens: { [keyOf(walletA)]: token } });
      await kwil.call(body, signerA);
      mockSent.length = 0;

      gw.blips = 2;
      gw.timeout = true;
      await expect(kwil.call(body, signerA)).rejects.toThrow('Network Error');
      expect(sentTo('user.call').map((c) => c.headers.Authorization)).toStrictEqual([
        `Bearer ${token}`,
        `Bearer ${token}`,
        undefined,
      ]);
    });

    it('sends a call again with its token after the network blinks', async () => {
      const gw = kgw({ issuesTokens: true });
      const token = gw.seed(keyOf(walletA));
      const kwil = new WebKwil({ ...config, sessionTokens: { [keyOf(walletA)]: token } });
      await kwil.call(body, signerA);

      gw.blips = 1;
      expect((await kwil.call(body, signerA)).status).toBe(200);
      expect((await kwil.call(body, signerA)).status).toBe(200);
      expect(gw.signIns).toBe(0);
      expect(kwil.getSessionToken(walletA.address)).toBe(token);
      expect(sentTo('user.call').map((c) => c.headers.Authorization)).toStrictEqual(
        Array(4).fill(`Bearer ${token}`)
      );
    });

    it('keeps sending tokens when the gateway comes back between tries', async () => {
      const gw = kgw({ issuesTokens: true });
      const token = gw.seed(keyOf(walletA));
      const kwil = new WebKwil({ ...config, sessionTokens: { [keyOf(walletA)]: token } });
      await kwil.call(body, signerA);

      // down for both tries with the token, back for the call without it
      gw.blips = 2;
      expect((await kwil.call(body, signerA)).status).toBe(200);
      expect((await kwil.call(body, signerA)).status).toBe(200);
      expect(gw.signIns).toBe(0);
      expect(kwil.getSessionToken(walletA.address)).toBe(token);
      expect(sentTo('user.call').map((c) => c.headers.Authorization)).toStrictEqual([
        `Bearer ${token}`,
        `Bearer ${token}`,
        `Bearer ${token}`,
        undefined,
        `Bearer ${token}`,
        `Bearer ${token}`,
      ]);
    });

    it('throws the answer to the last try with the token and keeps sending tokens', async () => {
      const gw = kgw({ issuesTokens: true });
      const token = gw.seed(keyOf(walletA));
      const kwil = new WebKwil({ ...config, sessionTokens: { [keyOf(walletA)]: token } });
      await kwil.call(body, signerA);

      // both tries with the token are stopped, the call without it is answered,
      // and the last try with the token is answered with an error
      gw.blips = 2;
      gw.tokenCallError = true;
      await expect(kwil.call(body, signerA)).rejects.toThrow('no available backend');
      gw.tokenCallError = false;
      expect((await kwil.call(body, signerA)).status).toBe(200);
      expect(gw.signIns).toBe(0);
      expect(sentTo('user.call').map((c) => c.headers.Authorization)).toStrictEqual([
        `Bearer ${token}`,
        `Bearer ${token}`,
        `Bearer ${token}`,
        undefined,
        `Bearer ${token}`,
        `Bearer ${token}`,
      ]);
    });

    it('throws the answer to the second try with the token and keeps the token', async () => {
      const gw = kgw({ issuesTokens: true });
      const token = gw.seed(keyOf(walletA));
      const kwil = new WebKwil({ ...config, sessionTokens: { [keyOf(walletA)]: token } });
      await kwil.call(body, signerA);

      gw.blips = 1;
      gw.callError = true;
      await expect(kwil.call(body, signerA)).rejects.toThrow('no available backend');
      expect(kwil.getSessionToken(walletA.address)).toBe(token);
      expect(sentTo('user.call').map((c) => c.headers.Authorization)).toStrictEqual(
        Array(3).fill(`Bearer ${token}`)
      );
    });
  });

  // A desktop browser or Node: the gateway's cookie comes back and holds every
  // wallet's session.
  describe('where the cookie is kept', () => {
    it('lets the cookie decide for a wallet whose token the client does not hold', async () => {
      const gw = kgw({ issuesTokens: true });
      const kwil = new NodeKwil(config);
      await kwil.call(body, signerA);
      await kwil.call(body, signerB);
      expect(gw.signIns).toBe(2);

      kwil.setSessionToken(walletB.address, undefined);
      mockSent.length = 0;
      expect((await kwil.call(body, signerB)).status).toBe(200);
      expect(gw.signIns).toBe(2);
      expect(sentTo('user.call')[0].headers.Authorization).toBeUndefined();
    });

    it('lets a live cookie decide when the gateway cannot verify the token', async () => {
      const gw = kgw({ issuesTokens: true });
      const kwil = new NodeKwil(config);
      await kwil.call(body, signerA);
      kwil.setSessionToken(walletA.address, 'stale');
      expect((await kwil.call(body, signerA)).status).toBe(200);
      expect(gw.signIns).toBe(1);
    });

    it('drops a token whose session ended and signs in once onto the live cookie session', async () => {
      const gw = kgw({ issuesTokens: true });
      const kwil = new NodeKwil(config);
      await kwil.call(body, signerA); // cookie session s1, token t-s1
      const ended = gw.seed(keyOf(walletA));
      gw.expire(ended);
      kwil.setSessionToken(walletA.address, ended);
      mockSent.length = 0;

      expect((await kwil.call(body, signerA)).status).toBe(200);
      expect(gw.signIns).toBe(2);
      // the gateway reused the cookie's live session, and the new token names it
      expect(kwil.getSessionToken(walletA.address)).toBe('t-s1');
      expect(sentTo('user.call').map((c) => c.headers.Authorization)).toStrictEqual([
        `Bearer ${ended}`,
        'Bearer t-s1',
      ]);
    });

    it("logs out one wallet's token and cookie sessions and keeps the other wallet", async () => {
      const gw = kgw({ issuesTokens: true });
      const kwil = new NodeKwil(config);
      await kwil.call(body, signerA);
      await kwil.call(body, signerB);
      // A's token names a second session, as from another sign-in; A's cookie
      // session is a different one, which only the cookie logout can end
      const other = gw.seed(keyOf(walletA));
      kwil.setSessionToken(walletA.address, other);
      mockSent.length = 0;

      await kwil.auth.logoutKGW(signerA);
      expect(sentTo('kgw.logout').map((l) => l.headers.Authorization)).toStrictEqual([
        `Bearer ${other}`,
        undefined,
      ]);
      expect(kwil.getSessionToken(walletA.address)).toBeUndefined();
      expect(kwil.getSessionToken(walletB.address)).toBe('t-s2');

      // B is untouched, in its token and in the cookie
      expect((await kwil.call(body, signerB)).status).toBe(200);
      kwil.setSessionToken(walletB.address, undefined);
      expect((await kwil.call(body, signerB)).status).toBe(200);
      expect(gw.signIns).toBe(2);
      // both of A's sessions ended, so A signs in again
      expect((await kwil.call(body, signerA)).status).toBe(200);
      expect(gw.signIns).toBe(3);
    });

    it('logs out every session when no wallet is given', async () => {
      const gw = kgw({ issuesTokens: true });
      const kwil = new NodeKwil(config);
      await kwil.call(body, signerA);
      await kwil.call(body, signerB);

      mockSent.length = 0;
      expect((await kwil.auth.logoutKGW()).data).toMatchObject({ result: 'ok' });
      expect(sentTo('kgw.logout').map((l) => l.headers.Authorization)).toStrictEqual([
        'Bearer t-s1',
        'Bearer t-s2',
        undefined,
      ]);
      expect(kwil.getSessionToken(walletA.address)).toBeUndefined();
      expect(kwil.getSessionToken(walletB.address)).toBeUndefined();
      // the gateway cleared the cookie, so the next request carries none
      mockSent.length = 0;
      await kwil.call(body, signerA);
      expect(sentTo('user.call')[0].headers.Cookie).toBeUndefined();
      await kwil.call(body, signerB);
      expect(gw.signIns).toBe(4);
    });

    it('stops sending tokens to a gateway that refuses the header', async () => {
      const gw = kgw({ issuesTokens: true });
      const seen: [string, string | undefined][] = [];
      const kwil = new NodeKwil({ ...config, onSessionToken: (id, t) => seen.push([id, t]) });
      await kwil.call(body, signerA);

      gw.refuseAuthorizationHeader = true; // a rollback, or a CORS list without Authorization
      mockSent.length = 0;
      expect((await kwil.call(body, signerA)).status).toBe(200);
      expect((await kwil.call(body, signerA)).status).toBe(200);
      expect(gw.signIns).toBe(1);
      // the token is kept, so a new client tries it again
      expect(kwil.getSessionToken(walletA.address)).toBe('t-s1');
      expect(seen).toEqual([[keyOf(walletA), 't-s1']]);

      // a wallet that signs in afterwards turns tokens back on; its token is
      // refused the same way, and the call goes through on the cookie
      expect((await kwil.call(body, signerB)).status).toBe(200);
      expect(kwil.getSessionToken(walletB.address)).toBe('t-s2');
      // A: two tries with the token, one without, one more with it; then without.
      // B: without, signs in, then the same four tries with its token
      expect(sentTo('user.call').map((c) => c.headers.Authorization)).toStrictEqual([
        'Bearer t-s1',
        'Bearer t-s1',
        undefined,
        'Bearer t-s1',
        undefined,
        undefined,
        'Bearer t-s2',
        'Bearer t-s2',
        undefined,
        'Bearer t-s2',
      ]);
    });

    it('still logs out a held token after the client stopped sending tokens', async () => {
      const gw = kgw({ issuesTokens: true });
      const kwil = new NodeKwil(config);
      await kwil.call(body, signerA);
      // a token for a session of its own, apart from the cookie's
      const held = gw.seed(keyOf(walletA));
      kwil.setSessionToken(walletA.address, held);
      gw.refuseAuthorizationHeader = true;
      expect((await kwil.call(body, signerA)).status).toBe(200);
      // tokens are off for calls from here
      mockSent.length = 0;
      expect((await kwil.call(body, signerA)).status).toBe(200);
      expect(sentTo('user.call').map((c) => c.headers.Authorization)).toStrictEqual([undefined]);

      // while the header is refused, the logout cannot end the token session and says so
      await expect(kwil.auth.logoutKGW(signerA)).rejects.toBeInstanceOf(SessionLogoutError);
      expect(gw.isLive(held)).toBe(true);
      expect(kwil.getSessionToken(walletA.address)).toBe(held);

      // once the header gets through, the held token's session ends
      gw.refuseAuthorizationHeader = false;
      await kwil.auth.logoutKGW(signerA);
      expect(gw.isLive(held)).toBe(false);
      expect(kwil.getSessionToken(walletA.address)).toBeUndefined();
    });

    it('keeps the token and the cookie out of a Node network error, request included', async () => {
      const gw = kgw({ issuesTokens: true });
      const kwil = new NodeKwil(config);
      await kwil.call(body, signerA); // signs in: token t-s1 and the session cookie
      gw.downNode = true;

      const error: any = await kwil.call(body, signerA).catch((e) => e);
      expect(error.code).toBe('ECONNREFUSED');
      expect(error.config.headers.Authorization).toBe('[redacted]');
      expect(error.config.headers.Cookie).toBe('[redacted]');
      const shown = inspect(error, { depth: 6 });
      expect(shown).not.toContain('t-s1');
      expect(shown).not.toContain(`${keyOf(walletA)}:s1`);
      expect(kwil.getSessionToken(walletA.address)).toBe('t-s1');
    });

    it('keeps the cookie out of a Node network error when no token was sent', async () => {
      const gw = kgw({ issuesTokens: false });
      const kwil = new NodeKwil(config);
      await kwil.call(body, signerA); // signs in: the session cookie only
      gw.downNode = true;

      const error: any = await kwil.call(body, signerA).catch((e) => e);
      expect(error.config.headers.Cookie).toBe('[redacted]');
      expect(inspect(error, { depth: 6 })).not.toContain(`${keyOf(walletA)}:s1`);
    });

    it('gives the retry after a sign-in the same fallback for a refused header', async () => {
      const gw = kgw({ issuesTokens: true });
      gw.refuseAuthorizationHeader = true;
      const kwil = new NodeKwil(config);

      expect((await kwil.call(body, signerA)).status).toBe(200);
      expect(gw.signIns).toBe(1);
      expect(sentTo('user.call').map((c) => c.headers.Authorization)).toStrictEqual([
        undefined,
        'Bearer t-s1',
        'Bearer t-s1',
        undefined,
        'Bearer t-s1',
      ]);
    });

    it('throws the error the call without the token was answered with, after turning tokens off', async () => {
      const gw = kgw({ issuesTokens: true });
      const kwil = new NodeKwil(config);
      await kwil.call(body, signerA);
      gw.refuseAuthorizationHeader = true;
      gw.callError = true;

      await expect(kwil.call(body, signerA)).rejects.toThrow('no available backend');
      gw.callError = false;
      mockSent.length = 0;
      expect((await kwil.call(body, signerA)).status).toBe(200);
      expect(sentTo('user.call').map((c) => c.headers.Authorization)).toStrictEqual([undefined]);
    });

    it('sends no gateway token to a node in private mode', async () => {
      const gw = kgw({ issuesTokens: true });
      gw.mode = 'private';
      const kwil = new NodeKwil({ ...config, sessionTokens: { [keyOf(walletA)]: 'held-token' } });

      expect((await kwil.call(body, signerA)).status).toBe(200);
      expect(sentTo('user.challenge')).toHaveLength(1);
      expect(sentTo('user.call').map((c) => c.headers.Authorization)).toStrictEqual([undefined]);
    });

    it('works as before with a gateway that issues no token', async () => {
      const gw = kgw({ issuesTokens: false });
      const seen: [string, string | undefined][] = [];
      const kwil = new NodeKwil({ ...config, onSessionToken: (id, t) => seen.push([id, t]) });

      expect((await kwil.call(body, signerA)).status).toBe(200);
      expect((await kwil.call(body, signerA)).status).toBe(200);
      expect(gw.signIns).toBe(1);
      expect(seen).toEqual([]);
      mockSent.forEach((s) => expect(s.headers.Authorization).toBeUndefined());
    });
  });

  it('keeps one key per signer, however often the 0x prefix repeats', () => {
    const key = sessionTokenKey('0x0xAB12');
    expect(key).toBe('ab12');
    expect(sessionTokenKey(key)).toBe(key);
    expect(sessionTokenKey('0XAB12')).toBe(key);
  });

  it('setSessionToken does not call onSessionToken, and an empty token clears', () => {
    const onSessionToken = jest.fn();
    const kwil = new NodeKwil({ ...config, onSessionToken });
    kwil.setSessionToken(walletA.address, 'x');
    expect(kwil.getSessionToken(keyOf(walletA))).toBe('x');
    kwil.setSessionToken(walletA.address, '');
    expect(kwil.getSessionToken(walletA.address)).toBeUndefined();
    expect(onSessionToken).not.toHaveBeenCalled();
  });
});
