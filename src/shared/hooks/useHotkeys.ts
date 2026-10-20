import { onCleanup, onMount } from "solid-js";

type Handlers = Partial<Record<"new" | "search" | "escape", () => void>>;

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable);

const dialogOpen = () => !!document.querySelector('[role="dialog"]');

/** N/Т — новая заявка, / — поиск, Esc — снять выделение. Вне полей ввода и без открытых диалогов. */
export function useHotkeys(handlers: Handlers) {
  const onKey = (ev: KeyboardEvent) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.defaultPrevented) return;
    if (ev.key === "Escape") {
      if (!dialogOpen() && !isTyping(ev.target)) handlers.escape?.();
      return;
    }
    if (isTyping(ev.target) || dialogOpen()) return;
    if (ev.key === "/") {
      ev.preventDefault();
      handlers.search?.();
    } else if ("nNтТ".includes(ev.key) && ev.key.length === 1) {
      ev.preventDefault();
      handlers.new?.();
    }
  };
  onMount(() => document.addEventListener("keydown", onKey));
  onCleanup(() => document.removeEventListener("keydown", onKey));
}
