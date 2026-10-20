import { ChevronDown, X } from "lucide-solid";
import { For, Show } from "solid-js";
import { usePresetMutations, usePresets } from "@/api/queries/stubs";
import { useWorkspace } from "@/app/workspace";
import {
  type BoardFilters,
  type BoardItem,
  NO_OWNER,
  SORTS,
  type SortKey,
  hasActiveFilters,
  itemBankIds,
} from "@/domain/board";
import {
  GUARANTEE_TYPES,
  GUARANTEE_TYPE_LABELS,
  LAW_KINDS,
  LAW_KIND_LABELS,
  lawKindOf,
} from "@/domain/types";
import type { Bank } from "@/domain/types";
import { env } from "@/env";
import { cn } from "@/shared/lib/cn";
import { FilterDropdown, Menu, chipCls, chipOnCls } from "@/shared/ui/FilterDropdown";
import { Popover } from "@kobalte/core/popover";
import { createSignal } from "solid-js";
import { Button } from "@/shared/ui/Button";
import { Input } from "@/shared/ui/form";

type Props = {
  filters: BoardFilters;
  onChange: (next: BoardFilters) => void;
  items: BoardItem[];
  shown: number;
  banks: Bank[];
};

type ListKey = "bank" | "law" | "type" | "owner";

/** Панель фильтров в стиле Jira (filterBar() прототипа). */
export function FilterBar(props: Props) {
  const ws = useWorkspace();
  const f = () => props.filters;
  const toggle = (k: ListKey, v: string) => {
    const cur = f()[k] as string[];
    props.onChange({ ...f(), [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] });
  };
  const clear = (k: ListKey) => props.onChange({ ...f(), [k]: [] });
  const count = (pred: (i: BoardItem) => boolean) => props.items.filter(pred).length;

  const facets = () => [
    {
      key: "bank" as const,
      name: "Банк",
      options: props.banks.map((b) => ({
        value: b.id,
        label: b.name,
        count: count((i) => itemBankIds(i).includes(b.id)),
      })),
    },
    {
      key: "law" as const,
      name: "Тип закупки",
      options: LAW_KINDS.map((k) => ({
        value: k,
        label: LAW_KIND_LABELS[k],
        count: count((i) => lawKindOf(i) === k),
      })),
    },
    {
      key: "type" as const,
      name: "Вид БГ",
      options: [...GUARANTEE_TYPES, "vat" as const].map((t) => ({
        value: t,
        label: GUARANTEE_TYPE_LABELS[t],
        count: count((i) => i.guarantee_type === t),
      })),
    },
    {
      key: "owner" as const,
      name: "Ответственный",
      options: [
        { value: NO_OWNER, label: "Не назначен", count: count((i) => !i.responsible_user_id) },
        ...ws.members().map((m) => ({
          value: m.user_id,
          label: m.name,
          count: count((i) => i.responsible_user_id === m.user_id),
        })),
      ],
    },
  ];

  const chip = (k: "mine" | "soon", label: string) => (
    <button
      type="button"
      class={cn(chipCls, f()[k] && chipOnCls)}
      aria-pressed={f()[k]}
      onClick={() => props.onChange({ ...f(), [k]: !f()[k] })}
    >
      {label}
    </button>
  );

  const sort = () => SORTS.find((s) => s.key === f().sort) ?? SORTS[0]!;

  return (
    <div class="mb-3.5 flex flex-wrap items-center justify-between gap-x-3.5 gap-y-2">
      <div class="flex flex-wrap items-center gap-1.5">
        <For each={facets()}>
          {(fc) => (
            <FilterDropdown
              name={fc.name}
              options={fc.options}
              selected={f()[fc.key] as string[]}
              onToggle={(v) => toggle(fc.key, v)}
              onClear={() => clear(fc.key)}
            />
          )}
        </For>
        <span class="mx-1 h-[18px] w-px bg-line" />
        {chip("mine", "Мои заявки")}
        {chip("soon", "ОПЗ ≤ 3 дней")}
        <Show when={hasActiveFilters(f())}>
          <button
            type="button"
            class="fb-link"
            onClick={() =>
              props.onChange({ ...f(), bank: [], law: [], type: [], owner: [], mine: false, soon: false })
            }
          >
            Сбросить фильтры
          </button>
        </Show>
      </div>
      <div class="flex flex-wrap items-center gap-1.5">
        <Show when={hasActiveFilters(f()) || f().q}>
          <span class="mr-1 text-xs text-muted" aria-live="polite">
            {props.shown} из {props.items.length}
          </span>
        </Show>
        <Show
          when={env.useStubs}
          fallback={
            <span class={cn(chipCls, "opacity-60")} title="Скоро">
              Наборы
            </span>
          }
        >
          <PresetsDropdown filters={f()} onApply={props.onChange} />
        </Show>
        <Menu
          triggerLabel="Сортировка"
          active={!!f().sort}
          align="end"
          trigger={
            <>
              <Show when={f().sort} fallback="Сортировка">
                Сортировка: <b class="font-bold">{sort().label}</b> {f().dir === "desc" ? "↓" : "↑"}
              </Show>
              <ChevronDown size={12} class="opacity-60" />
            </>
          }
          items={[
            ...SORTS.map((s) => ({
              label: s.label,
              checked: s.key === f().sort,
              onSelect: () => props.onChange({ ...f(), sort: s.key as SortKey, dir: s.dir ?? "asc" }),
            })),
            ...(f().sort
              ? [
                  { kind: "separator" as const },
                  {
                    label: `↑ ${sort().asc}`,
                    checked: f().dir === "asc",
                    onSelect: () => props.onChange({ ...f(), dir: "asc" }),
                  },
                  {
                    label: `↓ ${sort().desc}`,
                    checked: f().dir === "desc",
                    onSelect: () => props.onChange({ ...f(), dir: "desc" }),
                  },
                ]
              : []),
          ]}
        />
        <span class="ml-auto text-[11px] text-muted max-xl:hidden">
          N — новая заявка · / — поиск · Esc — снять выбор
        </span>
      </div>
    </div>
  );
}

