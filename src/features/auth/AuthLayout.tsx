import { Check } from "lucide-solid";
import { type ParentProps, For, Show, createResource, createSignal } from "solid-js";
import { env } from "@/env";

const POINTS = [
  "Канбан-доска и быстрый поиск по ИНН",
  "Комментарии по каждому банку с историей изменений",
  "Командная работа с ролями и правами",
];

/** Двухколоночный экран входа: тёмный hero слева, форма справа (.auth-screen прототипа). */
export function AuthLayout(props: ParentProps) {
  return (
    <div class="grid min-h-dvh grid-cols-[minmax(0,1fr)_minmax(350px,460px)] bg-surface max-sm:grid-cols-1">
      <aside class="relative flex flex-col justify-between overflow-hidden bg-[radial-gradient(circle_at_17%_20%,#527de255,transparent_34%),radial-gradient(circle_at_85%_83%,#6b8bd830,transparent_28%),linear-gradient(145deg,#101e3b,#182c52_65%,#243d70)] p-[clamp(25px,6vw,76px)] text-white max-sm:hidden">
        <div class="pointer-events-none absolute -right-[170px] -bottom-[230px] size-[510px] rounded-full border border-white/10 shadow-[0_0_0_42px_#ffffff05,0_0_0_90px_#ffffff04]" />
        <div class="relative flex items-center gap-2.5">
          <div class="grid size-9 place-items-center rounded-[11px] border border-white/15 bg-white/10 text-[13px] font-extrabold">
            БГ
          </div>
          <div>
            <div class="text-[15px] font-[750]">Гарант · Рабочее пространство</div>
            <div class="mt-px text-[11px] text-[#bac8e2]">Заявки, банки и аналитика</div>
          </div>
        </div>
        <div class="relative z-[1] my-[50px] max-w-[560px]">
          <h1 class="m-0 mb-[19px] text-[clamp(32px,4vw,52px)] leading-[1.07] font-bold tracking-[-1.8px]">
            Все заявки на банковские гарантии — в одном месте.
          </h1>
          <p class="m-0 max-w-[430px] text-[15px] leading-[1.65] text-[#d4def2]">
            Рабочее пространство для команды: прозрачные статусы, история коммуникации с банками и понятные
            отчёты.
          </p>
          <div class="mt-8 grid gap-3">
            <For each={POINTS}>
              {(p) => (
                <div class="flex items-center gap-2.5 text-xs text-[#e1e8f7]">
                  <span class="grid size-[22px] place-items-center rounded-[7px] bg-white/10 text-[#a6c1ff]">
                    <Check size={13} />
                  </span>
                  {p}
                </div>
              )}
            </For>
          </div>
        </div>
        <div class="relative z-[1] text-[11px] text-[#bac8e2]">
          Garant Flow · учёт заявок на банковские гарантии
        </div>
      </aside>
      <section class="flex items-center justify-center px-[clamp(20px,5vw,62px)] py-[30px] max-sm:min-h-dvh max-sm:px-[22px] max-sm:py-7">
        <div class="w-full max-w-[365px] max-sm:max-w-[400px]">
          {props.children}
          <Show when={env.apiMock}>
            <MockHint />
          </Show>
        </div>
      </section>
    </div>
  );
}

export function AuthTitle(props: { eyebrow: string; title: string; intro?: string }) {
  return (
    <>
      <div class="eyebrow mb-[5px]">{props.eyebrow}</div>
      <h2 class="m-0 mb-[7px] text-[25px] font-bold tracking-[-0.7px]">{props.title}</h2>
      <Show when={props.intro}>
        <p class="m-0 mb-[25px] text-[13px] text-muted">{props.intro}</p>
      </Show>
    </>
  );
}

export function AuthAlert(props: { tone?: "error" | "success"; children: string }) {
  return (
    <div
      role={props.tone === "success" ? "status" : "alert"}
      class={
        props.tone === "success"
          ? "mb-[13px] rounded-[9px] bg-ok-soft px-3 py-2.5 text-xs text-[#18734f]"
          : "mb-[13px] rounded-[9px] bg-danger-soft px-3 py-2.5 text-xs text-danger"
      }
    >
      {props.children}
    </div>
  );
}

/** Только в режиме мок-бэкенда: демо-учётка, письма и сброс данных. */
function MockHint() {
  const [show, setShow] = createSignal(false);
  const [mail, { refetch }] = createResource(show, async () => {
    const res = await fetch("/__mock/mailbox");
    return (await res.json()) as { to: string; subject: string; link: string; at: string }[];
  });
  return (
    <div class="mt-6 rounded-xl border border-dashed border-[#cdd4df] bg-surface-2 p-3 text-[11px] leading-normal text-muted">
      <strong class="text-fg">Мок-бэкенд (VITE_API_MOCK).</strong> Демо: <code>demo@garant.local</code> /{" "}
      <code>demo12345</code>. Письма не отправляются —{" "}
      <button
        type="button"
        class="fb-link !p-0 !text-[11px]"
        onClick={() => (show() ? void refetch() : setShow(true))}
      >
        открыть почтовый ящик
      </button>
      {" · "}
      <button
        type="button"
        class="fb-link !p-0 !text-[11px]"
        onClick={() => void import("@/mocks/browser").then((m) => m.resetMockData())}
      >
        сбросить демо-данные
      </button>
      <Show when={show()}>
        <div class="mt-2 grid gap-1.5">
          <Show when={mail()?.length} fallback={<span>Писем пока нет.</span>}>
            <For each={mail()}>
              {(m) => (
                <a
                  class="block rounded-lg border border-line bg-white p-2 text-fg no-underline hover:border-accent-line"
                  href={m.link}
                >
                  <span class="block font-semibold">{m.subject}</span>
                  <span class="text-muted">{m.to}</span>
                </a>
              )}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  );
}
