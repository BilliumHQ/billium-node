import { HttpClient } from './http';

// ─── Wallet types ─────────────────────────────────────────────────────────────

/**
 * How a wallet derives the on-chain address a customer pays to.
 *
 * - `DIRECT_WALLET` — a single static `address`. Every invoice for this
 *   cryptocurrency/network shares the same address; payments are
 *   discriminated by amount, time window, and salt.
 * - `XPUB_WALLET` — a BIP32 extended public key (`xpub`). The backend derives
 *   a fresh address per invoice from `xpub` using an internal index, so each
 *   payment lands on a unique address. Supported for BTC and LTC only.
 */
export type WalletType = 'DIRECT_WALLET' | 'XPUB_WALLET';

/**
 * Cryptocurrency a wallet settles in. Mirrors the backend `Cryptocurrency`
 * enum — a token can be available on more than one network (e.g. USDT on ETH,
 * BNB, POL, or TRX), which is why `network` is a separate field.
 */
export type Cryptocurrency =
  | 'BTC'
  | 'ETH'
  | 'USDT'
  | 'USDC'
  | 'BNB'
  | 'SHIB'
  | 'POL'
  | 'LTC'
  | 'DAI'
  | 'CRO'
  | 'TRX'
  | 'UNI';

/**
 * Chain a wallet's address/xpub belongs to. Mirrors the backend `Network`
 * enum. The `(cryptocurrency, network)` pair must be a supported combination
 * or `create()` rejects with `400`.
 */
export type Network = 'BTC' | 'ETH' | 'BNB' | 'POL' | 'LTC' | 'CRO' | 'TRX';

/**
 * A merchant crypto wallet configuration as returned by the Billium merchant
 * API.
 *
 * **Note on sensitive material:** the API only ever returns public
 * configuration — a `DIRECT_WALLET`'s receiving `address` or an
 * `XPUB_WALLET`'s extended *public* key (`xpub`). No private key or seed
 * material is stored or returned; address derivation happens server-side from
 * the xpub alone.
 *
 * **Note on nullability:** `address` is set for `DIRECT_WALLET`s and `null`
 * for `XPUB_WALLET`s; `xpub` and `derivationPath` are the inverse. `network`
 * defaults to `BTC` server-side and is always present on responses.
 */
export interface Wallet {
  id: string;
  merchantId: string;
  cryptocurrency: Cryptocurrency;
  network: Network;
  walletType: WalletType;
  /** Whether the wallet is eligible to receive new payments. Defaults to `true`. */
  isEnabled: boolean;
  /** Confirmation depth required before a payment to this wallet is considered settled. Defaults to `1`. */
  requiredConfirmations: number;
  /** Receiving address. Set for `DIRECT_WALLET`s, `null` for `XPUB_WALLET`s. */
  address: string | null;
  /** BIP32 extended *public* key. Set for `XPUB_WALLET`s, `null` for `DIRECT_WALLET`s. */
  xpub: string | null;
  /** BIP44/49/84 derivation path used for xpub address derivation. Only meaningful for `XPUB_WALLET`s. */
  derivationPath: string | null;
  /**
   * Highest address index derived so far from an `XPUB_WALLET`. Only
   * meaningful for `XPUB_WALLET`s; `DIRECT_WALLET`s carry the server default
   * (`0`), so don't use this to discriminate wallet types — use `walletType`.
   */
  lastUsedIndex: number | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Input types ─────────────────────────────────────────────────────────────

export interface CreateWalletParams {
  /** Cryptocurrency the wallet settles in. */
  cryptocurrency: Cryptocurrency;
  /** Address derivation strategy: a static address or an xpub. */
  walletType: WalletType;
  /**
   * Chain the wallet belongs to. Must be a network the `cryptocurrency` is
   * supported on, or the API rejects with `400`.
   */
  network: Network;
  /** Whether the wallet can receive new payments. Defaults to `true` server-side. */
  isEnabled?: boolean;
  /**
   * Confirmation depth required before a payment settles. Bounded `1`–`100`,
   * but each asset also enforces its own minimum (e.g. BTC), so values below
   * that floor are rejected with `400`.
   */
  requiredConfirmations?: number;
  /**
   * Receiving address. **Required when `walletType` is `DIRECT_WALLET`.**
   * Validated against the chosen `network`.
   */
  address?: string;
  /**
   * BIP32 extended *public* key. **Required when `walletType` is
   * `XPUB_WALLET`.** Must carry an xpub/ypub/zpub prefix on mainnet (or the
   * testnet tpub/upub/vpub in non-production environments).
   */
  xpub?: string;
  /** BIP44/49/84 derivation path for xpub wallets (e.g. `m/84'/0'/0'/0`). */
  derivationPath?: string;
}

/**
 * Fields accepted by `wallets.update()`. All are optional — only the fields
 * you pass are changed. Immutable identity fields (`cryptocurrency`,
 * `network`, `walletType`) are intentionally absent: changing them would
 * orphan in-flight payments, so create a new wallet instead.
 */
export interface UpdateWalletParams {
  /** New receiving address. Validated against the wallet's existing network. */
  address?: string;
  /** New BIP32 extended *public* key. Validated for the current environment. */
  xpub?: string;
  /** Toggle whether the wallet can receive new payments. */
  isEnabled?: boolean;
  /** New confirmation depth. Subject to the same per-asset minimum as on create. */
  requiredConfirmations?: number;
  /**
   * New derivation path. Only applicable to `XPUB_WALLET`s on BTC or LTC;
   * the API rejects it for other wallet types with `400`.
   */
  derivationPath?: string;
}

// ─── Client ──────────────────────────────────────────────────────────────────

export class WalletsClient {
  private readonly basePath: string;

