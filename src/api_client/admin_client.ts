import Axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

/**
 * Configuration for the admin JSON-RPC client.
 */
export interface AdminClientConfig {
  /** URL of the admin JSON-RPC server (e.g., "http://127.0.0.1:8485") */
  adminProvider: string;
  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** Enable request/response logging */
  logging?: boolean;
  /** Custom logger function */
  logger?: (msg: string) => any;
  /**
   * Basic auth credentials for the admin server.
   * Used when the admin server is configured with password authentication.
   */
  auth?: {
    username: string;
    password: string;
  };
  /**
   * Additional Axios request configuration.
   * Use this for advanced scenarios such as mTLS:
   *
   * ```ts
   * import https from 'https';
   * const client = new AdminClient({
   *   adminProvider: 'https://node.example.com:8485',
   *   axiosConfig: {
   *     httpsAgent: new https.Agent({ ca, cert, key }),
   *   },
   * });
   * ```
   */
  axiosConfig?: AxiosRequestConfig;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: unknown;
}

interface JsonRpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
}

/**
 * Generic admin JSON-RPC client for the kwil-db admin server.
 *
 * This client is **Node.js only** — admin operations should never run in
 * a browser. It provides a single `callMethod()` that sends a JSON-RPC 2.0
 * request to the admin port and returns the typed result.
 *
 * No domain-specific methods are defined here — this is pure transport.
 * TN-specific local-stream methods live in sdk-js's `LocalActions`.
 *
 * @example Basic auth
 * ```ts
 * const admin = new AdminClient({
 *   adminProvider: 'http://127.0.0.1:8485',
 *   auth: { username: 'admin', password: 'secret' },
 * });
 * const result = await admin.callMethod<StatusResult>('admin.status', {});
 * ```
 *
 * @example mTLS
 * ```ts
 * import https from 'https';
 * const admin = new AdminClient({
 *   adminProvider: 'https://node.example.com:8485',
 *   axiosConfig: {
 *     httpsAgent: new https.Agent({ ca, cert, key }),
 *   },
 * });
 * ```
 */
export class AdminClient {
  private readonly adminProvider: string;
  private readonly timeout: number;
  private readonly logging: boolean;
  private readonly logger: (msg: string) => any;
  private readonly authConfig?: { username: string; password: string };
  private readonly extraAxiosConfig?: AxiosRequestConfig;
  private jsonRpcId: number = 1;

  constructor(config: AdminClientConfig) {
    if (typeof window !== 'undefined') {
      throw new Error(
        'AdminClient is only available in Node.js environments. ' +
          'The admin API should not be exposed to browsers.'
      );
    }

    if (!config.adminProvider) {
      throw new Error('No admin provider URL provided in AdminClientConfig.');
    }

    this.adminProvider = config.adminProvider;
    this.timeout = config.timeout ?? 10000;
    this.logging = config.logging ?? false;
    this.logger = config.logger ?? console.log;
    this.authConfig = config.auth;
    this.extraAxiosConfig = config.axiosConfig;
  }

  /**
   * Call a JSON-RPC method on the admin server.
   *
   * @param method - The JSON-RPC method name (e.g., "admin.status", "local.create_stream")
   * @param params - The parameters to send with the request
   * @returns The result from the JSON-RPC response, typed as `T`
   * @throws Error if the server returns a non-200 status, a JSON-RPC error, or no result
   */
  async callMethod<T = unknown>(method: string, params: unknown): Promise<T> {
    const body: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: this.jsonRpcId++,
      method,
      params: params ?? {},
    };

    const perRequestConfig: AxiosRequestConfig = { ...this.extraAxiosConfig };

    if (this.authConfig) {
      perRequestConfig.auth = {
        username: this.authConfig.username,
        password: this.authConfig.password,
      };
    }

    const instance = this.createInstance();

    let res;
    try {
      res = await instance.post<JsonRpcResponse<T>>('/rpc/v1', body, perRequestConfig);
    } catch (error: any) {
      if (error.response && error.response.status) {
        res = error.response;
      } else {
        throw error;
      }
    }

    if (res.status !== 200) {
      throw new Error(
        JSON.stringify(res.data) || `Admin RPC request failed with status ${res.status}`
      );
    }

    if (!res.data) {
      throw new Error('Failed to parse admin RPC response.');
    }

    if (res.data.error) {
      const data = res.data.error.data
        ? `, data: ${JSON.stringify(res.data.error.data)}`
        : '';
      throw new Error(
        `Admin RPC error: code: ${res.data.error.code}, message: ${res.data.error.message}` +
          data
      );
    }

    if (res.data.jsonrpc !== '2.0') {
      throw new Error(JSON.stringify(res.data) || 'Invalid JSON-RPC response from admin server.');
    }

    // Allow null/undefined results — some methods (like create_stream) return empty
    return res.data.result as T;
  }

  private createInstance(): AxiosInstance {
    const instance = Axios.create({
      baseURL: this.adminProvider,
      timeout: this.timeout,
    });

    if (this.logging) {
      instance.interceptors.request.use((request) => {
        this.logger(`Admin RPC Request: ${request.baseURL}${request.url}`);
        return request;
      });

      instance.interceptors.response.use((response) => {
        this.logger(`Admin RPC Response: ${response.config.url} - ${response.status}`);
        return response;
      });
    }

    return instance;
  }
}
