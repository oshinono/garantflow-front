import { describe, expect, it, vi } from "vitest";
import { REFRESH_KEY, TokenStore } from "../session";

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

const pair = (n: number) => ({
  access_token: `a${n}`,
  refresh_token: `r${n}`,
  token_type: "bearer",
  expires_in: 900,
});

describe("TokenStore", () => {
  it("обновляет токены одним запросом на все параллельные вызовы (single-flight)", async () => {
    const storage = memoryStorage();
    storage.setItem(REFRESH_KEY, "r0");
    let n = 0;
    const refresh = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return pair(++n);
    });
    const store = new TokenStore({ refresh, storage, channel: null, locks: null });
    const results = await Promise.all([store.refresh(), store.refresh(), store.refresh()]);
    expect(results).toEqual([true, true, true]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(store.accessToken).toBe("a1");
    expect(storage.getItem(REFRESH_KEY)).toBe("r1");
  });

  it("очищает сессию при invalid_refresh_token", async () => {
    const storage = memoryStorage();
    storage.setItem(REFRESH_KEY, "bad");
    const store = new TokenStore({
      refresh: async () =>
        Promise.reject(Object.assign(new Error("x"), { status: 401, code: "invalid_refresh_token" })),
      storage,
      channel: null,
      locks: null,
    });
    const reasons: string[] = [];
    store.subscribe((r) => reasons.push(r));
    expect(await store.refresh()).toBe(false);
    expect(store.hasSession).toBe(false);
    expect(reasons).toContain("expired");
  });

  it("сетевую ошибку не считает концом сессии", async () => {
    const storage = memoryStorage();
    storage.setItem(REFRESH_KEY, "r0");
    const store = new TokenStore({
      refresh: async () => Promise.reject(new TypeError("fetch failed")),
      storage,
      channel: null,
      locks: null,
    });
    expect(await store.refresh()).toBe(false);
    expect(store.hasSession).toBe(true);
  });

  it("считает, что пора обновить, за 60 с до истечения", () => {
    let now = 0;
    const store = new TokenStore({
      refresh: async () => pair(1),
      storage: memoryStorage(),
      channel: null,
      locks: null,
      now: () => now,
    });
    store.setTokens(pair(1), false);
    now = 900_000 - 61_000;
    expect(store.needsRefresh).toBe(false);
    now = 900_000 - 59_000;
    expect(store.needsRefresh).toBe(true);
    store.clear("logout", false);
  });
});
