import { type JSX, For, Show, splitProps } from "solid-js";
import { cn } from "@/shared/lib/cn";

export type PillTone = "blue" | "green" | "amber" | "gray" | "red";

const PILL_TONES: Record<PillTone, string> = {
  blue: "bg-accent-soft text-accent-fg",
  green: "bg-ok-soft text-ok",
  amber: "bg-[#fff4e0] text-[#a15c00]",
  gray: "border-[#e2e6ed] bg-[#f0f2f5] text-[#636e7d]",
  red: "bg-red-soft text-red",
};

export function Pill(props: { tone?: PillTone; class?: string; children: JSX.Element; title?: string }) {
  return (
    <span class={cn("pill", PILL_TONES[props.tone ?? "blue"], props.class)} title={props.title}>
      {props.children}
    </span>
  );
}

export function initials(value: string | null | undefined): string {
  return (
    String(value || "?")
      .trim()
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((x) => x[0])
      .join("")
      .toUpperCase() || "?"
  );
}

export function Avatar(props: { name?: string | null; size?: number; class?: string; square?: boolean }) {
  return (
    <span
      class={cn(
        "grid flex-none place-items-center bg-[#e7edff] font-[750] text-[#2c55b2]",
        props.square ? "rounded-[10px]" : "rounded-full",
        props.class,
      )}
      style={{
        width: `${props.size ?? 34}px`,
        height: `${props.size ?? 34}px`,
        "font-size": `${Math.max(9, Math.round((props.size ?? 34) * 0.35))}px`,
      }}
      aria-hidden="true"
    >
      {initials(props.name)}
    </span>
  );
}

export function Card(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, rest] = splitProps(props, ["class"]);
  return <div class={cn("card", local.class)} {...rest} />;
}

export function KpiCard(props: { label: string; value: JSX.Element; sub?: string; icon?: JSX.Element }) {
  return (
    <div class="card min-w-0 p-[17px] pb-[15px] max-sm:p-[13px]">
      <div class="flex items-center justify-between gap-2.5 text-xs font-semibold text-muted max-sm:text-[11px]">
        <span>{props.label}</span>
        <Show when={props.icon}>
          <span class="grid size-8 place-items-center rounded-[10px] bg-accent-soft text-accent max-sm:size-7">
            {props.icon}
          </span>
        </Show>
      </div>
      <div class="mt-3 mb-[3px] text-[25px] font-[780] tracking-[-0.7px] [overflow-wrap:anywhere] tabular max-sm:text-[21px]">
        {props.value}
      </div>
      <Show when={props.sub}>
        <div class="text-[11px] text-muted">{props.sub}</div>
      </Show>
    </div>
  );
}

export function EmptyState(props: {
  icon?: JSX.Element;
  title: string;
  text?: string;
  children?: JSX.Element;
}) {
  return (
    <div class="px-[15px] py-8 text-center text-muted">
      <Show when={props.icon}>
        <div class="mb-2 flex justify-center text-[28px]">{props.icon}</div>
      </Show>
      <strong class="mb-1 block text-[13px] text-fg">{props.title}</strong>
      <Show when={props.text}>
        <p class="m-0 mb-3.5 text-xs">{props.text}</p>
      </Show>
      {props.children}
    </div>
  );
}

export function ErrorState(props: { message: string; onRetry?: () => void }) {
  return (
    <div class="card p-6 text-center" role="alert">
      <strong class="mb-1 block text-[13px]">Не удалось загрузить данные</strong>
      <p class="m-0 mb-3.5 text-xs text-muted">{props.message}</p>
      <Show when={props.onRetry}>
        <button type="button" class="btn btn-sm" onClick={() => props.onRetry?.()}>
          Повторить
        </button>
      </Show>
    </div>
  );
}

export function NoAccess(props: { text?: string }) {
  return (
    <div class="card p-6 text-sm" role="status">
      {props.text ?? "У вас нет доступа к этому разделу."}
    </div>
  );
}

export function Spinner(props: { size?: number; class?: string }) {
  return (
    <span
      role="status"
      aria-label="Загрузка"
      class={cn(
        "inline-block animate-spin rounded-full border-2 border-current border-r-transparent",
        props.class,
      )}
      style={{ width: `${props.size ?? 16}px`, height: `${props.size ?? 16}px` }}
    />
  );
}

export function Skeleton(props: { class?: string; lines?: number }) {
  return (
    <div class={cn("grid gap-2", props.class)} aria-hidden="true">
      <For each={Array.from({ length: props.lines ?? 1 })}>
        {() => <div class="h-3.5 animate-pulse rounded-md bg-[#eef1f6]" />}
      </For>
    </div>
  );
}

export function SkeletonCards(props: { count?: number; class?: string }) {
  return (
    <div class={cn("grid gap-2.5", props.class)} aria-busy="true" aria-label="Загрузка">
      <For each={Array.from({ length: props.count ?? 3 })}>
        {() => (
          <div class="rounded-xl border border-line bg-surface p-[13px]">
            <Skeleton lines={3} />
          </div>
        )}
      </For>
    </div>
  );
}

export function SectionTitle(props: { title: string; text?: string; actions?: JSX.Element; level?: 2 | 3 }) {
  return (
    <div class="mb-[13px] flex items-start justify-between gap-3">
      <div>
        {props.level === 3 ? (
          <h3 class="m-0 text-sm font-bold">{props.title}</h3>
        ) : (
          <h2 class="m-0 text-base font-bold tracking-[-0.25px]">{props.title}</h2>
        )}
        <Show when={props.text}>
          <p class="mt-[3px] mb-0 text-xs text-muted">{props.text}</p>
        </Show>
      </div>
      {props.actions}
    </div>
  );
}

export function Notice(props: { children: JSX.Element; class?: string; tone?: "info" | "warn" | "danger" }) {
  return (
    <div
      class={cn(
        "mt-[13px] rounded-[10px] border px-3 py-2.5 text-[11px] leading-normal",
        props.tone === "warn"
          ? "border-[#f3dfb6] bg-warn-soft text-warn"
          : props.tone === "danger"
            ? "border-[#f6d2d4] bg-danger-soft text-danger"
            : "border-line bg-[#f4f7fc] text-[#596579]",
        props.class,
      )}
    >
      {props.children}
    </div>
  );
}