  constructor(
    private readonly http: HttpClient,
    merchantId: string,
  ) {
    this.basePath = `/v1/merchants/merchant/${merchantId}/wallets`;
  }

  /**
   * Lists every wallet configured for the merchant.
   *
   * Unlike `invoices.list()`, this endpoint returns a plain array rather than
   * a `PaginatedResult` — the backend serves the full set unpaginated, since a
   * merchant has at most one wallet per `(cryptocurrency, network)` pair.
   */
  list(): Promise<Wallet[]> {
    return this.http.get<Wallet[]>(this.basePath);
  }

  /**
   * Retrieves a single wallet by ID.
   */
  get(walletId: string): Promise<Wallet> {
    return this.http.get<Wallet>(`${this.basePath}/${walletId}`);
  }

  /**
   * Adds a wallet to the merchant (`DIRECT_WALLET` or `XPUB_WALLET`).
   *
   * Pass `address` for a `DIRECT_WALLET` or `xpub` for an `XPUB_WALLET`. Only
   * one wallet may exist per `(cryptocurrency, network)` pair — a duplicate
   * rejects with `400`.
   *
   * **Requires a secret key (`sk_*`).** Public keys (`pk_*`) only have scope
   * for invoice creation and viewing, not wallet management.
   */
  async create(params: CreateWalletParams): Promise<Wallet> {
    // Marked async so the synchronous throw inside `assertSecretKey` becomes a
    // rejected promise — `create(...).catch(...)` and `await create(...)`
    // should both see the same error path.
    this.http.assertSecretKey('wallets.create');
    return this.http.post<Wallet>(this.basePath, params);
  }

  /**
   * Updates a wallet's mutable configuration (address, xpub, enabled state,
   * confirmation depth, derivation path). Identity fields
   * (cryptocurrency/network/walletType) cannot be changed.
   *
   * **Requires a secret key (`sk_*`).** Public keys (`pk_*`) cannot mutate
   * wallet configuration.
   */
  async update(walletId: string, params: UpdateWalletParams): Promise<Wallet> {
    this.http.assertSecretKey('wallets.update');
    return this.http.patch<Wallet>(`${this.basePath}/${walletId}`, params);
  }

  /**
   * Deletes a wallet. The API rejects deletion of a wallet that still has
   * active (non-terminal) payments against it with `400`.
   *
   * **Requires a secret key (`sk_*`).** Public keys (`pk_*`) cannot delete
   * wallets.
   */
  async delete(walletId: string): Promise<Wallet> {
    this.http.assertSecretKey('wallets.delete');
    return this.http.delete<Wallet>(`${this.basePath}/${walletId}`);
  }
}
