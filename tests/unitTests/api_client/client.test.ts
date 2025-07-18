import { postMock } from './api-utils';
import Client from '../../../src/api_client/client';
import { Transaction, Txn } from '../../../src/core/tx';
import { CallClientResponse, Message } from '../../../src/core/message';
import { BytesEncodingStatus } from '../../../src/core/enums';
import { stringToBytes } from '../../../dist/utils/serial';
import { bytesToBase64 } from '../../../src/utils/base64';
import { ClientConfig } from '../../../src/api_client/config';
import { GenericResponse } from '../../../src/core/resreq';
import { Account, ChainInfo, DatasetInfo } from '../../../src/core/network';
import { TxInfoReceipt } from '../../../src/core/txQuery';
import { SelectQueryRequest } from '../../../src/core/jsonrpc';

require('dotenv').config();

// Test class that exposes protected methods
class TestClient extends Client {
    constructor(opts: ClientConfig) {
        super(opts);
    }

    public async getSchema(dbid: string): Promise<GenericResponse<any>> {
        // We'll simulate it using a direct API call as it is expected by the test
        return await this.get(`/api/v1/databases/${dbid}/schema`);
    }

    public async getAccount(accountId: Uint8Array): Promise<GenericResponse<Account>> {
        return await this.getAccountClient({ identifier: bytesToBase64(accountId), key_type: 'secp256k1' });
    }

    public async listDatabases(owner: Uint8Array): Promise<GenericResponse<DatasetInfo[]>> {
        return await this.listDatabasesClient(owner);
    }

    public async estimateCost(tx: Transaction): Promise<GenericResponse<string>> {
        return await this.estimateCostClient(tx);
    }

    public async broadcast(tx: Transaction): Promise<GenericResponse<{tx_hash: string}>> {
        const result = await this.broadcastClient(tx);
        return {
            status: result.status,
            data: result.data ? { tx_hash: result.data.tx_hash } : undefined
        };
    }

    public async ping(): Promise<GenericResponse<string>> {
        return await this.pingClient();
    }

    public async chainInfo(): Promise<GenericResponse<ChainInfo>> {
        return await this.chainInfoClient();
    }

    public async selectQuery(query: SelectQueryRequest): Promise<GenericResponse<Record<string, any>[]>> {
        return await this.selectQueryClient(query);
    }

    public async txInfo(tx_hash: string): Promise<GenericResponse<TxInfoReceipt>> {
        return await this.txInfoClient(tx_hash);
    }

    public async call(msg: Message): Promise<CallClientResponse<any>> {
        return await this.callClient(msg);
    }
}

describe('Client', () => {
    let client: TestClient;
    const mockConfig = {
        kwilProvider: 'https://shouldntmatter.com',
        timeout: 10000,
        apiKey: '',
        logging: false,
        logger: jest.fn(),
        network: ''
    };

    beforeEach(() => {
        client = new TestClient(mockConfig);
    });

    afterEach(() => {
        jest.clearAllMocks();
    })

    describe('getAccount', () => {
        it('should get account if account exists', async () => {
            postMock.mockResolvedValue({
                status: 200,
                data: {
                    jsonrpc: '2.0',
                    id: 1,
                    result: {
                        id: {
                            identifier: 'bW9ja093bmVy',
                            key_type: 'secp256k1'
                        },
                        nonce: 1,
                        balance: 'mockBalance'
                    }
                }
            });
            const result = await client.getAccount(stringToBytes('someAddress'));
            expect(result.status).toBe(200);
            expect(result.data?.id?.identifier).toBeDefined();
            expect(postMock).toHaveBeenCalledWith('/rpc/v1', expect.objectContaining({
                jsonrpc: '2.0',
                method: 'user.account'
            }), undefined);
        });

        it('should throw error if account does not exist', async () => {
            const mockRes = {
                status: 200,
                data: {
                    jsonrpc: '2.0',
                    id: 1,
                    error: {
                        code: -32602,
                        message: 'Account not found'
                    }
                }
            };

            postMock.mockResolvedValue(mockRes);

            await expect(client.getAccount(stringToBytes('someAddress'))).rejects.toThrow('JSON RPC call error: code: -32602, message: Account not found');
            expect(postMock).toHaveBeenCalledWith('/rpc/v1', expect.objectContaining({
                jsonrpc: '2.0',
                method: 'user.account'
            }), undefined);
        });
    })

    describe('broadcast', () => {
        it('should throw an error when broadcasting an unsigned transaction', async () => {
            const tx = Txn.create<BytesEncodingStatus.BASE64_ENCODED>(() => {}); // Assuming this transaction is unsigned by default
            await expect(client.broadcast(tx)).rejects.toThrow('Tx must be signed before broadcasting.');
        });
    });
});