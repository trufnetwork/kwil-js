# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.9.5](https://github.com/trufnetwork/kwil-js/compare/v0.9.3...v0.9.5) (2025-04-01)


### Bug Fixes

* uuid dependency ([2121137](https://github.com/trufnetwork/kwil-js/commit/21211378e3c89be6064b0300cbba05c03c3d4744))

### [0.9.3](https://github.com/trufnetwork/kwil-js/compare/v0.9.2...v0.9.3) (2025-03-26)


### Features

* action input type override ([753c6e7](https://github.com/trufnetwork/kwil-js/commit/753c6e79c2906e1e129b992e4d8595c36bd3078e))

### [0.9.2](https://github.com/trufnetwork/kwil-js/compare/v0.9.1...v0.9.2) (2025-03-20)


### Bug Fixes

* call with empty array ([5d300ce](https://github.com/trufnetwork/kwil-js/commit/5d300ce774a6b21eb9eccbfc9868c180618513fb))

### [0.9.1](https://github.com/trufnetwork/kwil-js/compare/v0.9.0...v0.9.1) (2025-03-17)


### Bug Fixes

* fixes bug where kwil-js would check params when using positional params ([399eec1](https://github.com/trufnetwork/kwil-js/commit/399eec1a3effbead74d001d3676b3f6991a35c21))

## [0.9.0](https://github.com/trufnetwork/kwil-js/compare/v0.9.0-beta.3...v0.9.0) (2025-03-07)

## [0.9.0-beta.3](https://github.com/trufnetwork/kwil-js/compare/v0.9.0-beta.2...v0.9.0-beta.3) (2025-03-03)


### Bug Fixes

* **broadcast:** fix error handling for broadcast errors when `sync` is set to `true` ([0b1162a](https://github.com/trufnetwork/kwil-js/commit/0b1162addf31730ed4f7bf1a505e05eebc90038d))
* kgw auth ([2900df4](https://github.com/trufnetwork/kwil-js/commit/2900df43bcd3b138dc2bf28a47b6f9edc17e04d5))

## [0.9.0-beta.2](https://github.com/trufnetwork/kwil-js/compare/v0.9.0-beta.1...v0.9.0-beta.2) (2025-02-12)


### Features

* **call, selectquery:** typescript generics for call/selectQuery reesponse ([92d932a](https://github.com/trufnetwork/kwil-js/commit/92d932a6a208f2d7374fcbbf7ee2b404ccd6026e))

## [0.9.0-beta.1](https://github.com/trufnetwork/kwil-js/compare/v0.8.6...v0.9.0-beta.1) (2025-02-07)


### ⚠ BREAKING CHANGES

* For the `kwil.call` api, the `inputs` field only takes an object or a tuple of
scalar values. Previously, `inputs` received an array of only one object. We determined the single
length array was unncessary and therefore removed it.

fix: minor bug fixes
* Now when calling txInfo() the response data includes the transaction hash in the
'tx_hash' property instead of 'hash'
* deprecate dbid field in call() actionBody.  Require namespace instead.
* Deprecate selectQuery(dbid, query) signature. The new signature selectQuery(query,
params?, signer?) should be used instead
* Remove broadcast() method and deprecate database management APIs (deploy, drop,
getDBID, getSchema, listDatabases) in favor of executeSQL and selectQuery APIs

### Features

* add action input encoding for private kwild nodes / update encoding for authenticating call() ([4b0fb18](https://github.com/trufnetwork/kwil-js/commit/4b0fb18e141f37fbb6bbee8d72acb05ead66d9b4))
* add array integration tests ([9501f11](https://github.com/trufnetwork/kwil-js/commit/9501f11565b895e09bb0181b0251153ff4be205b))
* add call action encoding and selectQuery params encoding ([7c5b60a](https://github.com/trufnetwork/kwil-js/commit/7c5b60a4274ca110b3d58e2847213cac04acf904))
* add completed call() action code / deprecate ActionInputs ([6bbd109](https://github.com/trufnetwork/kwil-js/commit/6bbd1091586092f99d4f4be147ea68d764a259f8))
* add new encoding for auth transfer ([89257f5](https://github.com/trufnetwork/kwil-js/commit/89257f5fa0ffdceeba187d512d9a38180ff1aca4))
* add new query API for exec queries ([e8674d6](https://github.com/trufnetwork/kwil-js/commit/e8674d65be8f2825cd74dd29bf69df2f87c73a7e))
* add new validation for action inputs when calling action ([e291e94](https://github.com/trufnetwork/kwil-js/commit/e291e940cf1eb0483beb274f201c2df7e78f32e5))
* add support for arrays in parameter encoding for queries and actions ([bb7c6f8](https://github.com/trufnetwork/kwil-js/commit/bb7c6f89836ba905cb3d8f94dd16bb5f569e7eb2))
* add support for encoded params in selectQuery API ([2910b49](https://github.com/trufnetwork/kwil-js/commit/2910b49b1b2dd9819346110b37294b99be022d66))
* add support for exec action encoding ([ca33346](https://github.com/trufnetwork/kwil-js/commit/ca33346b49278995fbe2ecf05bbb92cbe0ca2a15))
* deprecate DBID in call() requests and require namespace instead ([a982de1](https://github.com/trufnetwork/kwil-js/commit/a982de187bc0dbb0c02cd414f0a1ef09565c02de))
* deprecate legacy database APIs ([8c3a135](https://github.com/trufnetwork/kwil-js/commit/8c3a1352fefb200ec5fc21f3dbf98b7b6e626186))
* deprecate legacy selectQuery signature ([d9b8541](https://github.com/trufnetwork/kwil-js/commit/d9b85411c3679a661dc9d3242ece509c4157c305))
* **index.ts:** update type exports ([a4fc70f](https://github.com/trufnetwork/kwil-js/commit/a4fc70f3df2274aa254365f1841b03f6c0fd4486))
* positional arguments ([e6eff93](https://github.com/trufnetwork/kwil-js/commit/e6eff93e74edca1a280f333a646b67150efeeb3a))
* update txInfo() response to reflect change in kwild (hash -> tx_hash) ([9769be3](https://github.com/trufnetwork/kwil-js/commit/9769be316b6421c11230ab026e01c8efbc09f279))


### Bug Fixes

* fix the action call() signer when kwild in private mode ([e646ff3](https://github.com/trufnetwork/kwil-js/commit/e646ff3d8152e7e2476919b86a475d7c2e955058))
* remove params required in selectQuery signature / add dbid to deprecated queries ([9ce78ad](https://github.com/trufnetwork/kwil-js/commit/9ce78ad8ed63c2a4bf4c8dd33137646edf202d0e))

### [0.8.6](https://github.com/trufnetwork/kwil-js/compare/v0.8.5...v0.8.6) (2024-11-21)


### Bug Fixes

* **serial:** changing all utf-16 to utf-8 ([b68f1af](https://github.com/trufnetwork/kwil-js/commit/b68f1af4c0ee8230a2d08a3bfb511dff107b54ea))

### [0.8.5](https://github.com/trufnetwork/kwil-js/compare/v0.8.4...v0.8.5) (2024-11-20)


### Bug Fixes

* **serial:** change string encoding from utf-16 to utf-8 ([48e710c](https://github.com/trufnetwork/kwil-js/commit/48e710c2420b6524bb4aa18030994fd4d1dfa930))

### [0.8.4](https://github.com/trufnetwork/kwil-js/compare/v0.8.3...v0.8.4) (2024-10-25)


### Bug Fixes

* **kwil.call:** fix json parse bug ([b82d681](https://github.com/trufnetwork/kwil-js/commit/b82d681c17f05282d5a16074dc1c4174d077f447))

### [0.8.3](https://github.com/trufnetwork/kwil-js/compare/v0.8.2...v0.8.3) (2024-10-24)


### Bug Fixes

* **kwil.call:** return decimals as strings ([5a3ab5a](https://github.com/trufnetwork/kwil-js/commit/5a3ab5a09c0c718a5c3498d2287f894adebde4da))

### [0.8.2](https://github.com/trufnetwork/kwil-js/compare/v0.8.0...v0.8.2) (2024-10-16)


### Bug Fixes

* **kwil:** separate authentication errors from call errors ([a43ca86](https://github.com/trufnetwork/kwil-js/commit/a43ca869f5646a5a6f447d18a6d2110175c331a1))

### [0.8.1](https://github.com/trufnetwork/kwil-js/compare/v0.8.0...v0.8.1) (2024-10-10)

## [0.8.0](https://github.com/trufnetwork/kwil-js/compare/v0.7.1...v0.8.0) (2024-10-10)


### ⚠ BREAKING CHANGES

* **auth:** `auth.logout` is now `auth.logoutKGW`

Kwil.call refactor for public, kgw, private.

Signed-off-by: Ty D'Angelo <tydangelo18@gmail.com>

### Features

* kwild private mode authentication ([5a926e2](https://github.com/trufnetwork/kwil-js/commit/5a926e25bae07b9ff969e7225a6d731d64e10b47))


### Bug Fixes

* **kwil:** chain info shape ([e8b9dfd](https://github.com/trufnetwork/kwil-js/commit/e8b9dfd69447862fa8ee7a6af2132ddb9268b262))


* **auth:** change `logout` to `logoutKGW` ([c5d89e4](https://github.com/trufnetwork/kwil-js/commit/c5d89e4405d17491a01030167004037fcedb49cc)), closes [#94](https://github.com/trufnetwork/kwil-js/issues/94)

### [0.7.1](https://github.com/trufnetwork/kwil-js/compare/v0.7.0...v0.7.1) (2024-06-10)


### Bug Fixes

* **action_builder.ts:** handling null params for procedures ([51fb71f](https://github.com/trufnetwork/kwil-js/commit/51fb71fa341b85ae2d46ad94a742a78078ef83e0))

## [0.7.0](https://github.com/trufnetwork/kwil-js/compare/v0.6.2...v0.7.0) (2024-06-10)


### ⚠ BREAKING CHANGES

* The internal database and action payload interfaces are now aligned with kwil v0.8. From this commit on, you should only use kwil-db versions v0.8-beta+.
* **client:** Kwil-JS now relies on kwil-db's JSONRPC endpoints (available in kwil-db v0.8+).
From this commit on, you should only use Kwil-JS with kwil-db v0.8+.
* The `Database` and `CompiledKuneiform` types changed, as well as many of the
internal checks on action executions. From this commit on, kwil-js should only be used with kwil-db
v0.8+

### Features

* add procedures to schema ([965f9a2](https://github.com/trufnetwork/kwil-js/commit/965f9a278f075c4f431676a8ade55f9f7eb3fb5b))
* **client:** individual logout ([f49bc8a](https://github.com/trufnetwork/kwil-js/commit/f49bc8a7089608f7f36b602dc3b0e02cbf7bf23d))
* **client:** jsonrpc for KGW ([58b4309](https://github.com/trufnetwork/kwil-js/commit/58b4309f179c638c9dc22f1cfe00453d7fac4e5d))
* **client:** migrate to json-rpc ([3eb5112](https://github.com/trufnetwork/kwil-js/commit/3eb5112d598be6ce4a06e51762a01b5ebe114c3a))
* support passing Uint8Array for Action Inputs ([a3680d5](https://github.com/trufnetwork/kwil-js/commit/a3680d583be66d7b0d34dfa8a44a0d04648a0609))
* support typed parameters ([#85](https://github.com/trufnetwork/kwil-js/issues/85)) ([d411b32](https://github.com/trufnetwork/kwil-js/commit/d411b322e9a32bdeafe26260144e3b0d3e03e9c6))


### Bug Fixes

* **client:** individual logout on multi-user session ([e9e0062](https://github.com/trufnetwork/kwil-js/commit/e9e00627623107b56e0fb198c329b239b12de1f7))

### [0.6.2](https://github.com/trufnetwork/kwil-js/compare/v0.6.1...v0.6.2) (2024-04-19)


### Features

* auto authenticate ([2c1b650](https://github.com/trufnetwork/kwil-js/commit/2c1b650e24a9ec3fc6df79d23f3530d4436276e5))
* **chaininfo:** configurable warning ([fe00e9a](https://github.com/trufnetwork/kwil-js/commit/fe00e9aeb929353623c8e95b654e9210e2dafbe8)), closes [#75](https://github.com/trufnetwork/kwil-js/issues/75)


### Bug Fixes

* **nodekwil:** auth.logout() functionality ([08c7377](https://github.com/trufnetwork/kwil-js/commit/08c737774238a7b8af26ced4fdb4028d1c898b72)), closes [#76](https://github.com/trufnetwork/kwil-js/issues/76)
* **nodekwil:** carry cookie ([9aef12a](https://github.com/trufnetwork/kwil-js/commit/9aef12ab27f5b4ee8e0845a59ef5e888df4f0d1c))

### [0.6.1](https://github.com/trufnetwork/kwil-js/compare/v0.6.0...v0.6.1) (2024-04-15)


### Features

* **client:** add auth logout method ([dc7095d](https://github.com/trufnetwork/kwil-js/commit/dc7095db87c75151923da9ce586479e243c5f9d5))

## [0.6.0](https://github.com/trufnetwork/kwil-js/compare/v0.5.6...v0.6.0) (2024-03-12)


### ⚠ BREAKING CHANGES

* **payload_builder:** No kwil-js API changes; however, the internal payload structure has changed. This
means that from this commit on, kwil-js should only be used with kwil daemon v0.7 and above.
* Custom signers must match the signature `(msg: Uint8Array) => Promise<Uint8Array>`.
The variadic arguments were removed.

### Bug Fixes

* **core/builders:** loosen type definition for eth signer ([b0421b1](https://github.com/trufnetwork/kwil-js/commit/b0421b1de1a58ddec1f7c2e73b6ee0d6b40a71ba)), closes [#20](https://github.com/trufnetwork/kwil-js/issues/20)
* **payload_builder:** fix nil bug error ([b944654](https://github.com/trufnetwork/kwil-js/commit/b944654bb2b72d751b80f02a057460bf93378c40))
* remove variadic args from CustomSigner ([f016cba](https://github.com/trufnetwork/kwil-js/commit/f016cba6bf4d2d2933fad59f34a8d97fae41f5fb))

### [0.5.6](https://github.com/trufnetwork/kwil-js/compare/v0.5.5...v0.5.6) (2024-01-18)


### Bug Fixes

* **payload_builder.ts:** set fee to 0 when estimating cost ([23e78ad](https://github.com/trufnetwork/kwil-js/commit/23e78adde464b265495f5d0d2532915e56de1ede)), closes [/github.com/trufnetwork/kwil-db/commit/fa0ceaea5cd8141d643fac66bc7f8f9e3754d7b1#diff-29b727c2a7cdca0ced9103a0a61a8e9bfde5911470a028b553e77d7e1d05b7d7](https://github.com/trufnetwork//github.com/trufnetwork/kwil-db/commit/fa0ceaea5cd8141d643fac66bc7f8f9e3754d7b1/issues/diff-29b727c2a7cdca0ced9103a0a61a8e9bfde5911470a028b553e77d7e1d05b7d7)

### [0.5.5](https://github.com/trufnetwork/kwil-js/compare/v0.5.4...v0.5.5) (2024-01-16)

### [0.5.4](https://github.com/trufnetwork/kwil-js/compare/v0.5.3...v0.5.4) (2024-01-10)


### Features

* add sync flag to transactions ([0e18f06](https://github.com/trufnetwork/kwil-js/commit/0e18f066b4f7be249f081d794d03462c258edd3b)), closes [#62](https://github.com/trufnetwork/kwil-js/issues/62)

### [0.5.3](https://github.com/trufnetwork/kwil-js/compare/v0.5.2...v0.5.3) (2024-01-04)


### Bug Fixes

* rlp encoding zero and case sensitivity for action input names ([f2c71e8](https://github.com/trufnetwork/kwil-js/commit/f2c71e8b1881f4e398718ab3582d3883ede69d1a))

### [0.5.2](https://github.com/trufnetwork/kwil-js/compare/v0.5.0...v0.5.2) (2023-12-18)


### Features

* add unconfirmed nonce ([cc52f2d](https://github.com/trufnetwork/kwil-js/commit/cc52f2d1247ae892c22af1c383c89ee10d044fc7)), closes [#51](https://github.com/trufnetwork/kwil-js/issues/51)
* allow for manually setting nonce ([976f610](https://github.com/trufnetwork/kwil-js/commit/976f610f53111908179fcdd32c328b3ba7737dda)), closes [#57](https://github.com/trufnetwork/kwil-js/issues/57)


### Bug Fixes

* **rlp:** fix bug where boolean false was not rlp encoded correctly ([7435691](https://github.com/trufnetwork/kwil-js/commit/74356915f2187f7e1513fad351653a62ff903917))

### [0.5.1](https://github.com/trufnetwork/kwil-js/compare/v0.5.0...v0.5.1) (2023-12-13)


### Bug Fixes

* **rlp:** fix bug where boolean false was not rlp encoded correctly ([8da5a42](https://github.com/trufnetwork/kwil-js/commit/8da5a4248fb4dd78cfecc53e7082f97a68c2c69a))

## [0.5.0](https://github.com/trufnetwork/kwil-js/compare/v0.4.1...v0.5.0) (2023-12-11)


### ⚠ BREAKING CHANGES

* Remove the `kwil.authenticate()` and `kwil.setCookie()` methods, as those methods
are now handled internally by the `kwil.call()` method.

### Features

* make kwil.call() auto authenticate, when required ([e591eb9](https://github.com/trufnetwork/kwil-js/commit/e591eb9c4e37395f3f5e206ed9740e2894c34084))

### [0.4.1](https://github.com/trufnetwork/kwil-js/compare/v0.4.0...v0.4.1) (2023-12-08)


### Bug Fixes

* **core/database.ts:** fixed typing error in Compiled Kuneiform ([904ae7d](https://github.com/trufnetwork/kwil-js/commit/904ae7d5babaf2b26c45dc36d6748bfdd6485559))

## [0.4.0](https://github.com/trufnetwork/kwil-js/compare/v0.3.2...v0.4.0) (2023-12-06)


### ⚠ BREAKING CHANGES

* **client:** The kwil.listDatabases() method now returns an array of db-objects (owner,
identifier, dbid). Previously, only the db name would be returned when an owner's address was passed
to `listDatabases()`.
* KwilSigners using Secp256k1 / EtherJS signers should now pass the Ethereum wallet
address as the identifier, rather than the public key.

### Features

* change ethereum identifier to wallet address ([54b2aa1](https://github.com/trufnetwork/kwil-js/commit/54b2aa18091cb718c60168e4be94b4529562a415))
* **kwil.ts:** add authenticate method ([ad97043](https://github.com/trufnetwork/kwil-js/commit/ad9704335e17310423109e50b68ed5cde2a13116))
* **kwil/funder:** added funder property to kwil class ([e50d14d](https://github.com/trufnetwork/kwil-js/commit/e50d14da8f61ea8119e4f3a2043a2ee9939a6705))


* **client:** change list database return ([a96046a](https://github.com/trufnetwork/kwil-js/commit/a96046a4a2ba78de8a4f6610068254423d162ec1)), closes [/github.com/trufnetwork/proto/pull/26#event-11158139032](https://github.com/trufnetwork//github.com/trufnetwork/proto/pull/26/issues/event-11158139032)

### [0.3.2](https://github.com/trufnetwork/kwil-js/compare/v0.3.1...v0.3.2) (2023-11-07)

### [0.3.1](https://github.com/trufnetwork/kwil-js/compare/v0.3.0...v0.3.1) (2023-11-07)


### Bug Fixes

* **client/kwil.ts:** add wrapped config property to kwil class ([020af2b](https://github.com/trufnetwork/kwil-js/commit/020af2bc1d5a372ded7cdacebd887fc780034c6f))

## [0.3.0](https://github.com/trufnetwork/kwil-js/compare/v0.2.1...v0.3.0) (2023-10-30)


### ⚠ BREAKING CHANGES

* **client/kwil.ts:** The `WebKwil` and `NodeKwil` classes require an additional `chainId` config string
to execute database deploys, database drops, or state-changing actions. You can check the chainId
for your kwilProvider by calling `kwil.chainInfo()`.
* **client/kwil.ts:** The `kwil.actionBuilder()`, `kwil.dbBuilder()`, `kwil.dropDbBuilder()` and
`kwil.broadcast()` are deprecated in favor of using `kwil.execute()`, `kwil.deploy()`,
`kwil.drop()`, and `kwil.call()`. The deprecated methods will be removed in Q1 2024.
* **builders/payload_builder:** Signature descriptions cannot be longer than 200 characters. Any signature
description that was previously >200 characters will now trigger an error.

### Features

* **builders/payload_builder:** max length to signature descriptions ([#43](https://github.com/trufnetwork/kwil-js/issues/43)) ([a331810](https://github.com/trufnetwork/kwil-js/commit/a33181042076c9ea4c218e4d95dd03413372cd85)), closes [#26](https://github.com/trufnetwork/kwil-js/issues/26)
* **client/kwil.ts:** require chainID to be configured in Kwil constructor ([#40](https://github.com/trufnetwork/kwil-js/issues/40)) ([dff850d](https://github.com/trufnetwork/kwil-js/commit/dff850da159957ec348c38489f328347b8a3db67)), closes [#39](https://github.com/trufnetwork/kwil-js/issues/39)* 
* builder pattern alternatives - add `KwilSigner`, `kwil.execute()`, `kwil.call()`, `kwil.deploy()`, `kwil.drop()` ([[#38](https://github.com/trufnetwork/kwil-js/issues/38)) ([2d25de9](https://github.com/trufnetwork/kwil-js/commit/2d25de9ac423950ca7a33aa1ad0da8aed6642c49))

### Bug Fixes

* **builders/payload_builder:** remove the 🪶  in the Kwil signature ([#44](https://github.com/trufnetwork/kwil-js/issues/44)) ([0dfc4a9](https://github.com/trufnetwork/kwil-js/commit/0dfc4a9b9db4335deed72529201ae5a90169be70))
* **client/kwil.ts:** deprecate builders and clean Utils namespace ([#41](https://github.com/trufnetwork/kwil-js/issues/41)) ([c9d1130](https://github.com/trufnetwork/kwil-js/commit/c9d1130b6919a1c2d8d582a8f5a1d38b764be0f1)), closes [#32](https://github.com/trufnetwork/kwil-js/issues/32)

### [0.2.1](https://github.com/trufnetwork/kwil-js/compare/v0.1.1...v0.2.1) (2023-10-09)


### Features

* custom singature names ([#35](https://github.com/trufnetwork/kwil-js/issues/35)) ([ac07ccd](https://github.com/trufnetwork/kwil-js/commit/ac07ccdcbed67121ce8ff1b1177b0690a7c667c1)), closes [#34](https://github.com/trufnetwork/kwil-js/issues/34)

### [0.2.0](https://github.com/trufnetwork/kwil-js/compare/v0.1.1...v0.2.0) (2023-09-30)

Version 0.2.0 supports friendly signatures, which is compatible with the [Kwil Daemon v0.6.0](https://github.com/trufnetwork/binary-releases/releases) and above.

### [0.1.1](https://github.com/trufnetwork/kwil-js/compare/v0.1.0...v0.1.1) (2023-09-21)

## [0.1.0](https://github.com/trufnetwork/kwil-js/compare/v0.0.3...v0.1.0) (2023-09-21)


### ⚠ BREAKING CHANGES

* The `.nearConfig()` method has been removed from the `.actionBuilder()` and
`.dbBuilder()` classes, in favor of allowing developers to pass their own signing function to the
`.signer()` methods.

### Features

* added custom signer functionality ([d29bc60](https://github.com/trufnetwork/kwil-js/commit/d29bc60fbd7adcd6561d22802c80ea756bab84e0))

### [0.0.3](https://github.com/trufnetwork/kwil-js/compare/v0.0.2...v0.0.3) (2023-09-06)


### Features

* recoverSecp256k1PubKey now allows the developer to optionally pass the signing message ([3896238](https://github.com/trufnetwork/kwil-js/commit/38962382da060db8d1d38a1dddd690c333f94613))


### Bug Fixes

* escaped base64 url encoding ([0eeba1a](https://github.com/trufnetwork/kwil-js/commit/0eeba1ad35b42296e864f3d81acbc2f454a84014))

## 0.0.2 (2023-09-05)

### Bug Fixes

* fix ethers v6 signature validation in browser ([6ceba14](https://github.com/trufnetwork/kwil-js/commit/6ceba14e72fa7d0d9bb575fa403335aaa7a5e44b))
