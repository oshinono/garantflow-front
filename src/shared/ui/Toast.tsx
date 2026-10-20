import { For, Show, createSignal } from "solid-js";
import { Portal } from "solid-js/web";

type ToastItem = { id: number; message: string; action?: { label: string; run: () => void } };

const [items, setItems] = createSignal<ToastItem[]>([]);
let seq = 0;

/** Тост в правом нижнем углу на 3 с (с действием — 6 с). */
export function toast(message: string, action?: ToastItem["action"]) {
  const id = ++seq;
  setItems((list) => [...list.slice(-2), { id, message, action }]);
  setTimeout(() => dismiss(id), action ? 6000 : 3000);
}

function dismiss(id: number) {
  setItems((list) => list.filter((t) => t.id !== id));
}

export function ToastRegion() {
  return (
    <Portal>
      <div
        aria-live="polite"
        class="pointer-events-none fixed right-5 bottom-5 z-[60] grid max-w-[min(390px,calc(100vw-40px))] gap-2"
      >
        <For each={items()}>
          {(t) => (
            <div
              role="status"
              class="pointer-events-auto flex animate-toast-in items-center gap-3 rounded-[11px] bg-ink px-[15px] py-3 text-xs text-white shadow-[0_12px_30px_#10182830]"
            >
              <span class="flex-1">{t.message}</span>
              <Show when={t.action}>
                {(a) => (
                  <button
                    type="button"
                    class="rounded-md border border-white/30 px-2 py-1 font-semibold text-white hover:bg-white/10"
                    onClick={() => {
                      dismiss(t.id);
                      a().run();
                    }}
                  >
                    {a().label}
                  </button>
                )}
              </Show>
            </div>
          )}
        </For>
      </div>
    </Portal>
  );
}
