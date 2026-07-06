import {
  decodeActionExecution,
  decodeDataType,
  decodeEncodedValue,
  decodeValue,
} from '../../../src/utils/kwilDecoding';
import { encodeActionExecution, encodeEncodedValue } from '../../../src/utils/kwilEncoding';
import { formatEncodedValue } from '../../../src/utils/parameterEncoding';
import { EncodedValue, UnencodedActionPayload } from '../../../src/core/payload';
import { PayloadType, VarType } from '../../../src/core/enums';
import { base64ToBytes } from '../../../src/utils/base64';
import { hexToBytes } from '../../../src/utils/serial';

/**
 * kwilDecoding is the inverse of kwilEncoding and a port of kwil-db's `ActionExecution.UnmarshalBinary`
 * / `EncodedValue.UnmarshalBinary` / `DataType.UnmarshalBinary` / `EncodedValue.Decode`. The wire
 * layout is a consensus contract, so these tests pin it two ways: (1) an explicit hardcoded byte
 * vector for the outer framing, computed by hand from the documented layout so a bug in the encoder
 * cannot hide the same bug in the decoder; and (2) full encode -> decode round-trips proving the
 * decoder is the exact inverse, plus native-value assertions matching kwil-db's `Decode`.
 */

function build(dbid: string, action: string, calls: EncodedValue[][]): {
  dbid: string;
  action: string;
  arguments: EncodedValue[][];
} {
  return { dbid, action, arguments: calls };
}

describe('decodeActionExecution — hardcoded golden vector (outer framing)', () => {
  // Hand-computed from the ActionExecution layout, independent of the encoder:
  //   uint16-LE version = 0                      -> 0000
  //   WriteString(dbid="")   len=0               -> 00000000
  //   WriteString(action="create_streams") len=14-> 0e000000 + utf8("create_streams")
  //   uint16-LE numCalls = 0                     -> 0000
  const goldenHex =
    '0000' + // version
    '00000000' + // dbid = "" (uint32-LE length 0)
    '0e000000' + // action length = 14 (uint32-LE)
    '6372656174655f73747265616d73' + // "create_streams"
    '0000'; // numCalls = 0

  test('decodes action name and empty argument list from raw bytes', () => {
    const decoded = decodeActionExecution(hexToBytes(goldenHex));
    expect(decoded.dbid).toBe('');
    expect(decoded.action).toBe('create_streams');
    expect(decoded.arguments).toEqual([]);
  });
});

describe('decodeActionExecution — inverse of encodeActionExecution', () => {
  test('round-trips a single-call, multi-arg deploy-style payload', () => {
    const payload: UnencodedActionPayload<PayloadType.EXECUTE_ACTION> = build(
      'main',
      'create_streams',
      [[formatEncodedValue('st_temperature'), formatEncodedValue('primitive')]]
    );

    const encoded = encodeActionExecution(payload);
    const decoded = decodeActionExecution(encoded); // accepts the base64 string form

    expect(decoded.dbid).toBe('main');
    expect(decoded.action).toBe('create_streams');
    expect(decoded.arguments).toHaveLength(1);
    expect(decoded.arguments[0]).toHaveLength(2);

    // Re-encoding the decoded structure reproduces the original bytes exactly.
    expect(encodeActionExecution(decoded)).toBe(encoded);
  });

  test('round-trips a batched (multi-call) payload', () => {
    const payload: UnencodedActionPayload<PayloadType.EXECUTE_ACTION> = build('main', 'insert_records', [
      [formatEncodedValue('stream_a'), formatEncodedValue(100)],
      [formatEncodedValue('stream_b'), formatEncodedValue(200)],
      [formatEncodedValue('stream_c'), formatEncodedValue(300)],
    ]);

    const encoded = encodeActionExecution(payload);
    const decoded = decodeActionExecution(base64ToBytes(encoded));

    expect(decoded.action).toBe('insert_records');
    expect(decoded.arguments).toHaveLength(3);
    expect(encodeActionExecution(decoded)).toBe(encoded);
  });

  test('round-trips a zero-argument call', () => {
    const payload = build('main', 'noop', [[]]);
    const encoded = encodeActionExecution(payload);
    const decoded = decodeActionExecution(encoded);

    expect(decoded.arguments).toEqual([[]]);
    expect(encodeActionExecution(decoded)).toBe(encoded);
  });

  test('rejects an unsupported version', () => {
    // version = 1 (little-endian) then an empty dbid/action/numCalls
    const bad = hexToBytes('0100' + '00000000' + '00000000' + '0000');
    expect(() => decodeActionExecution(bad)).toThrow(/unsupported ActionExecution version/);
  });

  test('rejects a truncated payload', () => {
    expect(() => decodeActionExecution(hexToBytes('0000'))).toThrow(RangeError);
  });
});

