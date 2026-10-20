import type { TokenPair } from "@/domain/types";

export const REFRESH_KEY = "gf:refresh";
const CHANNEL = "gf-auth";
/** Обновляем access-токен за 60 с до истечения. */
export const REFRESH_LEAD_MS = 60_000;

type Message = { type: "tokens"; access: string; refresh: string; expiresAt: number } | { type: "logout" };

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

export type TokenStoreOptions = {
  refresh: (refreshToken: string) => Promise<TokenPair>;
  storage?: Storage;
  now?: () => number;
  channel?: BroadcastChannel | null;
  locks?: LockManager | null;
};

/**
 * Хранилище токенов.
 * - access — только в памяти, refresh — в localStorage (принятый риск, ТЗ 4.2);
 * - обновление single-flight: один запрос на приложение, между вкладками — Web Locks;
 * - новая пара рассылается остальным вкладкам через BroadcastChannel.
 */
export class TokenStore {
  private access: string | null = null;
  private expiresAt = 0;
  private inflight: Promise<boolean> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(reason: "logout" | "expired" | "tokens") => void>();
  private readonly opts: Required<Omit<TokenStoreOptions, "channel" | "locks">> & {
    channel: BroadcastChannel | null;
    locks: LockManager | null;
  };

  constructor(opts: TokenStoreOptions) {
    this.opts = {
      refresh: opts.refresh,
      storage: opts.storage ?? safeLocalStorage(),
      now: opts.now ?? Date.now,
      channel:
        opts.channel !== undefined
          ? opts.channel
          : typeof BroadcastChannel !== "undefined"
            ? new BroadcastChannel(CHANNEL)
            : null,
      locks:
        opts.locks !== undefined
          ? opts.locks
          : typeof navigator !== "undefined"
            ? (navigator.locks ?? null)
            : null,
    };
    this.opts.channel?.addEventListener("message", (ev: MessageEvent<Message>) => this.onMessage(ev.data));
    // В Node (тесты) канал не должен удерживать процесс.
    (this.opts.channel as unknown as { unref?: () => void } | null)?.unref?.();
  }

  get accessToken(): string | null {
    return this.access;
  }

  get refreshToken(): string | null {
    return this.opts.storage.getItem(REFRESH_KEY);
  }

  get hasSession(): boolean {
    return !!this.refreshToken;
  }

  /** Access-токен истёк или истекает в ближайшие REFRESH_LEAD_MS. */
  get needsRefresh(): boolean {
    return !this.access || this.opts.now() >= this.expiresAt - REFRESH_LEAD_MS;
  }

  subscribe(cb: (reason: "logout" | "expired" | "tokens") => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  setTokens(pair: TokenPair, broadcast = true) {
    this.apply(pair.access_token, pair.refresh_token, this.opts.now() + pair.expires_in * 1000);
    if (broadcast)
      this.post({
        type: "tokens",
        access: pair.access_token,
        refresh: pair.refresh_token,
        expiresAt: this.expiresAt,
      });
  }

  clear(reason: "logout" | "expired" = "logout", broadcast = true) {
    this.access = null;
    this.expiresAt = 0;
    this.opts.storage.removeItem(REFRESH_KEY);
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (broadcast) this.post({ type: "logout" });
    this.emit(reason);
  }

  /** Single-flight refresh. true — новая пара получена (здесь или в другой вкладке). */
  refresh(): Promise<boolean> {
    if (!this.inflight) {
      const startedWith = this.access;
      this.inflight = this.withLock(() => this.doRefresh(startedWith)).finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  private async doRefresh(startedWith: string | null): Promise<boolean> {
    const token = this.refreshToken;
    if (!token) return false;
    // Пока ждали лок, другая вкладка могла обновить пару и прислать её нам.
    if (this.access && this.access !== startedWith && !this.needsRefresh) return true;
    try {
      const pair = await this.opts.refresh(token);
      this.setTokens(pair);
      return true;
    } catch (e) {
      if (this.refreshToken && this.refreshToken !== token && this.access) return true;
      if (isInvalidRefresh(e)) this.clear("expired");
      return false;
    }
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.opts.locks) return fn();
    return this.opts.locks.request("gf-refresh", fn) as Promise<T>;
  }

  private apply(access: string, refresh: string, expiresAt: number) {
    this.access = access;
    this.expiresAt = expiresAt;
    this.opts.storage.setItem(REFRESH_KEY, refresh);
    this.schedule();
    this.emit("tokens");
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    const delay = Math.max(0, this.expiresAt - REFRESH_LEAD_MS - this.opts.now());
    this.timer = setTimeout(() => void this.refresh(), delay);
    (this.timer as unknown as { unref?: () => void }).unref?.();
  }

  private onMessage(msg: Message) {
    if (msg.type === "tokens") this.apply(msg.access, msg.refresh, msg.expiresAt);
    else if (msg.type === "logout") this.clear("logout", false);
  }

  private post(msg: Message) {
    try {
      this.opts.channel?.postMessage(msg);
    } catch {
      /* вкладка закрывается */
    }
  }

  private emit(reason: "logout" | "expired" | "tokens") {
    for (const cb of this.listeners) cb(reason);
  }
}

function isInvalidRefresh(e: unknown): boolean {
  const err = e as { status?: number; code?: string } | null;
  return err?.status === 401 || err?.code === "invalid_refresh_token";
}

function safeLocalStorage(): Storage {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    /* приватный режим */
  }
  const mem = new Map<string, string>();
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
  };
}
