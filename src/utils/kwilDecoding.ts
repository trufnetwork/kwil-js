import { DataInfo } from '../core/database';
import { PayloadType, VarType } from '../core/enums';
import { EncodedValue, UnencodedActionPayload } from '../core/payload';
import { base64ToBytes } from './base64';
import { bytesToString } from './serial';

/**
 * kwilDecoding is the inverse of {@link ./kwilEncoding}. It turns the length-prefixed binary
 * payloads that kwil-db puts on the wire back into structured JavaScript objects, so a consumer can
 * read what a transaction actually did (its action name and arguments) from `txInfo(hash)` or any
 * other place the raw payload bytes surface.
 *
 * The byte layout is a consensus contract shared with kwil-db `core/types`
 * (`ActionExecution`/`EncodedValue`/`DataType`) and the language SDKs; this file is the reference Go
 * decoder (`UnmarshalBinary` + `Decode`) ported to TypeScript. All framing integers are
 * little-endian (kwil-db `SerializationByteOrder`), the ONE exception being the fields inside a
 * `DataType`, which kwil-db serializes big-endian.
 */

/** A native JavaScript value decoded from an {@link EncodedValue}. */
export type DecodedValue =
  | string
  | bigint
  | boolean
  | Uint8Array
  | null
  | Array<DecodedValue>;

/**
 * ByteReader walks a Uint8Array with a moving cursor, mirroring the read primitives kwil-db uses in
 * `core/types/transaction.go` (WriteBytes/WriteString have a 4-byte length prefix; integers use
 * SerializationByteOrder = little-endian). Reads are bounds-checked so a truncated or malformed
 * payload throws a clear RangeError instead of silently returning garbage.
 */
class ByteReader {
  private readonly view: DataView;
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  private ensure(n: number): void {
    if (this.offset + n > this.bytes.length) {
      throw new RangeError(
        `unexpected end of payload: need ${n} byte(s) at offset ${this.offset}, ` +
          `only ${this.bytes.length - this.offset} remaining`
      );
    }
  }

  readUint8(): number {
    this.ensure(1);
    const v = this.view.getUint8(this.offset);
    this.offset += 1;
    return v;
  }

  readUint16LE(): number {
    this.ensure(2);
    const v = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return v;
  }

  readUint16BE(): number {
    this.ensure(2);
    const v = this.view.getUint16(this.offset, false);
    this.offset += 2;
    return v;
  }

  readUint32LE(): number {
    this.ensure(4);
    const v = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return v;
  }

  readUint32BE(): number {
    this.ensure(4);
    const v = this.view.getUint32(this.offset, false);
    this.offset += 4;
    return v;
  }

  readRaw(n: number): Uint8Array {
    this.ensure(n);
    const slice = this.bytes.subarray(this.offset, this.offset + n);
    this.offset += n;
    return slice;
  }

  /**
   * Reads a 4-byte little-endian length prefix followed by that many bytes (kwil-db `ReadBytes`).
   * kwil-db writes a nil slice as a length of `0xFFFFFFFF`; we surface that as an empty Uint8Array,
   * which is the only lossy case and does not occur in action arguments (values are always
   * null-flagged, never nil-framed).
   */
  readLenPrefixed(): Uint8Array {
    const len = this.readUint32LE();
    if (len === 0xffffffff) {
      return new Uint8Array(0);
    }
    return this.readRaw(len);
  }

  readString(): string {
    return bytesToString(this.readLenPrefixed());
  }
}

/**
 * Decodes a {@link DataInfo} (kwil-db `DataType`) from its `MarshalBinary` bytes. Unlike everything
 * else on the wire, a DataType serializes its fields big-endian (a kwil-db quirk mirrored by
 * `encodeDataType` in kwilEncoding.ts).
 *
 * Layout: uint16-BE version | uint32-BE nameLen | name (utf8) | uint8 is_array |
 *         uint16-BE metadata[0] | uint16-BE metadata[1]
 */
export function decodeDataType(bytes: Uint8Array): DataInfo {
  const r = new ByteReader(bytes);

  const version = r.readUint16BE();
  if (version !== 0) {
    throw new Error(`unsupported DataType version ${version}`);
  }

  const nameLen = r.readUint32BE();
  const name = bytesToString(r.readRaw(nameLen)) as VarType;

  const isArrayByte = r.readUint8();
  if (isArrayByte !== 0 && isArrayByte !== 1) {
    throw new Error(`invalid is_array byte ${isArrayByte}`);
  }

  const metadata: [number, number] = [r.readUint16BE(), r.readUint16BE()];

  return { name, is_array: isArrayByte === 1, metadata };
}

/**
 * Decodes an {@link EncodedValue} (kwil-db `EncodedValue.UnmarshalBinary`). The returned `data`
 * elements are the raw per-element bytes exactly as encoded (each carries a leading null-flag byte),
 * so re-encoding the result reproduces the input. Use {@link decodeValue} to turn one into a native
 * JavaScript value.
 *
 * Layout: uint16-LE version | ReadBytes(dataType) | uint16-LE dataLen | dataLen x ReadBytes(element)
 */
