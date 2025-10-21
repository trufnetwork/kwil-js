import Long from 'long';
import {strings} from "./strings";
import {objects} from "./objects";
import { HexString } from './types';
import { base64ToBytes, bytesToBase64 } from './base64';

// converts string to bytes using utf-8 encoding
export function stringToBytes(str: string): Uint8Array {
        return new TextEncoder().encode(str);
    }

export function stringToEthHex(str: string): HexString {
    let hex = '0x';
    hex += stringToHex(str);
    return hex;
}

export function stringToHex(str: string): HexString {
    return stringToBytes(str).reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');  
}

export function hexToString(hex: HexString): string {
    strings.requireNonNil(hex);
    return bytesToString(hexToBytes(hex));
}

export function numberToBytes(num: number | bigint): Uint8Array {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);

    if (typeof num === 'number') {
        if (num < 0 || num > 9007199254740991) {  // 2^53 - 1
            throw new Error('Number out of bounds for safe integer representation');
        }
        const high = Math.floor(num / 4294967296);  // 2^32
        const low = num % 4294967296;
        view.setUint32(0, high);  // High 32 bits
        view.setUint32(4, low);   // Low 32 bits
    } else if (typeof num === 'bigint') {
        if (num < 0n || num > 0xFFFFFFFFFFFFFFFFn) {
            throw new Error('Number out of bounds for Uint64 representation');
        }
        const high = Number(num >> 32n);
        const low = Number(num & 0xFFFFFFFFn);
        view.setUint32(0, high);
        view.setUint32(4, low);
    } else {
        throw new Error('Unsupported type for conversion to bytes');
    }

    return new Uint8Array(buffer);
}

export function numberToEthHex(num: number): HexString {
    return '0x' + numberToHex(num);
}

export function numberToHex(num: number): HexString {
    let hex = num.toString(16);
    if (hex.length % 2 !== 0) {
        hex = '0' + hex;
    }
    return hex;
}

export function hexToNumber(hex: HexString): number {
    strings.requireNonNil(hex);
    if (hex.length % 2 !== 0) {
        throw new Error(`invalid hex string: ${hex}`);
    }
    // strip 0x prefix
    if (hex.startsWith('0x')) {
        hex = hex.slice(2);
    }
    return parseInt(hex, 16);
}

export function bytesToEthHex(bytes: Uint8Array): HexString {
    return '0x' + bytesToHex(bytes);
}    

export function bytesToHex(bytes: Uint8Array): HexString {
    return bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');
}

export function hexToBytes(hex: string): Uint8Array {
    strings.requireNonNil(hex);
    if (hex.length % 2 !== 0) {
        throw new Error(`invalid hex string: ${hex}`);
    }

    // strip 0x prefix
    if (hex.startsWith('0x')) {
        hex = hex.slice(2);
    }

    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    return bytes;
}

/**
 * Helper function to check if a string is valid hexadecimal
 */
function isValidHex(str: string): boolean {
    // Strip 0x prefix if present
    const hexStr = str.startsWith('0x') ? str.slice(2) : str;

    // Check if string only contains hex characters (0-9, a-f, A-F)
    // and has even length (since each byte = 2 hex chars)
    return /^[0-9a-fA-F]+$/.test(hexStr) && hexStr.length > 0 && hexStr.length % 2 === 0;
}

export function base64ToHex(base64: string): HexString {
    // NOTE: The kwil node returns transaction hashes as hexadecimal strings, not base64.
    // To maintain backward compatibility, we check if the input
    // is already hex and return it as-is. This prevents double-encoding (hex→base64→hex)
    // which previously corrupted 64-char hashes into 96-char garbage values.
    if (isValidHex(base64)) {
        // Strip 0x prefix if present to return consistent format
        return (base64.startsWith('0x') ? base64.slice(2) : base64) as HexString;
    }

    // Otherwise, treat it as base64 and convert to hex
    return bytesToHex(base64ToBytes(base64));
}

export function hexToBase64(hex: HexString): string {
    return bytesToBase64(hexToBytes(hex));
}

export function bytesToString(bytes: Uint8Array): string {
    return new TextDecoder().decode(bytes);
}

export function int32ToBytes(num: number): Uint8Array {
    objects.requireNonNilNumber(num);
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setInt32(0, num, true);
    return new Uint8Array(buffer);
}

export function bytesToInt32(bytes: Uint8Array): number {
    objects.requireNonNil(bytes);
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    for (let i = 0; i < bytes.length; i++) {
        view.setInt8(i, bytes[i]);
    }
    return view.getInt32(0, true);
}

export function int64ToBytes(num: number): Uint8Array {
    objects.requireNonNilNumber(num);
    const longNum = Long.fromNumber(num, true);
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setInt32(0, longNum.low, true);
    view.setInt32(4, longNum.high, true);
    return new Uint8Array(buffer);
}

export function bytesToInt64(bytes: Uint8Array): number {
    objects.requireNonNil(bytes);
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    for (let i = 0; i < bytes.length; i++) {
        view.setInt8(i, bytes[i]);
    }
    return view.getInt32(0, true);
}

export function booleanToBytes(bool: boolean): Uint8Array {
    objects.requireNonNil(bool);
    const buffer = new ArrayBuffer(1);
    const view = new DataView(buffer);
    view.setUint8(0, bool ? 1 : 0);
    return new Uint8Array(buffer);
}

export function bytesToBoolean(bytes: Uint8Array): boolean {
    objects.requireNonNil(bytes);
    const buffer = new ArrayBuffer(1);
    const view = new DataView(buffer);
    for (let i = 0; i < bytes.length; i++) {
        view.setUint8(i, bytes[i]);
    }
    return view.getUint8(0) === 1;
}