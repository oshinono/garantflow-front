import { Ellipsis } from "lucide-solid";
import { For, Show } from "solid-js";
import type { MemberWithUser } from "@/api/queries/workspaces";
import type { BoardItem } from "@/domain/board";
import { daysUntil, deadlineTag, formatDate } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import { transitionKind } from "@/domain/status";
import {
  type ApplicationStatus,
  type BankRequestState,
  GUARANTEE_TYPE_LABELS,
  LAW_KIND_LABELS,
  STATUSES,
  STATUS_LABELS,
  applicationNumber,
  lawKindOf,
  procurementRef,
} from "@/domain/types";
import { cn } from "@/shared/lib/cn";
import { initials, Pill } from "@/shared/ui/display";
import { Menu } from "@/shared/ui/FilterDropdown";

const BANK_CHIP: Record<BankRequestState, { cls: string; label: string } | null> = {
  draft: { cls: "bg-[#f0f2f5] text-[#636e7d]", label: "черновик" },
  pending: { cls: "bg-[#fff4e0] text-[#a15c00]", label: "рассматривает" },
  approved: { cls: "bg-[#e6f5ee] text-[#1d7a56]", label: "одобрено" },
  rejected: { cls: "bg-red-soft text-red", label: "отказ" },
  issued: { cls: "bg-[#e6f5ee] text-[#1d7a56]", label: "выдана" },
};

export function AppCard(props: {
  app: BoardItem;
  bankName: (id: string | null | undefined) => string;
  members: MemberWithUser[];
  canEdit: boolean;
  selected: boolean;
  selectionMode: boolean;
  onOpen: () => void;
  onToggleSelect: (on: boolean) => void;
  onMove: (to: ApplicationStatus) => void;
  onResponsible: (userId: string | null) => void;
}) {
  const a = () => props.app;
  const kind = () => lawKindOf(a());
  const tag = () => (a().status === "in_progress" ? deadlineTag(daysUntil(a().application_deadline)) : null);
  const owner = () => props.members.find((m) => m.user_id === a().responsible_user_id);

  return (
    <article
      class={cn(
        "group relative cursor-pointer rounded-xl border border-line bg-surface p-[13px] shadow-[0_2px_7px_#16253b07] transition-[box-shadow,border-color,transform] duration-150",
        "hover:-translate-y-px hover:border-[#c8d5f3] hover:shadow-[0_7px_20px_#20355b10] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent",
        props.selected && "border-accent-line bg-[#fbfcff]",
      )}
      role="button"
      tabindex="0"
      aria-label={`Открыть заявку № ${applicationNumber(a())}: ${a().client_name || "Без названия"}`}
      draggable={props.canEdit}
      data-card-id={a().id}
      onClick={() => props.onOpen()}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onOpen();
        }
      }}
      onDragStart={(e) => {
        e.dataTransfer?.setData("text/plain", a().id);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
        e.currentTarget.classList.add("opacity-40");
      }}
      onDragEnd={(e) => e.currentTarget.classList.remove("opacity-40")}
    >
      <Show when={props.canEdit}>
        <input
          type="checkbox"
          class={cn(
            "absolute top-2.5 right-2.5 z-[2] m-0 size-4 cursor-pointer accent-accent opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            (props.selected || props.selectionMode) && "opacity-100",
          )}
          aria-label="Выбрать заявку"
          checked={props.selected}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onChange={(e) => props.onToggleSelect(e.currentTarget.checked)}
        />
      </Show>
      <div class="mb-2.5 flex items-center gap-[7px] pr-6">
        <span class="text-[11px] font-[650] text-muted">№ {applicationNumber(a())}</span>
        <Pill tone="blue">{LAW_KIND_LABELS[kind()]}</Pill>
      </div>
      <div class="m-0 mb-[3px] text-sm font-[750] tracking-[-0.25px] [overflow-wrap:anywhere]">
        {a().client_name || "Без названия"}
      </div>
      <div class="text-xs [overflow-wrap:anywhere] text-muted">
        ИНН {a().client_inn || "—"} · {GUARANTEE_TYPE_LABELS[a().guarantee_type]}
      </div>
      <div class="mt-[13px] mb-[11px] flex items-end justify-between gap-3 border-t border-line-soft pt-[11px] max-sm:items-center">
        <div>
          <div class="mb-0.5 text-[11px] text-muted">Сумма БГ</div>
          <div class="text-[17px] font-[780] tracking-[-0.35px] tabular">
            {formatMoney(a().requested_amount)}
          </div>
        </div>
        <div class="text-right text-[11px] text-muted">
          Банк заведения
          <br />
          <strong class="text-fg">{props.bankName(a().primaryBankId)}</strong>
        </div>
      </div>
      <Show when={kind() !== "vat"}>
        <div class="text-xs [overflow-wrap:anywhere] text-muted">
          {kind() === "commercial" ? "Договор" : "Закупка"}: {procurementRef(a())}
        </div>
      </Show>
      <Show when={a().application_deadline}>
        <div class="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          ОПЗ: {formatDate(a().application_deadline)}
          <Show when={tag()}>{(t) => <Pill tone={t().tone}>{t().text}</Pill>}</Show>
        </div>
      </Show>
      <Show when={a().bank_statuses?.length}>
        <div class="mt-2 flex flex-wrap gap-[5px]">
          <For each={a().bank_statuses}>
            {(b) => (
              <span class={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", BANK_CHIP[b.state]?.cls)}>
                {b.bank_name}: {BANK_CHIP[b.state]?.label}
              </span>
            )}
          </For>
        </div>
      </Show>
      <div class="mt-[9px] flex items-center gap-1.5 text-[11px] font-semibold text-fg-2">
        <span class="grid size-5 flex-none place-items-center rounded-full bg-[#edf1fb] text-[9px] font-extrabold text-[#3a579d]">
          {owner() ? initials(owner()!.name).slice(0, 2) : "?"}
        </span>
        <Show when={props.canEdit} fallback={<span>{owner()?.name ?? "Не назначен"}</span>}>
          <select
            class="max-w-[170px] cursor-pointer border-0 bg-transparent p-0.5 text-[11px] font-semibold text-fg-2 hover:text-[#2f56c4]"
            aria-label="Ответственный"
            value={a().responsible_user_id ?? ""}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onChange={(e) => props.onResponsible(e.currentTarget.value || null)}
          >
            <option value="">Не назначен</option>
            <For each={props.members}>
              {(m) => (
                <option value={m.user_id} selected={m.user_id === a().responsible_user_id}>
                  {m.name}
                </option>
              )}
            </For>
          </select>
        </Show>
        <span class="flex-1" />
        <Show when={props.canEdit}>
          <Menu
            triggerLabel="Переместить в…"
            triggerClass="grid size-7 place-items-center rounded-md border border-transparent bg-transparent p-0 text-muted hover:border-line hover:bg-hover hover:text-fg"
            trigger={<Ellipsis size={16} />}
            align="end"
            items={[
              { kind: "label", label: "Переместить в…" },
              ...STATUSES.map((s) => ({
                label: STATUS_LABELS[s],
                checked: a().status === s,
                disabled: transitionKind(a().status, s) === "forbidden",
                onSelect: () => props.onMove(s),
              })),
            ]}
          />
        </Show>
      </div>
    </article>
  );
}