export function decodeEncodedValue(bytes: Uint8Array): EncodedValue {
  const r = new ByteReader(bytes);

  const version = r.readUint16LE();
  if (version !== 0) {
    throw new Error(`unsupported EncodedValue version ${version}`);
  }

  const type = decodeDataType(r.readLenPrefixed());

  const dataLen = r.readUint16LE();
  const data: Uint8Array[] = [];
  for (let i = 0; i < dataLen; i += 1) {
    data.push(r.readLenPrefixed());
  }

  return { type, data };
}

/**
 * Decodes an `execute` transaction payload (kwil-db `ActionExecution.UnmarshalBinary`) into its
 * action name and batched arguments. This is the inverse of {@link ./kwilEncoding.encodeActionExecution}
 * and round-trips it exactly. `dbid` is kwil-db's `Namespace` field (named `dbid` here to match the
 * encoder's input type).
 *
 * Accepts either the raw payload bytes or the base64 string form (e.g. `tx.body.payload`).
 *
 * Layout: uint16-LE version | ReadString(dbid) | ReadString(action) | uint16-LE numCalls |
 *         for each call: uint16-LE numArgs, then numArgs x ReadBytes(EncodedValue)
 */
export function decodeActionExecution(
  payload: Uint8Array | string
): UnencodedActionPayload<PayloadType.EXECUTE_ACTION> {
  const bytes = typeof payload === 'string' ? base64ToBytes(payload) : payload;
  const r = new ByteReader(bytes);

  const version = r.readUint16LE();
  if (version !== 0) {
    throw new Error(`unsupported ActionExecution version ${version}`);
  }

  const dbid = r.readString();
  const action = r.readString();

  const numCalls = r.readUint16LE();
  const args: EncodedValue[][] = [];
  for (let i = 0; i < numCalls; i += 1) {
    const numArgs = r.readUint16LE();
    const call: EncodedValue[] = [];
    for (let j = 0; j < numArgs; j += 1) {
      call.push(decodeEncodedValue(r.readLenPrefixed()));
    }
    args.push(call);
  }

  return { dbid, action, arguments: args };
}

/**
 * Turns an {@link EncodedValue} into a native JavaScript value, mirroring kwil-db's
 * `EncodedValue.Decode`. Scalars return the value directly; array types return an array. Integers are
 * returned as `bigint` because kwil-db stores them as int64, which exceeds JavaScript's safe integer
 * range; numeric/decimal values are returned as their string form (no precision loss).
 */
export function decodeValue(ev: EncodedValue): DecodedValue {
  if (ev.type.is_array) {
    return ev.data.map((element) => decodeScalar(element, ev.type));
  }

  if (ev.type.name === VarType.NULL) {
    return null;
  }

  if (ev.data.length !== 1) {
    throw new Error(`expected 1 element for scalar ${ev.type.name}, got ${ev.data.length}`);
  }

  return decodeScalar(ev.data[0], ev.type);
}

/**
 * Decodes a single null-flagged data element. The first byte is the null flag (`0` = null,
 * `1` = value follows), matching kwil-db `decodeNullable` / `decodeScalar`.
 */
function decodeScalar(element: Uint8Array, type: DataInfo): DecodedValue {
  if (element.length === 0) {
    // Only reachable via the nil-slice framing; treat as null.
    return null;
  }

  const nullFlag = element[0];
  if (nullFlag === 0) {
    return null;
  }
  if (nullFlag !== 1) {
    throw new Error(`expected 0 or 1 for null-flag byte, got ${nullFlag}`);
  }

  const data = element.subarray(1);

  switch (type.name) {
    case VarType.TEXT:
      return bytesToString(data);
    case VarType.INT8: {
      if (data.length !== 8) {
        throw new Error(`int8 must be 8 bytes, got ${data.length}`);
      }
      // kwil-db encodes int64 big-endian (see EncodeValue in core/types/payloads.go).
      return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigInt64(0, false);
    }
    case VarType.BOOL:
      return data.length > 0 && data[0] === 1;
    case VarType.BYTEA:
      // Copy so the result does not alias the caller's buffer.
      return data.slice();
    case VarType.UUID:
      if (data.length !== 16) {
        throw new Error(`uuid must be 16 bytes, got ${data.length}`);
      }
      return bytesToUuid(data);
    case VarType.NUMERIC:
      // kwil-db stores the decimal as its string form; return it verbatim.
      return bytesToString(data);
    case VarType.NULL:
      return null;
    default:
      throw new Error(`cannot decode type ${type.name}`);
  }
}

/** Formats 16 raw bytes as a canonical 8-4-4-4-12 UUID string. */
function bytesToUuid(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
