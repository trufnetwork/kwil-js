import { HexString } from '../utils/types';
import { bytesToHex } from '../utils/serial';
import { BytesEncodingStatus, EnvironmentType } from './enums';
import { Signature } from './signature';

export interface AuthenticatedBody<
  T extends BytesEncodingStatus.HEX_ENCODED | BytesEncodingStatus.UINT8_ENCODED
> {
  nonce: string;
  sender: HexString;
  signature: Signature<
    T extends BytesEncodingStatus.HEX_ENCODED
      ? BytesEncodingStatus.BASE64_ENCODED
      : BytesEncodingStatus.UINT8_ENCODED
  >;
}

export interface KGWAuthInfo {
  nonce: string;
  statement: string;
  issue_at: string;
  expiration_time: string;
  chain_id: string;
  domain: string;
  version: string;
  uri: string;
}

export type AuthSuccess<T extends EnvironmentType> = T extends EnvironmentType.BROWSER
  ? BrowserAuthSuccess
  : NodeAuthSuccess;

export interface BrowserAuthSuccess {
  result: string;
  token?: string;
}

export interface NodeAuthSuccess {
  result: string;
  cookie?: string;
  token?: string;
}

export type LogoutResponse<T extends EnvironmentType> = T extends EnvironmentType.BROWSER
  ? LogoutResponseWeb
  : LogoutResponseNode;

interface LogoutResponseWeb {
  result: string;
}

interface LogoutResponseNode {
  result: string;
  cookie?: string;
}

export function composeAuthMsg(
  authParam: KGWAuthInfo,
  domain: string,
  version: string,
  chainId: string
): string {
  let msg = '';
  msg += `${domain} wants you to sign in with your account:\n`;
  msg += `\n`;
  if (authParam.statement !== '') {
    msg += `${authParam.statement}\n`;
  }
  msg += '\n';
  // @Yaiba: Should I trust the URI provided by KGW or should I use the domain / create my own?
  msg += `URI: ${authParam.uri}\n`;
  msg += `Version: ${version}\n`;
  msg += `Chain ID: ${chainId}\n`;
  msg += `Nonce: ${authParam.nonce}\n`;
  msg += `Issue At: ${authParam.issue_at}\n`;
  msg += `Expiration Time: ${authParam.expiration_time}\n`;
  return msg;
}

export function generateSignatureText(
  namespace: string,
  action: string,
  digest: HexString,
  challenge: string
): string {
  let sigText = 'Kwil view call.\n';
  sigText += '\n';
  sigText += `Namespace: ${namespace}\n`;
  sigText += `Method: ${action}\n`;
  sigText += `Digest: ${digest}\n`;
  sigText += `Challenge: ${challenge}\n`;
  return sigText;
}

export function removeTrailingSlash(url: string): string {
  if (url.endsWith('/')) {
    return url.slice(0, -1);
  }
  return url;
}

export function verifyAuthProperties(
  authParm: KGWAuthInfo,
  domain: string,
  version: string,
  chainId: string
): void {
  if (authParm.domain && authParm.domain !== domain) {
    throw new Error(`Domain mismatch: ${authParm.domain} !== ${domain}`);
  }
  if (authParm.version && authParm.version !== version) {
    throw new Error(`Version mismatch: ${authParm.version} !== ${version}`);
  }
  if (authParm.chain_id && authParm.chain_id !== chainId) {
    throw new Error(`Chain ID mismatch: ${authParm.chain_id} !== ${chainId}`);
  }
}

/**
 * The key under which the client keeps a signer's gateway session token: the
 * signer's identifier as lowercase hex without a 0x prefix. The gateway names
 * the session's account the same way.
 *
 * @param {HexString | Uint8Array} identifier - The signer's identifier.
 * @returns The key.
 */
export function sessionTokenKey(identifier: HexString | Uint8Array): string {
  if (typeof identifier !== 'string') {
    return bytesToHex(identifier);
  }
  // a repeated prefix goes too, so passing a key through again leaves it unchanged
  return identifier.replace(/^(?:0x)+/i, '').toLowerCase();
}

/**
 * Thrown by logoutKGW when the gateway did not confirm the logout of one or more
 * session tokens. The cookie logout has run by then; if it failed as well, `cause`
 * holds its error. The client keeps those tokens, so the logout can be tried
 * again; setSessionToken(identifier, undefined) drops a token without ending its
 * session.
 */
export class SessionLogoutError extends Error {
  /** The signers whose token logout was not confirmed, as lowercase hex without a 0x prefix. */
  readonly identifiers: string[];
  /** The cookie logout's error, when it failed as well. */
  readonly cause?: unknown;

  constructor(identifiers: string[], cause?: unknown) {
    const many = identifiers.length > 1;
    const tokens = many ? 'session tokens' : 'session token';
    const held = identifiers.join(', ');
    let message =
      `The gateway did not confirm the logout of the ${tokens} held for ${held}. ` +
      `The client keeps ${many ? 'them' : 'it'}, so the logout can be tried again.`;
    if (cause !== undefined) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      message += ` The cookie logout failed as well: ${reason}`;
    }
    super(message);
    this.name = 'SessionLogoutError';
    this.identifiers = identifiers;
    this.cause = cause;
  }
}
