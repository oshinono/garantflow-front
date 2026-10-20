import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import { Popover } from "@kobalte/core/popover";
import { Check, ChevronDown } from "lucide-solid";
import { type JSX, For, Show } from "solid-js";
import { cn } from "@/shared/lib/cn";

const triggerCls =
  "inline-flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-[7px] border border-line bg-white px-2.5 text-xs font-semibold text-[#42526e] hover:bg-hover data-[expanded]:border-[#9db6ee] data-[expanded]:shadow-[0_0_0_2px_#315fce1f]";
const onCls = "border-accent-line bg-accent-soft text-[#2f56c4]";
const popCls =
  "z-50 max-h-[340px] min-w-[220px] max-w-[min(320px,calc(100vw-32px))] overflow-auto rounded-[10px] border border-line bg-white p-1 shadow-pop outline-none";
const optCls =
  "flex w-full cursor-pointer items-center gap-[9px] rounded-md border-0 bg-transparent px-[9px] py-[7px] text-left text-xs font-medium text-fg outline-none hover:bg-hover data-[highlighted]:bg-hover";

export type FacetOption = { value: string; label: string; count?: number };

/** Мультивыбор в стиле Jira (.fdd/.fb-pop прототипа). */
export function FilterDropdown(props: {
  name: string;
  options: FacetOption[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
  align?: "start" | "end";
}) {
  const label = () => {
    const first = props.options.find((o) => o.value === props.selected[0]);
    return first?.label ?? props.selected[0];
  };
  return (
    <Popover placement={props.align === "end" ? "bottom-end" : "bottom-start"} gutter={4}>
      <Popover.Trigger class={cn(triggerCls, props.selected.length > 0 && onCls)}>
        <Show when={props.selected.length} fallback={props.name}>
          {props.name}: <b class="font-bold">{label()}</b>
          <Show when={props.selected.length > 1}>
            <span class="ml-0.5 inline-grid h-[18px] min-w-[18px] place-items-center rounded-[9px] bg-[#d9e4fb] px-[5px] text-[10px] font-bold text-[#2f56c4]">
              +{props.selected.length - 1}
            </span>
          </Show>
        </Show>
        <ChevronDown size={12} class="opacity-60" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content class={popCls} aria-label={props.name}>
          <Show
            when={props.options.length}
            fallback={<div class="p-[9px] text-xs text-muted">Список пуст</div>}
          >
            <For each={props.options}>
              {(o) => (
                <label class={optCls}>
                  <input
                    type="checkbox"
                    class="m-0 size-[15px] flex-none accent-accent"
                    checked={props.selected.includes(o.value)}
                    onChange={() => props.onToggle(o.value)}
                  />
                  <span class="min-w-0 flex-1 truncate">{o.label}</span>
                  <Show when={o.count != null}>
                    <span class="text-[11px] text-[#8a94a5]">{o.count}</span>
                  </Show>
                </label>
              )}
            </For>
          </Show>
          <Show when={props.selected.length}>
            <div class="mt-1 border-t border-line pt-1">
              <button type="button" class="fb-link" onClick={() => props.onClear()}>
                Сбросить
              </button>
            </div>
          </Show>
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  );
}

export type MenuItem =
  | {
      kind?: "item";
      label: JSX.Element;
      onSelect: () => void;
      checked?: boolean;
      disabled?: boolean;
      danger?: boolean;
    }
  | { kind: "separator" }
  | { kind: "label"; label: string };

/** Выпадающее меню действий (клавиатурная альтернатива перетаскиванию и т.п.). */
export function Menu(props: {
  trigger: JSX.Element;
  triggerLabel: string;
  triggerClass?: string;
  items: MenuItem[];
  active?: boolean;
  align?: "start" | "end";
}) {
  return (
    <DropdownMenu placement={props.align === "end" ? "bottom-end" : "bottom-start"} gutter={4}>
      <DropdownMenu.Trigger
        class={props.triggerClass ?? cn(triggerCls, props.active && onCls)}
        aria-label={props.triggerLabel}
        onClick={(e: MouseEvent) => e.stopPropagation()}
        onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
      >
        {props.trigger}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content class={popCls} onClick={(e: MouseEvent) => e.stopPropagation()}>
          <For each={props.items}>
            {(item) =>
              item.kind === "separator" ? (
                <DropdownMenu.Separator class="mx-0.5 my-1 h-px border-0 bg-line" />
              ) : item.kind === "label" ? (
                <div class="px-[9px] pt-1.5 pb-1 text-[10px] font-bold tracking-wide text-muted uppercase">
                  {item.label}
                </div>
              ) : (
                <DropdownMenu.Item
                  class={cn(
                    optCls,
                    item.danger && "text-danger",
                    item.disabled && "cursor-default opacity-50",
                  )}
                  disabled={item.disabled}
                  onSelect={() => item.onSelect()}
                >
                  <Show when={item.checked !== undefined}>
                    <span class="w-[15px] flex-none text-center text-accent">
                      <Show when={item.checked}>
                        <Check size={14} />
                      </Show>
                    </span>
                  </Show>
                  <span class="min-w-0 flex-1 truncate">{item.label}</span>
                </DropdownMenu.Item>
              )
            }
          </For>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu>
  );
}

export const chipCls = triggerCls;
export const chipOnCls = onCls;
