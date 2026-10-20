import { Tabs } from "@kobalte/core/tabs";
import { A, useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { useQueryClient } from "@tanstack/solid-query";
import { Match, Show, Switch, createEffect, createSignal, untrack } from "solid-js";
import { createStore, reconcile, unwrap as unwrapStore } from "solid-js/store";
import { errorMessage, fieldErrors, isApiError } from "@/api/errors";
import {
  invalidateApplication,
  useApplication,
  useBoardExtras,
  useStatusTransition,
} from "@/api/queries/applications";
import { type SaveProgress, saveApplication } from "@/api/queries/application-save";
import { bankName, useBanks } from "@/api/queries/banks";
import { useTemplateMutations, useTemplates } from "@/api/queries/stubs";
import { setPrimaryBank } from "@/api/stubs/extras";
import { readStub, updateStub } from "@/api/stubs/storage";
import { useWorkspace } from "@/app/workspace";
import {
  type ApplicationDraft,
  type DraftErrors,
  type DraftField,
  detailToDraft,
  diffDrafts,
  emptyDraft,
  isDraftDirty,
  repeatDraft,
  validateDraft,
} from "@/domain/application-form";
import { formatDate, periodDays } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import {
  GUARANTEE_TYPE_LABELS,
  LAW_KIND_LABELS,
  type LawKind,
  type ProcurementGuaranteeType,
  STATUS_LABELS,
  applicationNumber,
} from "@/domain/types";
import { env } from "@/env";
import { Button } from "@/shared/ui/Button";
import { Dialog, confirmDialog, promptDialog } from "@/shared/ui/Dialog";
import { Pill, Spinner } from "@/shared/ui/display";
import { toast } from "@/shared/ui/Toast";
import { ReopenDialog } from "@/features/board/TransitionDialogs";
import { BUILT_IN_TEMPLATES, applyTemplate } from "@/features/templates/templates";
import { appLabel, logAppActivity } from "./activity";
import { BanksTab } from "./BanksTab";
import { ApplicationContext, type ApplicationCtx, type IssuancePrefill, type TabId, useApp } from "./context";
import { DataTab, useDraftWarnings } from "./DataTab";
import { FilesTab, HistoryTab } from "./FilesHistoryTabs";
import { IssuanceTab } from "./IssuanceTab";

const TABS: { id: TabId; label: string }[] = [
  { id: "data", label: "Данные о заявке" },
  { id: "issuance", label: "Выдача" },
  { id: "banks", label: "Банки" },
  { id: "files", label: "Вложения" },
  { id: "history", label: "История" },
];

/** Поля 422 из API → поля формы. */
const API_FIELD: Record<string, DraftField> = {
  name: "clientName",
  inn: "clientInn",
  requested_amount: "requestedAmount",
  registry_number: "registryNumber",
  placement_url: "placementUrl",
  nmc: "nmc",
  customer_inn: "customerInn",
  beneficiary_inn: "beneficiaryInn",
  beneficiary_name: "beneficiaryName",
  requested_valid_to: "validTo",
  number: "number",
};

type BasedOn = Record<string, { id: string; label: string }>;

/** Карточка заявки поверх доски: /w/:ws/board/:applicationId?tab= (и /board/new). */
export default function ApplicationRoute() {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const params = useParams<{ applicationId: string }>();
  const [search, setSearch] = useSearchParams<{ tab?: string; template?: string; from?: string }>();
  const isNew = () => params.applicationId === "new";
  const appId = () => (isNew() ? null : params.applicationId);

  const detailQ = useApplication(ws.wsId, appId);
  const sourceQ = useApplication(ws.wsId, () => (isNew() && search.from ? search.from : null));
  const extras = useBoardExtras(ws.wsId);
  const banksQ = useBanks(ws.wsId, () => true);
  const templatesQ = useTemplates(ws.wsId);
  const templateOps = useTemplateMutations(ws.wsId);
  const transition = useStatusTransition(ws.wsId);

  const [draft, setDraft] = createStore<ApplicationDraft>(emptyDraft(ws.me().id));
  const [original, setOriginal] = createSignal<ApplicationDraft | null>(null);
  const [initKey, setInitKey] = createSignal<string | null>(null);
  const [errors, setErrors] = createSignal<DraftErrors>({});
  const [busy, setBusy] = createSignal(false);
  const [prefill, setPrefill] = createSignal<IssuancePrefill>(null);
  const [reopenOpen, setReopenOpen] = createSignal(false);
  let progress: SaveProgress = {};

  const detail = () => (isNew() ? undefined : detailQ.data);
  const tab = (): TabId => {
    const t = search.tab as TabId | undefined;
    if (isNew() || !t || !TABS.some((x) => x.id === t)) return "data";
    return t;
  };
  const goTab = (t: TabId) => setSearch({ tab: t }, { replace: true });
  const readOnly = () => detail()?.status === "archived" || !ws.can("application.edit");
  const clone = (d: ApplicationDraft): ApplicationDraft => ({ ...unwrapStore(d) });

  // Инициализация черновика: один раз на заявку/шаблон/источник повтора.
  createEffect(() => {
    const key = isNew() ? `new:${search.template ?? ""}:${search.from ?? ""}` : `edit:${appId()}`;
    if (untrack(initKey) === key) return;
    const primary = extras.data?.primary ?? {};
    let base: ApplicationDraft;
    if (isNew()) {
      if (search.from && !sourceQ.data) return;
      base =
        search.from && sourceQ.data
          ? repeatDraft(detailToDraft(sourceQ.data, primary[search.from]))
          : emptyDraft(ws.me().id);
      if (search.template) {
        const t = [...BUILT_IN_TEMPLATES, ...(templatesQ.data ?? [])].find((x) => x.id === search.template);
        if (!t && templatesQ.isLoading) return;
        if (t) base = applyTemplate(base, t);
      }
      progress = {};
    } else {
      if (!detailQ.data || !extras.data) return;
      base = detailToDraft(detailQ.data, primary[detailQ.data.id] ?? null);
    }
    setDraft(reconcile(base));
    setOriginal({ ...base });
    setErrors({});
    setInitKey(key);
  });

  const dirty = () => {
    const o = original();
    return !!o && !readOnly() && isDraftDirty(o, draft);
  };

  const backHref = () => {
    const rest = Object.entries(search).filter(([k, v]) => !["tab", "template", "from"].includes(k) && v);
    const qs = new URLSearchParams(rest as [string, string][]).toString();
    return `/w/${ws.wsId()}/board${qs ? `?${qs}` : ""}`;
  };
  const close = () => navigate(backHref());
  const beforeClose = async () =>
    !dirty() ||
    confirmDialog({
      title: "Закрыть без сохранения?",
      text: "В заявке есть несохранённые изменения. Они будут потеряны.",
      confirmLabel: "Закрыть",
      cancelLabel: "Вернуться",
      danger: true,
    });

  const displayValue = (field: DraftField, v: string): string => {
    if (!v) return "";
    switch (field) {
      case "responsibleUserId":
        return ws.memberName(v);
      case "primaryBankId":
        return bankName(banksQ.data, v);
      case "law":
        return LAW_KIND_LABELS[v as LawKind];
      case "guaranteeType":
        return GUARANTEE_TYPE_LABELS[v as ProcurementGuaranteeType];
      case "requestedAmount":
        return formatMoney(v);
      case "validFrom":
      case "validTo":
      case "deadlineDate":
        return formatDate(v);
      default:
        return v;
    }
  };

  const basedOn = () => {
    const id = detail()?.id;
    return id ? readStub<BasedOn>(ws.wsId(), "based-on", {})[id] : undefined;
  };

  const save = async (draftWarnings: { inn: string; limit: string }) => {
    const errs = validateDraft(draft);
    setErrors(errs);
    if (Object.keys(errs).length) {
      goTab("data");
      toast("Проверьте выделенные поля.");
      return;
    }
    const warn = [draftWarnings.inn, draftWarnings.limit].filter(Boolean);
    if (warn.length) {
      const ok = await confirmDialog({
        title: "Сохранить всё равно?",
        text: warn.join(" · "),
        confirmLabel: "Сохранить",
      });
      if (!ok) return;
    }
    setBusy(true);
    const before = original();
    const snapshot = clone(draft);
    try {
      const result = await saveApplication({
        wsId: ws.wsId(),
        draft: snapshot,
        original: before,
        detail: detail() ?? null,
        progress,
      });
      invalidateApplication(qc, ws.wsId(), result.id);
      if (isNew()) {
        const source = sourceQ.data;
        if (source) {
          updateStub<BasedOn>(ws.wsId(), "based-on", {}, (m) => ({
            ...m,
            [result.id]: { id: source.id, label: appLabel({ ...source, client_name: source.client.name }) },
          }));
        }
        logAppActivity(ws.wsId(), { ...result, client_name: result.client.name }, ws.me(), [
          source ? `Заявка создана на основе заявки № ${applicationNumber(source)}` : "Заявка создана",
        ]);
        progress = {};
        setInitKey(`edit:${result.id}`);
        // Черновик берём из ответа: сервер мог присвоить номер (Z-07) и нормализовать поля.
        const next = detailToDraft(result, snapshot.primaryBankId || null);
        setDraft(reconcile(next));
        setOriginal({ ...next });
        toast("Заявка создана.");
        navigate(`/w/${ws.wsId()}/board/${result.id}?tab=data`, { replace: true });
      } else {
        const changes = before ? diffDrafts(before, snapshot, displayValue) : [];
        logAppActivity(
          ws.wsId(),
          { ...result, client_name: result.client.name },
          ws.me(),
          changes.map((c) => `${c.label}: ${c.from} → ${c.to}`),
        );
        const next = detailToDraft(result, snapshot.primaryBankId || null);
        setDraft(reconcile(next));
        setOriginal({ ...next });
        toast("Заявка сохранена.");
      }
    } catch (e) {
      const fe = fieldErrors(e);
      const mapped: DraftErrors = {};
      for (const [k, v] of Object.entries(fe)) if (API_FIELD[k]) mapped[API_FIELD[k]!] = v;
      if (Object.keys(mapped).length) {
        setErrors(mapped);
        goTab("data");
      }
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const repeat = async () => {
    if (dirty() && !(await beforeClose())) return;
    setInitKey(null);
    navigate(`/w/${ws.wsId()}/board/new?tab=data&from=${detail()!.id}`);
    toast(
      `Создана копия заявки № ${applicationNumber(detail()!)}. Проверьте поля и нажмите «Создать заявку».`,
    );
  };

  const saveTemplate = async () => {
    const name = await promptDialog({
      title: "Сохранить как шаблон",
      label: "Название шаблона",
      initial: `${LAW_KIND_LABELS[draft.law]}${draft.law !== "vat" ? " · " + GUARANTEE_TYPE_LABELS[draft.guaranteeType] : ""}`,
      maxLength: 60,
    });
    if (!name) return;
    const days = draft.validFrom && draft.validTo ? periodDays(draft.validFrom, draft.validTo) : null;
    templateOps.create.mutate(
      {
        name,
        fields: {
          law: draft.law,
          guaranteeType: draft.guaranteeType,
          primaryBankId: draft.primaryBankId || undefined,
          requestedAmount: draft.requestedAmount || undefined,
          deadlineTime: draft.deadlineTime,
          validDays: days ?? undefined,
        },
      },
      { onSuccess: () => toast("Шаблон сохранён.") },
    );
  };

  const ctx: ApplicationCtx = {
    isNew,
    detail,
    draft,
    setDraft,
    errors,
    readOnly,
    banks: () => banksQ.data ?? [],
    bankName: (id) => bankName(banksQ.data, id),
    prefill,
    setPrefill,
    pickPrimaryBank: (bankId) => {
      const id = detail()?.id;
      if (!id) return;
      void setPrimaryBank(ws.wsId(), id, bankId); // STUB Z-08
      setDraft("primaryBankId", bankId);
      const o = original();
      if (o) setOriginal({ ...o, primaryBankId: bankId });
      logAppActivity(ws.wsId(), { ...detail()!, client_name: detail()!.client.name }, ws.me(), [
        `Выбрано предложение банка ${bankName(banksQ.data, bankId)}`,
      ]);
    },
    goTab,
  };

  const title = () =>
    isNew() ? "Новая заявка" : detail() ? `Заявка № ${applicationNumber(detail()!)}` : "Заявка";
  const notFound = () =>
    !isNew() && detailQ.isError && isApiError(detailQ.error) && detailQ.error.status === 404;

  return (
    <ApplicationContext.Provider value={ctx}>
      <Dialog
        open
        onOpenChange={(o) => !o && close()}
        beforeClose={beforeClose}
        width={960}
        fullscreenOnMobile
        title={
          <span class="flex flex-wrap items-center gap-2">
            {title()}
            <Show when={detail()}>
              {(d) => (
                <Pill tone={d().status === "issued" ? "green" : d().status === "archived" ? "gray" : "blue"}>
                  {STATUS_LABELS[d().status]}
                </Pill>
              )}
            </Show>
          </span>
        }
        description={
          <>
            Переключайтесь между данными заявки, выдачей и обсуждениями с банками.
            <Show
              when={
                basedOn() ??
                (isNew() && sourceQ.data
                  ? {
                      id: sourceQ.data.id,
                      label: appLabel({ ...sourceQ.data, client_name: sourceQ.data.client.name }),
                    }
                  : undefined)
              }
            >
              {(b) => (
                <span class="mt-1 block">
                  Создана на основе заявки{" "}
                  <A href={`/w/${ws.wsId()}/board/${b().id}?tab=data`} class="text-accent">
                    {b().label}
                  </A>
                </span>
              )}
            </Show>
          </>
        }
      >
        <Switch>
          <Match when={notFound()}>
            <div class="py-6 text-center text-sm">
              <p class="mb-4 text-muted">Заявка не найдена или была удалена.</p>
              <A href={backHref()} class="btn btn-primary no-underline">
                Вернуться к доске
              </A>
            </div>
          </Match>
          <Match when={!isNew() && detailQ.isError}>
            <div class="py-6 text-center text-sm">
              <p class="mb-4 text-muted">{errorMessage(detailQ.error)}</p>
              <Button onClick={() => void detailQ.refetch()}>Повторить</Button>
            </div>
          </Match>
          <Match when={!initKey()}>
            <div class="flex items-center gap-3 py-10 text-sm text-muted">
              <Spinner /> Загружаем заявку…
            </div>
          </Match>
          <Match when={initKey()}>
            <ApplicationBody
              tab={tab()}
              goTab={goTab}
              busy={busy()}
              dirty={dirty()}
              onSave={(w) => void save(w)}
              onCancel={() => void beforeClose().then((ok) => ok && close())}
              onRepeat={() => void repeat()}
              onSaveTemplate={() => void saveTemplate()}
              onReopen={() => setReopenOpen(true)}
            />
          </Match>
        </Switch>
      </Dialog>
      <ReopenDialog
        app={reopenOpen() && detail() ? detail()! : null}
        busy={transition.isPending}
        onCancel={() => setReopenOpen(false)}
        onConfirm={(comment) =>
          transition.mutate(
            { id: detail()!.id, to: "in_progress", comment },
            {
              onSuccess: () => {
                setReopenOpen(false);
                logAppActivity(ws.wsId(), { ...detail()!, client_name: detail()!.client.name }, ws.me(), [
                  "Статус: Архив → В работе",
                ]);
                toast("Заявка возвращена в работу.");
              },
              onError: (e) => toast(errorMessage(e)),
            },
          )
        }
      />
    </ApplicationContext.Provider>
  );
}

function ApplicationBody(props: {
  tab: TabId;
  goTab: (t: TabId) => void;
  busy: boolean;
  dirty: boolean;
  onSave: (warnings: { inn: string; limit: string }) => void;
  onCancel: () => void;
  onRepeat: () => void;
  onSaveTemplate: () => void;
  onReopen: () => void;
}) {
  const ws = useWorkspace();
  const app = useApp();
  const warnings = useDraftWarnings();
  const canEdit = () => ws.can("application.edit");
  const archived = () => app.detail()?.status === "archived";

  return (
    <>
      <Tabs value={props.tab} onChange={(v) => props.goTab(v as TabId)}>
        <Tabs.List
          class="mt-0 mb-[17px] flex w-fit max-w-full gap-1.5 overflow-x-auto rounded-[11px] border border-line bg-surface-3 p-[5px] max-xs:w-full"
          aria-label="Разделы заявки"
        >
          {TABS.map((t) => (
            <Tabs.Trigger
              value={t.id}
              disabled={app.isNew() && t.id !== "data"}
              class="rounded-lg border border-transparent bg-transparent px-[13px] py-[9px] text-xs font-[650] whitespace-nowrap text-muted hover:border-[#e2e7ef] hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 data-[selected]:border-[#e0e6f0] data-[selected]:bg-white data-[selected]:text-accent data-[selected]:shadow-[0_1px_3px_#1822300a] max-xs:flex-1 max-xs:whitespace-normal"
            >
              {t.label}
              {t.id === "banks" && app.detail()?.bank_requests.length
                ? ` (${app.detail()!.bank_requests.length})`
                : ""}
              {t.id === "issuance" && app.detail()?.guarantees.length
                ? ` (${app.detail()!.guarantees.length})`
                : ""}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Show when={app.isNew()}>
          <p class="-mt-[7px] mb-3.5 text-[11px] text-muted">
            Выдача, банки, вложения и история станут доступны после создания заявки.
          </p>
        </Show>
        <Show when={archived()}>
          <p class="-mt-[7px] mb-3.5 text-[11px] text-muted">
            Заявка в архиве и открыта только для чтения. Верните её в работу, чтобы изменить.
          </p>
        </Show>
        <Tabs.Content value="data">
          <DataTab />
        </Tabs.Content>
        <Tabs.Content value="issuance">
          <Show when={app.detail()}>
            <IssuanceTab />
          </Show>
        </Tabs.Content>
        <Tabs.Content value="banks">
          <Show when={app.detail()}>
            <BanksTab />
          </Show>
        </Tabs.Content>
        <Tabs.Content value="files">
          <Show when={app.detail()}>
            <FilesTab />
          </Show>
        </Tabs.Content>
        <Tabs.Content value="history">
          <Show when={app.detail()}>
            <HistoryTab />
          </Show>
        </Tabs.Content>
      </Tabs>

      <div class="mt-[21px] flex flex-wrap items-center justify-end gap-2 border-t border-line pt-[15px]">
        <Show
          when={props.tab === "data" && !archived() && canEdit()}
          fallback={
            <>
              <Show when={archived() && canEdit()}>
                <Button class="mr-auto" onClick={() => props.onReopen()}>
                  Вернуть в работу
                </Button>
              </Show>
              <Button onClick={() => props.onCancel()}>Закрыть</Button>
            </>
          }
        >
          <Show when={!app.isNew()}>
            <Button onClick={() => props.onRepeat()}>Повторить заявку</Button>
          </Show>
          <Show when={env.useStubs}>
            <Button onClick={() => props.onSaveTemplate()}>Сохранить как шаблон</Button>
          </Show>
          <span class="flex-1" />
          <Button onClick={() => props.onCancel()}>Отмена</Button>
          <Button
            variant="primary"
            loading={props.busy}
            disabled={!app.isNew() && !props.dirty}
            onClick={() => props.onSave(warnings())}
          >
            {app.isNew() ? "Создать заявку" : "Сохранить изменения"}
          </Button>
        </Show>
      </div>
    </>
  );
}
