import { createSignal } from "solid-js";

/**
 * Хранилище заглушек: localStorage под ключом `stub:<wsId>:<ресурс>`.
 * Данные видны только в этом браузере (ТЗ 4.5).
 */
const [version, setVersion] = createSignal(0);

/** Реактивная метка: меняется при любой записи заглушки (в т.ч. из другой вкладки). */
export const stubVersion = version;

if (typeof window !== "undefined") {
  window.addEventListener("storage", (ev) => {
    if (ev.key?.startsWith("stub:")) setVersion((v) => v + 1);
  });
}

export function stubKey(wsId: string, resource: string): string {
  return `stub:${wsId}:${resource}`;
}

export function readStub<T>(wsId: string, resource: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(stubKey(wsId, resource));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStub<T>(wsId: string, resource: string, value: T): void {
  try {
    localStorage.setItem(stubKey(wsId, resource), JSON.stringify(value));
  } catch {
    /* переполнено или запрещено — заглушка деградирует молча */
  }
  setVersion((v) => v + 1);
}

export function updateStub<T>(wsId: string, resource: string, fallback: T, fn: (prev: T) => T): T {
  const next = fn(readStub(wsId, resource, fallback));
  writeStub(wsId, resource, next);
  return next;
}

export function stubId(prefix = "s"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Имитация сетевой задержки, чтобы заглушки вели себя как будущие запросы. */
export function delay<T>(value: T, ms = 60): Promise<T> {
  return new Promise((r) => setTimeout(() => r(value), ms));
}