describe('decodeEncodedValue / decodeDataType — inverse of encodeEncodedValue', () => {
  test('round-trips the EncodedValue and its DataType', () => {
    const ev = formatEncodedValue('hello');
    const decoded = decodeEncodedValue(encodeEncodedValue(ev));

    expect(decoded.type.name).toBe(VarType.TEXT);
    expect(decoded.type.is_array).toBe(false);
    // Re-encoding reproduces the original bytes.
    expect(encodeEncodedValue(decoded)).toEqual(encodeEncodedValue(ev));
  });

  test('decodeDataType reads the big-endian DataType fields', () => {
    const ev = formatEncodedValue(42); // int8, metadata [precision, scale]
    const decoded = decodeEncodedValue(encodeEncodedValue(ev));

    expect(decoded.type.name).toBe(VarType.INT8);
    expect(decoded.type.is_array).toBe(false);
    expect(decoded.type.metadata).toEqual(ev.type.metadata);
  });
});

describe('decodeValue — kwil-db EncodedValue.Decode parity', () => {
  test('decodes text', () => {
    expect(decodeValue(formatEncodedValue('trufnetwork'))).toBe('trufnetwork');
  });

  test('decodes an integer as bigint', () => {
    expect(decodeValue(formatEncodedValue(1732055))).toBe(1732055n);
  });

  test('decodes a large integer without precision loss', () => {
    // Values above 2^53 cannot be a JS number, so build the int8 element directly:
    // one null-flag byte (1 = not null) followed by the 8-byte big-endian int64.
    const element = new Uint8Array(9);
    element[0] = 1;
    new DataView(element.buffer).setBigInt64(1, 9007199254740993n, false);
    const ev: EncodedValue = {
      type: { name: VarType.INT8, is_array: false, metadata: [0, 0] },
      data: [element],
    };
    expect(decodeValue(ev)).toBe(9007199254740993n);
  });

  test('decodes a boolean', () => {
    expect(decodeValue(formatEncodedValue(true))).toBe(true);
    expect(decodeValue(formatEncodedValue(false))).toBe(false);
  });

  test('decodes bytea', () => {
    const bytes = new Uint8Array([1, 2, 3, 255]);
    expect(decodeValue(formatEncodedValue(bytes))).toEqual(bytes);
  });

  test('decodes a uuid to its canonical string form', () => {
    const uuid = '123e4567-e89b-12d3-a456-426614174000';
    expect(decodeValue(formatEncodedValue(uuid))).toBe(uuid);
  });

  test('decodes a numeric/decimal as its string form', () => {
    const ev = formatEncodedValue('123.456', {
      name: VarType.NUMERIC,
      is_array: false,
      metadata: [6, 3],
    });
    expect(decodeValue(ev)).toBe('123.456');
  });

  test('decodes null', () => {
    expect(decodeValue(formatEncodedValue(null))).toBeNull();
  });

  test('decodes a text array', () => {
    expect(decodeValue(formatEncodedValue(['a', 'b', 'c']))).toEqual(['a', 'b', 'c']);
  });

  test('decodes a real Go-produced ActionExecution byte-for-byte', () => {
    // Generated by kwil-db core/types.ActionExecution.MarshalBinary for:
    //   namespace "main", action "insert_records",
    //   [["stream_a", int64(100), true], ["stream_b", int64(-5), false]]
    // Pins cross-implementation parity with the Go encoder, including a negative int64.
    const goHex =
      '0000040000006d61696e0e000000696e736572745f7265636f726473020003002400' +
      '000000000f0000000000000000047465787400000000000100090000000173747265' +
      '616d5f612400000000000f000000000000000004696e74380000000000010009000000' +
      '0100000000000000641d00000000000f000000000000000004626f6f6c00000000000100' +
      '02000000010103002400000000000f0000000000000000047465787400000000000100090000' +
      '000173747265616d5f622400000000000f000000000000000004696e7438000000000001000900' +
      '000001fffffffffffffffb1d00000000000f000000000000000004626f6f6c0000000000010002' +
      '0000000100';
    const decoded = decodeActionExecution(hexToBytes(goHex));

    expect(decoded.dbid).toBe('main');
    expect(decoded.action).toBe('insert_records');
    expect(decoded.arguments.map((call) => call.map(decodeValue))).toEqual([
      ['stream_a', 100n, true],
      ['stream_b', -5n, false],
    ]);
  });

  test('end-to-end: decode a full ActionExecution to native values', () => {
    const payload = build('main', 'insert_records', [
      [formatEncodedValue('stream_a'), formatEncodedValue(100)],
    ]);
    const decoded = decodeActionExecution(encodeActionExecution(payload));

    expect(decoded.action).toBe('insert_records');
    expect(decoded.arguments[0].map(decodeValue)).toEqual(['stream_a', 100n]);
  });
});
