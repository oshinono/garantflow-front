const KEY = "gf:pending-invite";

/** Токен приглашения, сохранённый до входа или регистрации. */
export const pendingInvite = {
  get(): string | null {
    try {
      return sessionStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      sessionStorage.setItem(KEY, token);
    } catch {
      /* приватный режим */
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* приватный режим */
    }
  },
};

/** Разрешаем переход только по внутренним путям (защита от open redirect). */
export function safeNext(next: string | undefined | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}
