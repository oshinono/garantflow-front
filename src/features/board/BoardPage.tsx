import { type RouteSectionProps, useNavigate, useSearchParams } from "@solidjs/router";
import { useQueryClient } from "@tanstack/solid-query";
import { FileSpreadsheet, LayoutTemplate, Plus, Search, X } from "lucide-solid";
import { For, Show, createMemo, createSignal } from "solid-js";
import { errorMessage } from "@/api/errors";
import {
  invalidateApplication,
  putApplicationPatch,
  toBoardItems,
  useApplications,
  useBoardExtras,
  useSetResponsible,
  useStatusTransition,
} from "@/api/queries/applications";
import { bankName, useBanks } from "@/api/queries/banks";
import { api, unwrap } from "@/api/client";
import { getColumnColors } from "@/api/stubs/extras";
import { stubVersion } from "@/api/stubs/storage";
import { PageHeader } from "@/app/PageHeader";
import { useWorkspace } from "@/app/workspace";
import {
  applyBoard,
  type BoardFilters,
  type BoardItem,
  filtersFromParams,
  filtersToParams,
  hasActiveFilters,
} from "@/domain/board";
import { formatDate } from "@/domain/dates";
import { toBig } from "@/domain/money";
import { forbiddenTransitionHint, transitionKind } from "@/domain/status";
import {
  type ApplicationStatus,
  type ApplicationSummary,
  GUARANTEE_TYPE_LABELS,
  LAW_KIND_LABELS,
  STATUSES,
  STATUS_DESCRIPTIONS,
  STATUS_LABELS,
  applicationNumber,
  lawKindOf,
  procurementRef,
} from "@/domain/types";
import { useHotkeys } from "@/shared/hooks/useHotkeys";
import { cn } from "@/shared/lib/cn";
import { exportXlsx } from "@/shared/lib/excel";
import { Button } from "@/shared/ui/Button";
import { ErrorState, NoAccess, SkeletonCards } from "@/shared/ui/display";
import { toast } from "@/shared/ui/Toast";
import { TemplatesDialog } from "@/features/templates/TemplatesDialog";
import { logAppActivity, statusChangeText } from "@/features/application/activity";
import { AppCard } from "./AppCard";
import { FilterBar } from "./FilterBar";
import { ArchiveDialog, ReopenDialog } from "./TransitionDialogs";

const PAGE = 100;

