import { encodeEncodedValue, encodeMAAExec } from '../../../src/utils/kwilEncoding';
import { MAAExecPayload } from '../../../src/core/payload';
import { PayloadType } from '../../../src/core/enums';
import { base64ToBytes } from '../../../src/utils/base64';
import { bytesToHex, stringToBytes } from '../../../src/utils/serial';
import { concatBytes, numberToUint16LittleEndian, prefixBytesLength } from '../../../src/utils/bytes';
import { formatEncodedValue } from '../../../src/utils/parameterEncoding';

/**
 * The MAAExec wire layout is a consensus contract: the node, kwil-js, and the language SDKs must all
 * serialize it identically (a single byte of divergence rewrites which action runs, or under whose
 * identity). These tests freeze that layout against the Go golden vector in kwil-db
 * (core/types/payloads_maa_test.go). The golden vector uses ZERO arguments so its bytes are fully
 * determined by the MAA-specific framing; argument encoding reuses the shared EncodedValue format
 * already covered elsewhere, and is pinned structurally below.
 */
describe('encodeMAAExec — kwil-db MAAExec.MarshalBinary parity', () => {
  // Copied verbatim from kwil-db core/types/payloads_maa_test.go (goldenMAAExecHex).
  const goldenMAAExecHex =
    '0000' + // uint16 version = 0 (little-endian)
    '14000000' +
    '1111111111111111111111111111111111111111' + // WriteBytes(maa_address): len=20, then 20 bytes
    '04000000' +
    '6d61696e' + // WriteString("main"): len=4, then "main"
    '0e000000' +
    '6f625f706c6163655f6f72646572' + // WriteString("ob_place_order"): len=14, then bytes
    '0000'; // uint16 numArgs = 0

  test('the enum string value is the wire contract', () => {
    expect(PayloadType.MAA_EXEC).toBe('maa_exec');
  });

  test('zero-argument vector is byte-identical to the Go golden vector', () => {
    const payload: MAAExecPayload = {
      maaAddress: new Uint8Array(20).fill(0x11),
      namespace: 'main',
      action: 'ob_place_order',
      arguments: [],
    };

    const bytes = base64ToBytes(encodeMAAExec(payload));
    expect(bytesToHex(bytes)).toBe(goldenMAAExecHex);
  });

  test('arguments use the single-call framing: numArgs then per-arg length-prefixed EncodedValue', () => {
    const maaAddress = new Uint8Array(20).fill(0x22);
    const arg0 = formatEncodedValue('0xabc');
    const arg1 = formatEncodedValue(42);

    const payload: MAAExecPayload = {
      maaAddress,
      namespace: 'main',
      action: 'maa_record_event',
      arguments: [arg0, arg1],
    };

    const got = base64ToBytes(encodeMAAExec(payload));

    // Reconstruct the expected wire bytes from the same primitives the Go MarshalBinary uses, in
    // order: version, WriteBytes(maa), WriteString(ns), WriteString(action), uint16 numArgs, then
    // each argument as WriteBytes(EncodedValue.MarshalBinary()).
    const expected = concatBytes(
      numberToUint16LittleEndian(0),
      prefixBytesLength(maaAddress),
      prefixBytesLength(stringToBytes('main')),
      prefixBytesLength(stringToBytes('maa_record_event')),
      numberToUint16LittleEndian(2),
      prefixBytesLength(encodeEncodedValue(arg0)),
      prefixBytesLength(encodeEncodedValue(arg1))
    );

    expect(bytesToHex(got)).toBe(bytesToHex(expected));
  });

  test('empty namespace serializes as a present zero-length string (len 0), not the nil sentinel', () => {
    const payload: MAAExecPayload = {
      maaAddress: new Uint8Array(20).fill(0x11),
      namespace: '',
      action: 'x',
      arguments: [],
    };

    const bytes = base64ToBytes(encodeMAAExec(payload));
    // version(0000) + maa(len20 + 20 bytes) + ns(len 0 => 00000000) + action(len1 + 'x'=78) + numArgs(0000)
    const expectedHex =
      '0000' +
      '14000000' +
      '1111111111111111111111111111111111111111' +
      '00000000' +
      '01000000' +
      '78' +
      '0000';
    expect(bytesToHex(bytes)).toBe(expectedHex);
  });
});
