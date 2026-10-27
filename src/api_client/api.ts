import Axios, { AxiosResponse, AxiosRequestConfig, AxiosInstance } from 'axios';
import { ApiConfig } from './config';
import { sessionTokenKey } from '../core/auth';
/*
    Based off https://github.com/ArweaveTeam/arweave-js/blob/189beeba86eb58605be42cfe9d9bd53e35e3ea11/src/common/lib/api.ts#L3
    Since the Arweave SDK has a great typescript API, I've based this off of that.

    Copyright 2020 The Arweave Team Copyright 2020 Minimum Spanning Technologies Limited
    Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

/**
 * True for a request the browser stopped before any answer came back, which is
 * how a refused CORS preflight shows. A timeout, a cancel, or an error the
 * server answered is not one. In a browser, axios puts the XMLHttpRequest in
 * `response` with status 0, so only a response with a status counts as an answer.
 */
export function isNetworkError(error: any): boolean {
  return error?.code === 'ERR_NETWORK' && !error.response?.status;
}

/**
 * True for a request that got no answer at all: an axios error without a
 * response status, such as a network error, a timeout or a cancel. An error the
 * client raises for an answer the server sent, such as a JSON-RPC error, is not one.
 */
export function isUnanswered(error: any): boolean {
  return error?.isAxiosError === true && !error.response?.status;
}

export abstract class Api {
  //private readonly METHOD_GET = 'GET';
  //private readonly METHOD_POST = 'POST';
  protected cookie?: string;
  /**
   * Gateway session tokens, one per signer, keyed by sessionTokenKey. A call is
   * sent with its signer's token as "Authorization: Bearer <token>", which holds
   * the gateway session where the session cookie is dropped, such as in a
   * wallet's in-app browser.
   */
  protected readonly sessionTokens = new Map<string, string>();
  // false while the gateway seems to refuse the Authorization header on calls; a
  // sign-in that returns a token, or a signer's held token tried again after a
  // refusal, turns it back on. Logout sends the tokens it holds either way.
  protected sendSessionTokens = true;
  private readonly onSessionToken?: (identifier: string, token: string | undefined) => void;
  protected readonly config: ApiConfig;
  protected constructor(opts: ApiConfig) {
    this.config = this.mergeDefaults(opts);
    Object.entries(opts.sessionTokens || {}).forEach(([identifier, token]) => {
      if (token) {
        this.sessionTokens.set(sessionTokenKey(identifier), token);
      }
    });
    this.onSessionToken = opts.onSessionToken;
  }

  /**
   * Replaces a signer's session token after a sign-in, a logout, or a refusal by
   * the gateway, and tells the app through onSessionToken.
   */
  protected updateSessionToken(identifier: string, token: string | undefined): void {
    const key = sessionTokenKey(identifier);
    if (this.sessionTokens.get(key) === token) {
      return;
    }
    if (token) {
      this.sessionTokens.set(key, token);
    } else {
      this.sessionTokens.delete(key);
    }

    if (this.onSessionToken) {
      // a failing callback, such as blocked storage, must not fail the call
      const failed = (error: unknown) => {
        if (this.config.logging) {
          this.config.logger!(`onSessionToken failed: ${error}`);
        }
      };
      try {
        const done: unknown = this.onSessionToken(key, token);
        // an async callback's rejection would otherwise go unhandled
        if (typeof (done as PromiseLike<unknown> | undefined)?.then === 'function') {
          Promise.resolve(done).catch(failed);
        }
      } catch (error) {
        failed(error);
      }
    }
  }

  // the token to send with a signer's call, if any: none once the gateway turned
  // out to refuse the header (logout still sends the tokens it holds)
  protected sessionTokenFor(key: string): string | undefined {
    return this.sendSessionTokens ? this.sessionTokens.get(key) : undefined;
  }

  // request config that sends a session token
  protected sessionTokenConfig(token?: string): AxiosRequestConfig | undefined {
    return token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
  }

  private mergeDefaults(opts: ApiConfig): ApiConfig {
    if (!opts.kwilProvider) {
      throw new Error('No Kwil provider URL provided in configuration');
    }

    return {
      kwilProvider: opts.kwilProvider,
      timeout: opts.timeout || 10000,
      logging: opts.logging || false,
      logger: opts.logger || console.log,
      cache: opts.cache || 10 * 60,
    };
  }

  protected async get<T = any>(
    endpoint: string,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    try {
      return await this.request().get<T>(endpoint, config);
    } catch (error: any) {
      if (error.response && error.response.status) {
        return error.response;
      }

      this.redactSession(error);
      throw error;
    }
  }

  protected async post<T = any>(
    endpoint: string,
    body: Buffer | string | object,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    try {
      return await this.request().post(endpoint, body, config);
    } catch (error: any) {
      if (error.response && error.response.status) {
        return error.response;
      }

      this.redactSession(error);
      throw error;
    }
  }

  // An error may reach an error reporter: keep the session token, and in Node the
  // session cookie, out of it. In Node the request object still holds the raw
  // header text, so it goes.
  private redactSession(error: any): void {
    const headers = error?.config?.headers;
    if (headers?.Authorization || headers?.Cookie) {
      if (headers.Authorization) {
        headers.Authorization = '[redacted]';
      }
      if (headers.Cookie) {
        headers.Cookie = '[redacted]';
      }
      delete error.request;
    }
  }

  /**
   * Get an AxiosInstance with the base configuration setup to fire off
   * a request to the network.
   */
  protected request(): AxiosInstance {
    let headers: any = {}

    if (this.cookie) {
      headers.Cookie = this.cookie;
    }

    let instance = Axios.create({
      baseURL: this.config.kwilProvider,
      timeout: this.config.timeout,
      maxContentLength: 1024 * 1024 * 512,
      withCredentials: true,
      headers,
    });

    if (this.config.logging) {
      instance.interceptors.request.use((request) => {
        this.config.logger!(`Requesting: ${request.baseURL}${request.url}`);
        return request;
      });

      instance.interceptors.response.use((response) => {
        this.config.logger!(`Response:   ${response.config.url} - ${response.status}`);
        return response;
      });
    }
    return instance;
  }
}
