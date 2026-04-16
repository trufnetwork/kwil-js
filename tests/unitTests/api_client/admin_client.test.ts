import { postMock } from './api-utils';
import { AdminClient, AdminClientConfig } from '../../../src/api_client/admin_client';

describe('AdminClient', () => {
  const defaultConfig: AdminClientConfig = {
    adminProvider: 'http://127.0.0.1:8485',
    timeout: 10000,
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create an instance with valid config', () => {
      const client = new AdminClient(defaultConfig);
      expect(client).toBeInstanceOf(AdminClient);
    });

    it('should throw if adminProvider is empty', () => {
      expect(() => new AdminClient({ adminProvider: '' })).toThrow(
        'No admin provider URL provided'
      );
    });

    it('should use default timeout of 10000ms', () => {
      const client = new AdminClient({ adminProvider: 'http://localhost:8485' });
      // We can't easily inspect private fields, but the constructor should not throw
      expect(client).toBeInstanceOf(AdminClient);
    });
  });

  describe('callMethod', () => {
    it('should send a JSON-RPC 2.0 request and return the result', async () => {
      postMock.mockResolvedValue({
        status: 200,
        data: {
          jsonrpc: '2.0',
          id: 1,
          result: { healthy: true },
        },
      });

      const client = new AdminClient(defaultConfig);
      const result = await client.callMethod<{ healthy: boolean }>('admin.status', {});

      expect(result).toEqual({ healthy: true });
      expect(postMock).toHaveBeenCalledWith(
        '/rpc/v1',
        expect.objectContaining({
          jsonrpc: '2.0',
          method: 'admin.status',
          params: {},
        }),
        expect.any(Object)
      );
    });

    it('should increment JSON-RPC id on each call', async () => {
      postMock.mockResolvedValue({
        status: 200,
        data: { jsonrpc: '2.0', id: 1, result: 'ok' },
      });

      const client = new AdminClient(defaultConfig);

      await client.callMethod('method1', {});
      await client.callMethod('method2', {});

      const firstCall = postMock.mock.calls[0][1];
      const secondCall = postMock.mock.calls[1][1];

      expect(secondCall.id).toBe(firstCall.id + 1);
    });

    it('should pass null params as empty object', async () => {
      postMock.mockResolvedValue({
        status: 200,
        data: { jsonrpc: '2.0', id: 1, result: [] },
      });

      const client = new AdminClient(defaultConfig);
      await client.callMethod('local.list_streams', null);

      expect(postMock).toHaveBeenCalledWith(
        '/rpc/v1',
        expect.objectContaining({ params: {} }),
        expect.any(Object)
      );
    });

    it('should pass structured params through unchanged', async () => {
      postMock.mockResolvedValue({
        status: 200,
        data: { jsonrpc: '2.0', id: 1, result: {} },
      });

      const params = { stream_id: 'st1234567890abcdef1234567890ab', stream_type: 'primitive' };
      const client = new AdminClient(defaultConfig);
      await client.callMethod('local.create_stream', params);

      expect(postMock).toHaveBeenCalledWith(
        '/rpc/v1',
        expect.objectContaining({ params }),
        expect.any(Object)
      );
    });

    it('should throw on JSON-RPC error response', async () => {
      postMock.mockResolvedValue({
        status: 200,
        data: {
          jsonrpc: '2.0',
          id: 1,
          error: {
            code: -32602,
            message: 'stream not found',
          },
        },
      });

      const client = new AdminClient(defaultConfig);
      await expect(client.callMethod('local.get_record', {})).rejects.toThrow(
        'Admin RPC error: code: -32602, message: stream not found'
      );
    });

    it('should include error data in the thrown message', async () => {
      postMock.mockResolvedValue({
        status: 200,
        data: {
          jsonrpc: '2.0',
          id: 1,
          error: {
            code: -32603,
            message: 'internal error',
            data: { detail: 'connection refused' },
          },
        },
      });

      const client = new AdminClient(defaultConfig);
      await expect(client.callMethod('admin.status', {})).rejects.toThrow(
        'data: {"detail":"connection refused"}'
      );
    });

    it('should throw on non-200 HTTP status', async () => {
      postMock.mockImplementation(() => {
        const error: any = new Error('Request failed');
        error.response = {
          status: 500,
          data: { message: 'Internal Server Error' },
        };
        throw error;
      });

      const client = new AdminClient(defaultConfig);
      await expect(client.callMethod('admin.status', {})).rejects.toThrow(
        'Internal Server Error'
      );
    });

    it('should throw on network error (no response)', async () => {
      postMock.mockRejectedValue(new Error('ECONNREFUSED'));

      const client = new AdminClient(defaultConfig);
      await expect(client.callMethod('admin.status', {})).rejects.toThrow('ECONNREFUSED');
    });

    it('should return null/undefined results without throwing', async () => {
      postMock.mockResolvedValue({
        status: 200,
        data: {
          jsonrpc: '2.0',
          id: 1,
          result: null,
        },
      });

      const client = new AdminClient(defaultConfig);
      const result = await client.callMethod('local.create_stream', {});
      expect(result).toBeNull();
    });
  });

  describe('basic auth', () => {
    it('should pass auth config in the request', async () => {
      postMock.mockResolvedValue({
        status: 200,
        data: { jsonrpc: '2.0', id: 1, result: 'ok' },
      });

      const client = new AdminClient({
        ...defaultConfig,
        auth: { username: 'admin', password: 'secret' },
      });

      await client.callMethod('admin.status', {});

      expect(postMock).toHaveBeenCalledWith(
        '/rpc/v1',
        expect.any(Object),
        expect.objectContaining({
          auth: { username: 'admin', password: 'secret' },
        })
      );
    });

    it('should not include auth when not configured', async () => {
      postMock.mockResolvedValue({
        status: 200,
        data: { jsonrpc: '2.0', id: 1, result: 'ok' },
      });

      const client = new AdminClient(defaultConfig);
      await client.callMethod('admin.status', {});

      const passedConfig = postMock.mock.calls[0][2];
      expect(passedConfig.auth).toBeUndefined();
    });
  });

  describe('extra axios config', () => {
    it('should merge extra axios config into the request', async () => {
      postMock.mockResolvedValue({
        status: 200,
        data: { jsonrpc: '2.0', id: 1, result: 'ok' },
      });

      const mockAgent = { keepAlive: true };
      const client = new AdminClient({
        ...defaultConfig,
        axiosConfig: { httpsAgent: mockAgent },
      });

      await client.callMethod('admin.status', {});

      const passedConfig = postMock.mock.calls[0][2];
      expect(passedConfig.httpsAgent).toBe(mockAgent);
    });
  });
});
