import { For, Show, createMemo, createSignal } from "solid-js";
import { useApplications } from "@/api/queries/applications";
import { useWorkspace } from "@/app/workspace";
import { cn } from "@/shared/lib/cn";

export type ClientOption = { id: string; name: string; inn: string };

/**
 * STUB Z-01 — список и поиск клиентов.
 * Предлагаемый контракт: GET /api/v1/workspaces/{ws}/clients?q=&inn=&include_archived=.
 * До него клиенты собираются из списка заявок воркспейса (клиенты без заявок не видны).
 */
export function useClientOptions() {
  const ws = useWorkspace();
  const apps = useApplications(ws.wsId);
  return createMemo<ClientOption[]>(() => {
    const map = new Map<string, ClientOption>();
    for (const a of apps.data ?? [])
      if (!map.has(a.client_id))
        map.set(a.client_id, { id: a.client_id, name: a.client_name ?? "", inn: a.client_inn ?? "" });
    return [...map.values()].sort((x, y) => x.name.localeCompare(y.name, "ru"));
  });
}

/** Комбобокс принципала: поиск по имени и ИНН среди клиентов или ввод нового. */
export function ClientCombobox(props: {
  id: string;
  value: string;
  onInput: (v: string) => void;
  onPick: (c: ClientOption) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  placeholder?: string;
}) {
  const options = useClientOptions();
  const [open, setOpen] = createSignal(false);
  const [active, setActive] = createSignal(0);
  const listId = () => `${props.id}-list`;
  const matches = createMemo(() => {
    const q = props.value.trim().toLowerCase();
    if (q.length < 2) return [];
    return options()
      .filter((c) => c.name.toLowerCase().includes(q) || c.inn.includes(q))
      .slice(0, 8);
  });
  const pick = (c: ClientOption) => {
    props.onPick(c);
    setOpen(false);
  };
  return (
    <div class="relative">
      <input
        id={props.id}
        class="control"
        role="combobox"
        aria-expanded={open() && matches().length > 0}
        aria-controls={listId()}
        aria-autocomplete="list"
        aria-activedescendant={open() && matches().length ? `${listId()}-${active()}` : undefined}
        aria-invalid={props.invalid || undefined}
        aria-describedby={props.describedBy}
        autocomplete="off"
        placeholder={props.placeholder ?? "Название или ИНН"}
        value={props.value}
        disabled={props.disabled}
        onInput={(e) => {
          props.onInput(e.currentTarget.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (!open() || !matches().length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % matches().length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i - 1 + matches().length) % matches().length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(matches()[active()]!);
          } else if (e.key === "Escape") {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      <Show when={open() && matches().length}>
        <ul
          id={listId()}
          role="listbox"
          class="absolute top-[calc(100%+4px)] right-0 left-0 z-30 m-0 max-h-60 list-none overflow-auto rounded-[10px] border border-line bg-white p-1 shadow-pop"
        >
          <For each={matches()}>
            {(c, i) => (
              <li
                id={`${listId()}-${i()}`}
                role="option"
                aria-selected={i() === active()}
                class={cn(
                  "cursor-pointer rounded-md px-[9px] py-[7px] text-xs font-normal",
                  i() === active() && "bg-hover",
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(c);
                }}
                onMouseEnter={() => setActive(i())}
              >
                <span class="font-semibold text-fg">{c.name}</span>{" "}
                <span class="text-muted">· ИНН {c.inn}</span>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
