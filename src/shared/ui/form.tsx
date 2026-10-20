import { type JSX, For, Show, createEffect, createSignal, createUniqueId, splitProps } from "solid-js";
import { formatMoneyInput, parseMoney } from "@/domain/money";
import { cn } from "@/shared/lib/cn";

type FieldProps = {
  label: JSX.Element;
  error?: string | null;
  hint?: JSX.Element;
  warning?: string | null;
  class?: string;
  children: (id: string, describedBy: string | undefined) => JSX.Element;
};

/** Подпись + контрол + ошибка/подсказка с aria-связями. */
export function Field(props: FieldProps) {
  const id = createUniqueId();
  const msgId = `${id}-msg`;
  const describedBy = () => (props.error || props.warning || props.hint ? msgId : undefined);
  return (
    <div class={cn("field", props.class)}>
      <label for={id}>{props.label}</label>
      {props.children(id, describedBy())}
      <Show when={props.error || props.warning || props.hint}>
        <div
          id={msgId}
          class={cn(
            "min-h-3.5 text-[11px] font-medium",
            props.error ? "text-danger" : props.warning ? "text-[#c0362c]" : "text-muted",
          )}
        >
          {props.error || props.warning || props.hint}
        </div>
      </Show>
    </div>
  );
}

type InputProps = Omit<JSX.InputHTMLAttributes<HTMLInputElement>, "onInput" | "value"> & {
  value?: string | number | null;
  onValue?: (v: string) => void;
  invalid?: boolean;
};

export function Input(props: InputProps) {
  const [local, rest] = splitProps(props, ["class", "value", "onValue", "invalid"]);
  return (
    <input
      class={cn("control", local.class)}
      value={local.value ?? ""}
      aria-invalid={local.invalid || undefined}
      onInput={(e) => local.onValue?.(e.currentTarget.value)}
      {...rest}
    />
  );
}

/**
 * Ввод денег: принимает пробелы и запятую, показывает разделители разрядов,
 * наружу отдаёт сырую строку (нормализация — parseMoney при сохранении).
 */
export function MoneyInput(props: Omit<InputProps, "type">) {
  const [local, rest] = splitProps(props, ["value", "onValue", "class", "invalid"]);
  const [focused, setFocused] = createSignal(false);
  const display = () => {
    const raw = String(local.value ?? "");
    if (focused()) return raw;
    const parsed = parseMoney(raw);
    return parsed ? formatMoneyInput(parsed) : raw;
  };
  return (
    <div class="relative">
      <input
        class={cn("control pr-7 tabular", local.class)}
        inputmode="decimal"
        autocomplete="off"
        value={display()}
        aria-invalid={local.invalid || undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onInput={(e) => local.onValue?.(e.currentTarget.value)}
        {...rest}
      />
      <span class="pointer-events-none absolute top-1/2 right-[11px] -translate-y-1/2 text-xs text-muted">
        ₽
      </span>
    </div>
  );
}

export function Textarea(
  props: Omit<JSX.TextareaHTMLAttributes<HTMLTextAreaElement>, "onInput" | "value"> & {
    value?: string | null;
    onValue?: (v: string) => void;
    invalid?: boolean;
  },
) {
  const [local, rest] = splitProps(props, ["class", "value", "onValue", "invalid"]);
  return (
    <textarea
      class={cn("control resize-y", local.class)}
      value={local.value ?? ""}
      aria-invalid={local.invalid || undefined}
      onInput={(e) => local.onValue?.(e.currentTarget.value)}
      {...rest}
    />
  );
}

export type Option = { value: string; label: string; disabled?: boolean };

export function Select(
  props: Omit<JSX.SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value"> & {
    value?: string | null;
    options: Option[];
    placeholder?: string;
    onValue?: (v: string) => void;
    invalid?: boolean;
  },
) {
  const [local, rest] = splitProps(props, ["class", "value", "options", "placeholder", "onValue", "invalid"]);
  let ref: HTMLSelectElement | undefined;
  // Нативный select не всегда подхватывает value до появления опций.
  createEffect(() => {
    const v = local.value ?? "";
    void local.options.length;
    if (ref && ref.value !== v) ref.value = v;
  });
  return (
    <select
      ref={ref}
      class={cn("control", local.class)}
      aria-invalid={local.invalid || undefined}
      onChange={(e) => local.onValue?.(e.currentTarget.value)}
      {...rest}
    >
      <Show when={local.placeholder != null}>
        <option value="">{local.placeholder}</option>
      </Show>
      <For each={local.options}>
        {(o) => (
          <option value={o.value} disabled={o.disabled} selected={o.value === (local.value ?? "")}>
            {o.label}
          </option>
        )}
      </For>
    </select>
  );
}

export function Checkbox(props: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: JSX.Element;
  disabled?: boolean;
  class?: string;
}) {
  return (
    <label class={cn("flex items-center gap-[9px] py-[7px] text-xs text-fg", props.class)}>
      <input
        type="checkbox"
        class="m-0 size-4 accent-accent"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
      />
      {props.label}
    </label>
  );
}

/** Сегментный переключатель (.seg прототипа). allowReset — повторное нажатие сбрасывает выбор. */
export function SegmentedControl<T extends string>(props: {
  value: T | null;
  options: { value: T; label: string; tone?: "ok" | "no" }[];
  onChange: (v: T | null) => void;
  label: string;
  allowReset?: boolean;
  disabled?: boolean;
  class?: string;
}) {
  return (
    <div class={cn("seg", props.class)} role="group" aria-label={props.label}>
      <For each={props.options}>
        {(o) => {
          const on = () => props.value === o.value;
          return (
            <button
              type="button"
              aria-pressed={on()}
              disabled={props.disabled}
              title={on() && props.allowReset ? "Нажмите, чтобы сбросить" : undefined}
              class={cn(on() && o.tone === "ok" && "!text-ok", on() && o.tone === "no" && "!text-red")}
              onClick={() => props.onChange(on() ? (props.allowReset ? null : o.value) : o.value)}
            >
              {o.label}
            </button>
          );
        }}
      </For>
    </div>
  );
}