export function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  if (!Number.isFinite(n)) return `rgba(82,120,216,${alpha})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export function BoardPage(props: RouteSectionProps) {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams<Record<string, string>>();
  const apps = useApplications(ws.wsId);
  const extras = useBoardExtras(ws.wsId);
  const banks = useBanks(ws.wsId, () => true);
  const transition = useStatusTransition(ws.wsId);
  const setResponsible = useSetResponsible(ws.wsId);

  const filters = createMemo(() => filtersFromParams(params));
  const setFilters = (f: BoardFilters) => setParams({ ...filtersToParams(f) }, { replace: true });

  const items = createMemo(() => toBoardItems(apps.data, extras.data));
  const filtered = createMemo(() => applyBoard(items(), filters(), { userId: ws.me().id }));
  const colors = createMemo(() => (void stubVersion(), getColumnColors(ws.wsId())));
  const activeBanks = () => (banks.data ?? []).filter((b) => b.is_active);
  const nameOfBank = (id: string | null | undefined) => bankName(banks.data, id);

  const [selected, setSelected] = createSignal<Set<string>>(new Set());
  const [archiveFor, setArchiveFor] = createSignal<ApplicationSummary | null>(null);
  const [reopenFor, setReopenFor] = createSignal<ApplicationSummary | null>(null);
  const [templatesOpen, setTemplatesOpen] = createSignal(false);
  const [dragOver, setDragOver] = createSignal<ApplicationStatus | null>(null);
  const [limits, setLimits] = createSignal<Record<string, number>>({});
  const [bulkBusy, setBulkBusy] = createSignal(false);
  let searchRef: HTMLInputElement | undefined;

  const canEdit = () => ws.can("application.edit");
  const keepQuery = () => {
    const qs = new URLSearchParams(
      Object.entries(filtersToParams(filters())).filter((e): e is [string, string] => !!e[1]),
    ).toString();
    return qs ? `&${qs}` : "";
  };
  const openApp = (id: string, tab = "data") =>
    navigate(`/w/${ws.wsId()}/board/${id}?tab=${tab}${keepQuery()}`);
  const newApp = (template?: string) =>
    navigate(`/w/${ws.wsId()}/board/new?tab=data${template ? `&template=${template}` : ""}${keepQuery()}`);

  useHotkeys({
    new: () => canEdit() && newApp(),
    search: () => searchRef?.focus(),
    escape: () => setSelected(new Set<string>()),
  });

  const toggleSelect = (id: string, on: boolean) => {
    const next = new Set(selected());
    if (on) next.add(id);
    else next.delete(id);
    setSelected(next);
  };

  /** Перенос между колонками: диалоги архива/возврата, выдача через карточку. */
  const move = (app: ApplicationSummary, to: ApplicationStatus) => {
    if (!canEdit()) return toast("Недостаточно прав");
    const kind = transitionKind(app.status, to);
    if (kind === "same") return;
    if (kind === "forbidden") return toast(forbiddenTransitionHint(app.status, to));
    if (kind === "archive") return setArchiveFor(app);
    if (kind === "reopen") return setReopenFor(app);
    toast("Заполните данные о выдаче — статус сменится после сохранения гарантии.");
    openApp(app.id, "issuance");
  };

  const doTransition = (
    app: ApplicationSummary,
    to: ApplicationStatus,
    v: { reason?: string; self?: boolean | null; comment?: string },
  ) => {
    transition.mutate(
      { id: app.id, to, ...v },
      {
        onSuccess: () => {
          logAppActivity(ws.wsId(), app, ws.me(), [statusChangeText(app.status, to)]);
          toast(`Заявка № ${applicationNumber(app)}: статус «${STATUS_LABELS[to]}».`);
          setArchiveFor(null);
          setReopenFor(null);
        },
        onError: (e) => toast(errorMessage(e)),
      },
    );
  };

  const changeResponsible = (app: ApplicationSummary, userId: string | null) => {
    setResponsible.mutate(
      { id: app.id, userId },
      {
        onSuccess: () =>
          logAppActivity(ws.wsId(), app, ws.me(), [
            `Ответственный: ${ws.memberName(app.responsible_user_id)} → ${ws.memberName(userId)}`,
          ]),
        onError: (e) => toast(errorMessage(e)),
      },
    );
  };

  const onDrop = (e: DragEvent, to: ApplicationStatus) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer?.getData("text/plain");
    const app = apps.data?.find((a) => a.id === id);
    if (app) move(app, to);
  };

  /** STUB Z-18: пока нет массового эндпоинта — последовательные запросы с итоговым тостом. */
  const bulk = async (op: "owner" | "status", value: string) => {
    const ids = [...selected()];
    const list = (apps.data ?? []).filter((a) => ids.includes(a.id));
    setBulkBusy(true);
    let ok = 0;
    let fail = 0;
    for (const app of list) {
      try {
        if (op === "owner") {
          const userId = value || null;
          if (app.responsible_user_id === userId) continue;
          await putApplicationPatch(ws.wsId(), app.id, { responsible_user_id: userId });
          logAppActivity(ws.wsId(), app, ws.me(), [
            `Ответственный: ${ws.memberName(app.responsible_user_id)} → ${ws.memberName(userId)}`,
          ]);
        } else {
          const to = value as ApplicationStatus;
          const kind = transitionKind(app.status, to);
          if (kind === "same") continue;
          if (kind !== "archive" && kind !== "reopen")
            throw new Error(forbiddenTransitionHint(app.status, to));
          const path = { workspace_id: ws.wsId(), application_id: app.id };
          await unwrap(
            kind === "archive"
              ? api.POST("/api/v1/workspaces/{workspace_id}/applications/{application_id}/archive", {
                  params: { path },
                  body: {},
                })
              : api.POST("/api/v1/workspaces/{workspace_id}/applications/{application_id}/reopen", {
                  params: { path },
                  body: {},
                }),
          );
          logAppActivity(ws.wsId(), app, ws.me(), [statusChangeText(app.status, to)]);
        }
        ok++;
      } catch {
        fail++;
      }
    }
    setBulkBusy(false);
    setSelected(new Set<string>());
    invalidateApplication(qc, ws.wsId());
    toast(`Готово: ${ok}, ошибок: ${fail}`);
  };

  const exportList = () => {
    let list = filtered();
    if (selected().size) list = list.filter((a) => selected().has(a.id));
    if (!list.length) {
      toast(
        selected().size
          ? "Среди выбранных заявок нет записей, соответствующих текущим фильтрам и поиску."
          : "По текущим фильтрам и поиску нет заявок для экспорта.",
      );
      return;
    }
    void exportXlsx(
      [
        [
          "№",
          "Раздел",
          "Клиент",
          "ИНН",
          "Тип закупки",
          "Закупка / договор",
          "Вид БГ",
          "Сумма БГ",
          "ОПЗ",
          "Банк заведения",
          "Ответственный",
          "Банки",
        ],
        ...list.map((a: BoardItem) => [
          applicationNumber(a),
          STATUS_LABELS[a.status],
          a.client_name ?? "",
          a.client_inn ?? "",
          LAW_KIND_LABELS[lawKindOf(a)],
          procurementRef(a),
          GUARANTEE_TYPE_LABELS[a.guarantee_type],
          toBig(a.requested_amount).toNumber(),
          a.application_deadline ? formatDate(a.application_deadline) : "",
          a.primaryBankId ? nameOfBank(a.primaryBankId) : "",
          a.responsible_user_id ? ws.memberName(a.responsible_user_id) : "",
          (a.bank_statuses ?? []).map((b) => `${b.bank_name}: ${b.state}`).join("; "),
        ]),
      ],
      "zayavki",
    );
  };

  const column = (st: ApplicationStatus) => filtered().filter((a) => a.status === st);
  const total = (st: ApplicationStatus) => (apps.data ?? []).filter((a) => a.status === st).length;
  const limit = (st: ApplicationStatus) => limits()[st] ?? PAGE;

  return (
    <>
      <PageHeader
        eyebrow="Рабочий процесс"
        title="Доска заявок"
        description="Перетаскивайте карточки между колонками, чтобы обновить статус."
        actions={
          <>
            <Show when={canEdit()}>
              <Button variant="primary" onClick={() => newApp()}>
                <Plus size={16} /> Новая заявка
              </Button>
              <Button onClick={() => setTemplatesOpen(true)}>
                <LayoutTemplate size={16} /> Из шаблона
              </Button>
            </Show>
            <Button onClick={exportList}>
              <FileSpreadsheet size={16} /> Экспорт в Excel
            </Button>
          </>
        }
      />

      <div class="mb-[18px] flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-[11px] shadow-card max-sm:gap-2">
        <Search size={18} class="flex-none text-muted" />
        <input
          ref={searchRef}
          class="min-w-0 flex-1 border-0 bg-transparent py-[7px] outline-none"
          placeholder="Поиск по ИНН, клиенту, закупке, комментариям и файлам…"
          autocomplete="off"
          aria-label="Поиск по заявкам"
          value={filters().q}
          onInput={(e) => setFilters({ ...filters(), q: e.currentTarget.value })}
        />
        <Show when={filters().q}>
          <Button
            variant="subtle"
            size="icon"
            aria-label="Очистить поиск"
            onClick={() => {
              setFilters({ ...filters(), q: "" });
              searchRef?.focus();
            }}
          >
            <X size={16} />
          </Button>
        </Show>
      </div>

      <Show
        when={ws.can("application.view")}
        fallback={<NoAccess text="У вас нет права просмотра заявок в этом воркспейсе." />}
      >
        <FilterBar
          filters={filters()}
          onChange={setFilters}
          items={items()}
          shown={filtered().length}
          banks={activeBanks()}
        />

        <Show
          when={!apps.isError}
          fallback={<ErrorState message={errorMessage(apps.error)} onRetry={() => void apps.refetch()} />}
        >
          <div class="grid grid-cols-[repeat(3,minmax(250px,1fr))] items-start gap-3.5 max-md:grid-cols-[repeat(3,minmax(235px,1fr))] max-md:overflow-x-auto max-md:pb-[5px] max-sm:grid-cols-1 max-sm:overflow-visible">
            <For each={STATUSES}>
              {(st) => (
                <section
                  class={cn(
                    "min-h-[225px] min-w-0 rounded-[14px] border p-2.5 transition-colors max-sm:min-h-0",
                    dragOver() === st && "shadow-[inset_0_0_0_2px_var(--col)]",
                  )}
                  style={{
                    "--col": colors()[st],
                    background: hexToRgba(colors()[st], dragOver() === st ? 0.16 : 0.095),
                    "border-color": hexToRgba(colors()[st], 0.3),
                  }}
                  aria-label={`Колонка «${STATUS_LABELS[st]}»`}
                  onDragOver={(e) => {
                    if (!canEdit()) return;
                    e.preventDefault();
                    setDragOver(st);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(null);
                  }}
                  onDrop={(e) => onDrop(e, st)}
                >
                  <div class="flex items-center gap-[9px] px-1 pt-1 pb-3">
                    <span
                      class="size-[9px] rounded-full"
                      style={{
                        background: colors()[st],
                        "box-shadow": `0 0 0 3px ${hexToRgba(colors()[st], 0.13)}`,
                      }}
                    />
                    <h2 class="m-0 text-[13px] font-[750]">{STATUS_LABELS[st]}</h2>
                    <span class="flex-1" />
                    <span
                      class="rounded-full bg-white/70 px-[7px] py-0.5 text-[11px] text-muted"
                      title="Всего заявок в статусе"
                    >
                      {total(st)}
                    </span>
                  </div>
                  <div class="mx-[5px] mt-1 mb-px text-[10px] text-faint">{STATUS_DESCRIPTIONS[st]}</div>
                  <div class="mt-2 grid min-h-40 gap-2.5 max-sm:min-h-[60px]">
                    <Show when={!apps.isLoading} fallback={<SkeletonCards count={2} />}>
                      <For
                        each={column(st).slice(0, limit(st))}
                        fallback={
                          <div class="rounded-[10px] border border-dashed border-[#cdd4df] px-2.5 py-6 text-center text-xs text-faint">
                            {filters().q || hasActiveFilters(filters())
                              ? "Нет совпадений"
                              : canEdit()
                                ? "Перетащите заявку сюда"
                                : "Пусто"}
                          </div>
                        }
                      >
                        {(app) => (
                          <AppCard
                            app={app}
                            bankName={(id) => (id ? nameOfBank(id) : "Не выбран")}
                            members={ws.members()}
                            canEdit={canEdit()}
                            selected={selected().has(app.id)}
                            selectionMode={selected().size > 0}
                            onOpen={() => openApp(app.id)}
                            onToggleSelect={(on) => toggleSelect(app.id, on)}
                            onMove={(to) => move(app, to)}
                            onResponsible={(uid) => changeResponsible(app, uid)}
                          />
                        )}
                      </For>
                      <Show when={column(st).length > limit(st)}>
                        <Button size="sm" onClick={() => setLimits({ ...limits(), [st]: limit(st) + PAGE })}>
                          Показать ещё ({column(st).length - limit(st)})
                        </Button>
                      </Show>
                    </Show>
                  </div>
                </section>
              )}
            </For>
          </div>
          <Show when={filters().q}>
            <p class="mx-0.5 my-[13px] text-[11px] text-muted">
              Найдено заявок: {filtered().length}. Поиск применяется ко всем колонкам текущего воркспейса.
            </p>
          </Show>
        </Show>
      </Show>

      <Show when={selected().size && canEdit()}>
        <div
          class="fixed bottom-[22px] left-1/2 z-50 flex max-w-[calc(100vw-24px)] -translate-x-1/2 flex-wrap items-center gap-2.5 rounded-[14px] bg-ink-2 px-4 py-2.5 safe-bottom text-xs text-white shadow-[0_10px_30px_rgba(20,30,60,.3)]"
          role="region"
          aria-label="Массовые действия"
        >
          <strong>Выбрано: {selected().size}</strong>
          <select
            class="control !w-auto !max-w-[190px] !px-[9px] !py-[7px] !text-xs"
            aria-label="Назначить ответственного"
            disabled={bulkBusy()}
            onChange={(e) => {
              const v = e.currentTarget.value;
              e.currentTarget.value = "__";
              if (v !== "__") void bulk("owner", v);
            }}
          >
            <option value="__">Назначить ответственного…</option>
            <option value="">Снять ответственного</option>
            <For each={ws.members()}>{(m) => <option value={m.user_id}>{m.name}</option>}</For>
          </select>
          <select
            class="control !w-auto !max-w-[190px] !px-[9px] !py-[7px] !text-xs"
            aria-label="Перенести в этап"
            disabled={bulkBusy()}
            onChange={(e) => {
              const v = e.currentTarget.value;
              e.currentTarget.value = "";
              if (v) void bulk("status", v);
            }}
          >
            <option value="">Перенести в этап…</option>
            <option value="in_progress">{STATUS_LABELS.in_progress}</option>
            <option value="archived">{STATUS_LABELS.archived}</option>
          </select>
          <Button size="sm" class="!text-fg" onClick={() => setSelected(new Set<string>())}>
            Снять выбор
          </Button>
        </div>
      </Show>

      <ArchiveDialog
        app={archiveFor()}
        busy={transition.isPending}
        onCancel={() => setArchiveFor(null)}
        onConfirm={(v) => doTransition(archiveFor()!, "archived", { reason: v.reason, self: v.self })}
      />
      <ReopenDialog
        app={reopenFor()}
        busy={transition.isPending}
        onCancel={() => setReopenFor(null)}
        onConfirm={(comment) => doTransition(reopenFor()!, "in_progress", { comment })}
      />
      <TemplatesDialog
        open={templatesOpen()}
        onClose={() => setTemplatesOpen(false)}
        onPick={(id) => {
          setTemplatesOpen(false);
          newApp(id);
        }}
      />
      {props.children}
    </>
  );
}
