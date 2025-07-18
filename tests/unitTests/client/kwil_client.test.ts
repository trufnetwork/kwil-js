import { getMock, postMock } from "../api_client/api-utils";
import { Msg } from "../../../src/core/message";
import { stringToBytes, stringToHex } from "../../../src/utils/serial";
import { bytesToBase64 } from "../../../src/utils/base64";
import { Wallet } from "ethers";
import { KwilSigner } from "../../../src";
import { ActionBody, ActionInput } from "../../../src/core/action";
import { DeployBody } from "../../../src/core/database";
import compiledKF from '../../test_schema2.json'
import { DropBody } from "../../../src/core/database";
import { NodeKwil } from "../../../src";

class TestKwil extends NodeKwil {
    constructor() {
        super({kwilProvider: 'doesnt matter', chainId: 'doesnt matter'});
    }
}

describe('Kwil', () => {
    let kwil: TestKwil;

    beforeEach(() => {
        kwil = new TestKwil();
        getMock.mockReset();
        postMock.mockReset();
    });

    const address = '0xAfFDC06cF34aFD7D5801A13d48C92AD39609901D'

    describe('getDBID', () => {
        it('should return the dbid', () => {
            const dbid = kwil.getDBID(address, 'mydb');
            expect(dbid).toBe('x52197631a5de74a1e293681181c2a63418d7ae710a3f0370d91a99bd');
        });
    })


    describe('getAccount', () => {
        it('should return account info for a given wallet address', async () => {
            const mockAccount = {
                id: {
                    identifier: address,
                    key_type: 'secp256k1'
                },
                balance: 'mockBalance',
                nonce: 123
            }

            postMock.mockResolvedValue({
                status: 200,
                data: {
                    jsonrpc: '2.0',
                    id: 1,
                    result: mockAccount
                }
            });

            const result = await kwil.getAccount(address);
            expect(result.status).toBe(200);
            expect(result.data?.id?.identifier).toBe(address);
            expect(result.data?.balance).toBe(mockAccount.balance);
            expect(result.data?.nonce).toBe(mockAccount.nonce);
        })
    })





});