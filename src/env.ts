const flag = (v: string | undefined, def: boolean) =>
  v == null || v === "" ? def : v === "true" || v === "1";

export const env = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "",
  /** Слой заглушек для функций без API (ТЗ 4.5). */
  useStubs: flag(import.meta.env.VITE_USE_STUBS as string | undefined, true),
  /** Мок-бэкенд MSW в браузере. */
  apiMock: flag(import.meta.env.VITE_API_MOCK as string | undefined, false),
  dev: import.meta.env.DEV,
};