/** STUB Z-15 — сохранённые наборы фильтров. */
function PresetsDropdown(props: { filters: BoardFilters; onApply: (f: BoardFilters) => void }) {
  const ws = useWorkspace();
  const presets = usePresets(ws.wsId);
  const { create, remove } = usePresetMutations(ws.wsId);
  const [name, setName] = createSignal("");
  const canSave = () => hasActiveFilters(props.filters) || !!props.filters.sort;
  const save = (e: SubmitEvent) => {
    e.preventDefault();
    if (!name().trim()) return;
    const { q: _q, ...rest } = props.filters;
    create.mutate({ name: name().trim(), filters: rest });
    setName("");
  };
  return (
    <Popover placement="bottom-end" gutter={4}>
      <Popover.Trigger class={chipCls}>
        Наборы
        <Show when={presets.data?.length}>
          <span class="inline-grid h-[18px] min-w-[18px] place-items-center rounded-[9px] bg-[#d9e4fb] px-[5px] text-[10px] font-bold text-[#2f56c4]">
            {presets.data?.length}
          </span>
        </Show>
        <ChevronDown size={12} class="opacity-60" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          class="z-50 w-[260px] rounded-[10px] border border-line bg-white p-1 shadow-pop"
          aria-label="Наборы фильтров"
        >
          <Show
            when={presets.data?.length}
            fallback={<div class="p-[9px] text-xs text-muted">Сохранённых наборов нет</div>}
          >
            <For each={presets.data}>
              {(p) => (
                <div class="flex items-center gap-1 rounded-md px-1 hover:bg-hover">
                  <Popover.CloseButton
                    class="flex-1 truncate border-0 bg-transparent px-1.5 py-[7px] text-left text-xs"
                    onClick={() => props.onApply({ ...p.filters, q: props.filters.q })}
                  >
                    {p.name}
                  </Popover.CloseButton>
                  <button
                    type="button"
                    class="grid size-6 place-items-center rounded border-0 bg-transparent text-[#8a94a5] hover:text-[#c0362c]"
                    aria-label={`Удалить набор ${p.name}`}
                    onClick={() => remove.mutate(p.id)}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </For>
          </Show>
          <form class="mt-1 flex gap-1.5 border-t border-line p-1 pt-2" onSubmit={save}>
            <Input
              value={name()}
              onValue={setName}
              placeholder="Название набора"
              maxlength={30}
              disabled={!canSave()}
              class="!px-2 !py-1.5 !text-xs"
              aria-label="Название набора"
            />
            <Button type="submit" size="sm" disabled={!canSave() || !name().trim()}>
              Сохранить
            </Button>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  );
}
