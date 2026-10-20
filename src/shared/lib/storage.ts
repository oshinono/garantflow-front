/** Безопасный localStorage для пользовательских удобств (последний воркспейс, сайдбар). */
export const local = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* приватный режим */
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* приватный режим */
    }
  },
};

export const LAST_WORKSPACE_KEY = "gf:last-workspace";
export const SIDEBAR_KEY = "gf:sidebar-collapsed";
