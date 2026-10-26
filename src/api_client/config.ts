// config for api

type seconds = number;

export interface ApiConfig {
  kwilProvider: string;
  timeout?: number;
  logging?: boolean;
  logger?: (msg: string) => any;
  /**
   * @deprecated - Cache is deprecated.
   */
  cache?: seconds;
  /**
   * Gateway session tokens saved from earlier sign-ins, keyed by the signer's
   * identifier as onSessionToken reported it. A call is sent with its signer's
   * token as "Authorization: Bearer <token>", so the gateway session works where
   * the gateway's cookie is dropped, such as in a wallet's in-app browser.
   */
  sessionTokens?: Record<string, string>;
  /**
   * Called when a signer's gateway session token changes: with the new token
   * after a sign-in that returns one, and with undefined after a logout or when
   * the gateway refuses the token. identifier is the signer's identifier as
   * lowercase hex. Save the tokens here to keep the sessions across page loads.
   */
  onSessionToken?: (identifier: string, token: string | undefined) => void;
}

export interface ClientConfig extends ApiConfig {
  unconfirmedNonce?: boolean;
}

export interface KwilConfig extends ClientConfig {
  chainId: string;
  autoAuthenticate?: boolean;
}

/**
 * @typedef {Object} Config
 * @property {string} kwilProvider - kwil provider url
 * @property {string} chainId - chain id
 * @property {boolean} [autoAuthenticate] - auto authenticate on call requests to Kwil Gateway. Default is true.
 * @property {boolean} [unconfirmedNonce] - use unconfirmed nonce
 * @property {number} [timeout] - timeout for requests in milliseconds
 * @property {boolean} [logging] - enable logging
 * @property {Function} [logger] - custom logger function
 * @property {number} [cache] 
 * @property {Object} [sessionTokens] - saved gateway session tokens, keyed by signer identifier
 * @property {Function} [onSessionToken] - called with a signer's identifier and its new gateway session token, or undefined
 */
export type Config = KwilConfig;
