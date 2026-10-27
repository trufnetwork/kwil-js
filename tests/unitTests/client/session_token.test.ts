import { Wallet } from 'ethers';
import { KwilSigner, NodeKwil, WebKwil } from '../../../src';

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

// kgw models the gateway in kgw#121: a cookie that holds every account's
// session, and (when it issues tokens) a token that names one session. Every
// token the gateway signed verifies, and a token that verifies is used instead
// of the cookie: its session must still be live and belong to the call's
// sender. A token the gateway never signed leaves the cookie in charge. A
// sign-in reuses the account's live session in the cookie and makes a new one
// otherwise. Logout with a token ends that session and leaves the cookie alone.
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
  let held: { arrived: () => void; wait: Promise<void> } | undefined;
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
    logoutError: false,
    // a session made outside the client, as an earlier page load would have
    seed(account: string): string {
      return tokenFor(newSession(account));
    },
    // ends a token's session on the gateway, as its lifetime running out would
    expire(token: string): void {
      sessions.delete(signed.get(token)!);
    },
    // holds the answer to the next call until release; sent resolves once it arrives
    holdNextCall(): { sent: Promise<void>; release: () => void } {
      let arrived!: () => void;
      let release!: () => void;
      const sent = new Promise<void>((r) => (arrived = r));
      held = { arrived, wait: new Promise<void>((r) => (release = r)) };
      return { sent, release };
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
        code: 'ERR_NETWORK',
        config: { headers: { ...headers } },
        request: xhr,
        response: xhr,
      });
    }
    if (state.timeout && method === 'user.call') {
      throw Object.assign(new Error('timeout of 10000ms exceeded'), {
        code: 'ECONNABORTED',
        config: { headers: { ...headers } },
      });
    }
    switch (method) {
      case 'user.health':
        return ok({ mode: 'open' });
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
        if (state.logoutError) {
          return {
            status: 200,
            data: { jsonrpc: '2.0', id: 1, error: { code: -902, message: 'bad request' } },
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
        if (held) {
          const h = held;
          held = undefined;
          h.arrived();
          await h.wait;
        }
        if (state.callError) {
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
      const hold = gw.holdNextCall();
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
      await kwil.auth.logoutKGW(signerA).catch(() => undefined);
      expect(kwil.getSessionToken(walletA.address)).toBe('t-s1');
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
      await kwil.auth.logoutKGW();
      expect(sentTo('kgw.logout').map((l) => l.headers.Authorization)).toStrictEqual([
        'Bearer t-s1',
        'Bearer t-s2',
        undefined,
      ]);
      expect(kwil.getSessionToken(walletA.address)).toBeUndefined();
      expect(kwil.getSessionToken(walletB.address)).toBeUndefined();
      await kwil.call(body, signerA);
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
      expect(seen[seen.length - 1]).toEqual([keyOf(walletA), undefined]);
      expect(gw.signIns).toBe(1);

      // a wallet that signs in afterwards gets a token, which is not sent either
      expect((await kwil.call(body, signerB)).status).toBe(200);
      expect(kwil.getSessionToken(walletB.address)).toBe('t-s2');
      // the token call is tried twice before the call goes out without it
      expect(sentTo('user.call').map((c) => c.headers.Authorization)).toStrictEqual([
        'Bearer t-s1',
        'Bearer t-s1',
        undefined,
        undefined,
        undefined,
        undefined,
      ]);
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
