import { Plus, Trash2 } from "lucide-solid";
import { For, Show, createEffect, createMemo, createSignal, on, untrack } from "solid-js";
import { createStore } from "solid-js/store";
import { errorMessage } from "@/api/errors";
import {
  bankRequestPayload,
  useBankRequestMutations,
  useCommentMutations,
  useComments,
  useOffers,
  useSaveOffer,
} from "@/api/queries/bank-requests";
import { findMentions, notifyMentions } from "@/api/stubs/collab";
import type { BankOffer } from "@/api/stubs/extras";
import { useWorkspace } from "@/app/workspace";
import { formatStamp, parseDate } from "@/domain/dates";
import { parseMoney } from "@/domain/money";
import { type BankRequest, type BankRequestPayload, applicationNumber } from "@/domain/types";
import { env } from "@/env";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/Button";
import { confirmDialog, promptDialog } from "@/shared/ui/Dialog";
import { EmptyState, Pill, initials } from "@/shared/ui/display";
import { Field, Input, MoneyInput, SegmentedControl, Select, Textarea } from "@/shared/ui/form";
import { toast } from "@/shared/ui/Toast";
import { logAppActivity } from "./activity";
import { useApp } from "./context";
import { useLimitWarning } from "./DataTab";

type BankState = "wait" | "ok" | "no";
const STATE_LABEL: Record<BankState, string> = { wait: "Рассматривает", ok: "Одобрено", no: "Отказ" };

/** Маппинг переключателя статуса на поля запроса (ТЗ 5.4). */
export function bankStateOf(br: Pick<BankRequest, "offer_received" | "sent_at">): BankState | null {
  if (br.offer_received === true) return "ok";
  if (br.offer_received === false) return "no";
  if (br.sent_at) return "wait";
  return null;
}

export function applyBankState(
  br: BankRequest,
  state: BankState | null,
  now = new Date().toISOString(),
): BankRequestPayload {
  const base = bankRequestPayload(br);
  switch (state) {
    case "wait":
      return {
        ...base,
        sent_at: br.sent_at ?? now,
        decision_at: null,
        offer_received: null,
        rejection_reason: null,
      };
    case "ok":
      return {
        ...base,
        sent_at: br.sent_at ?? now,
        decision_at: br.decision_at ?? now,
        offer_received: true,
        rejection_reason: null,
      };
    case "no":
      return {
        ...base,
        sent_at: br.sent_at ?? now,
        decision_at: br.decision_at ?? now,
        offer_received: false,
      };
    default:
      return { ...base, sent_at: null, decision_at: null, offer_received: null, rejection_reason: null };
  }
}

const dateOnly = (iso: string | null | undefined) =>
  iso ? (parseDate(iso)?.toISOString().slice(0, 10) ?? "") : "";
const toIso = (date: string) => (date ? new Date(`${date}T12:00:00`).toISOString() : null);

export function BanksTab() {
  const ws = useWorkspace();
  const app = useApp();
  const detail = () => app.detail()!;
  const ops = useBankRequestMutations(ws.wsId, () => detail().id);
  const offers = useOffers(ws.wsId);
  const [newBank, setNewBank] = createSignal("");

  const available = () =>
    app
      .banks()
      .filter((b) => b.is_active && !detail().bank_requests.some((r) => r.bank_id === b.id))
      .map((b) => ({ value: b.id, label: b.name }));

  const add = () => {
    const bankId = newBank();
    if (!bankId) return;
    ops.create.mutate(bankId, {
      onSuccess: () => {
        setNewBank("");
        logAppActivity(ws.wsId(), detail(), ws.me(), [`Добавлен запрос в банк ${app.bankName(bankId)}`]);
      },
      onError: (e) => toast(errorMessage(e)),
    });
  };

  return (
    <div>
      <h3 class="m-0 mb-[5px] text-sm font-bold">Обсуждения по банкам</h3>
      <p class="m-0 mb-3 text-[11px] text-muted">
        Запросы в банки по заявке: статус рассмотрения, предложение и комментарии с автором и временем.
      </p>
      <Show when={env.useStubs}>
        <OffersTable offers={offers.data ?? {}} />
      </Show>
      <For
        each={detail().bank_requests}
        fallback={
          <EmptyState
            title="Запросов в банки пока нет"
            text="Добавьте банк, чтобы вести переписку и статус рассмотрения."
          />
        }
      >
        {(br) => <BankRequestCard br={br} offer={offers.data?.[br.id]} ops={ops} />}
      </For>
      <Show when={!app.readOnly() && ws.can("application.edit")}>
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <Select
            value={newBank()}
            options={available()}
            placeholder={available().length ? "Выберите банк" : "Все активные банки уже добавлены"}
            onValue={setNewBank}
            class="!max-w-[320px]"
            aria-label="Банк для нового запроса"
          />
          <Button onClick={add} disabled={!newBank()} loading={ops.create.isPending}>
            <Plus size={15} /> Добавить банк
          </Button>
        </div>
      </Show>
    </div>
  );
}

/** Сравнение предложений банков (STUB Z-04): лучшие значения подсвечены. */
function OffersTable(props: { offers: Record<string, BankOffer> }) {
  const app = useApp();
  const limit = useLimitWarning();
  const rows = createMemo(() =>
    app
      .detail()!
      .bank_requests.map((br) => ({ br, o: props.offers[br.id] }))
      .filter(
        (x): x is { br: BankRequest; o: BankOffer } =>
          !!x.o && (+x.o.rate > 0 || +x.o.fee > 0 || +x.o.days > 0),
      ),
  );
  const best = (k: "rate" | "fee" | "days") => {
    const v = rows()
      .map((r) => +r.o[k])
      .filter((x) => x > 0);
    return v.length > 1 ? Math.min(...v) : null;
  };
  const cell = (o: BankOffer, k: "rate" | "fee" | "days") => (
    <td
      class={cn(
        "border-b border-line p-2 align-top",
        +o[k] > 0 && +o[k] === best(k) && "bg-[#effaf4] font-extrabold text-[#1d7a56]",
      )}
    >
      {+o[k] > 0 ? o[k] : "—"}
    </td>
  );
  return (
    <Show when={rows().length}>
      <div class="mb-4">
        <h3 class="m-0 mb-[5px] text-sm font-bold">Сравнение предложений</h3>
        <p class="m-0 mb-3 text-[11px] text-muted">
          Лучшие значения выделены. «Выбрать» поставит банк заведения и подставит комиссию в форму выдачи.
        </p>
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-xs">
            <thead>
              <tr class="text-left text-[11px] text-[#7a8597]">
                <th class="border-b border-line px-2 py-1.5">Банк</th>
                <th class="border-b border-line px-2 py-1.5">Ставка, %</th>
                <th class="border-b border-line px-2 py-1.5">Комиссия, ₽</th>
                <th class="border-b border-line px-2 py-1.5">Срок, дн.</th>
                <th class="border-b border-line px-2 py-1.5">Условия</th>
                <th class="border-b border-line px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              <For each={rows()}>
                {(r) => (
                  <tr>
                    <td class="border-b border-line p-2 align-top">
                      <strong>{app.bankName(r.br.bank_id)}</strong>
                      <Show when={limit(r.br.bank_id, app.draft.requestedAmount)}>
                        {(m) => <div class="text-[11px] text-[#c0362c]">{m()}</div>}
                      </Show>
                    </td>
                    {cell(r.o, "rate")}
                    {cell(r.o, "fee")}
                    {cell(r.o, "days")}
                    <td class="border-b border-line p-2 align-top">{r.o.cond || "—"}</td>
                    <td class="border-b border-line p-2 align-top">
                      <Show when={!app.readOnly()}>
                        <Button
                          size="sm"
                          onClick={() => {
                            app.pickPrimaryBank(r.br.bank_id);
                            app.setPrefill({ bankId: r.br.bank_id, commission: parseMoney(r.o.fee) ?? null });
                            toast(
                              `Выбран банк ${app.bankName(r.br.bank_id)}: банк заведения и комиссия подставлены.`,
                            );
                          }}
                        >
                          Выбрать
                        </Button>
                      </Show>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </div>
    </Show>
  );
}

function BankRequestCard(props: {
  br: BankRequest;
  offer: BankOffer | undefined;
  ops: ReturnType<typeof useBankRequestMutations>;
}) {
  const ws = useWorkspace();
  const app = useApp();
  const detail = () => app.detail()!;
  const comments = useComments(ws.wsId, () => detail().id);
  const commentOps = useCommentMutations(ws.wsId);
  const saveOffer = useSaveOffer(ws.wsId);
  const ro = () => app.readOnly() || !ws.can("application.edit");
  const list = () => (comments.data ?? []).filter((c) => c.bankRequestId === props.br.id);
  const state = () => bankStateOf(props.br);
  const hasGuarantee = () => detail().guarantees.some((g) => g.bank_request_id === props.br.id);

  // Форма — снимок запроса на момент открытия; после сохранения обновляется из ответа.
  const [form, setForm] = createStore(
    untrack(() => ({
      external_number: props.br.external_number ?? "",
      requested_amount: props.br.requested_amount ?? "",
      sent_at: dateOnly(props.br.sent_at),
      decision_at: dateOnly(props.br.decision_at),
      rejection_reason: props.br.rejection_reason ?? "",
      notes: props.br.notes ?? "",
    })),
  );
  const [offer, setOffer] = createStore<BankOffer>({
    rate: "",
    fee: "",
    days: "",
    cond: "",
    ...untrack(() => props.offer),
  });
  // Предложение (Z-04) может подгрузиться позже карточки.
  createEffect(
    on(
      () => props.offer,
      (o) => o && setOffer({ ...o }),
      { defer: true },
    ),
  );
  const [text, setText] = createSignal("");

  const setState = (next: BankState | null) => {
    props.ops.update.mutate(
      { id: props.br.id, body: applyBankState(props.br, next) },
      {
        onSuccess: (br) => {
          setForm({ sent_at: dateOnly(br.sent_at), decision_at: dateOnly(br.decision_at) });
          logAppActivity(ws.wsId(), detail(), ws.me(), [
            `Статус банка ${app.bankName(props.br.bank_id)}: ${next ? STATE_LABEL[next] : "сброшен"}`,
          ]);
        },
        onError: (e) => toast(errorMessage(e)),
      },
    );
  };

  const saveDetails = () => {
    const amount = parseMoney(form.requested_amount);
    if (amount === undefined) return toast("Некорректная сумма запроса.");
    props.ops.update.mutate(
      {
        id: props.br.id,
        body: {
          ...bankRequestPayload(props.br),
          external_number: form.external_number.trim() || null,
          requested_amount: amount,
          sent_at: toIso(form.sent_at),
          decision_at: toIso(form.decision_at),
          rejection_reason: form.rejection_reason.trim() || null,
          notes: form.notes.trim() || null,
        },
      },
      { onSuccess: () => toast("Параметры запроса сохранены."), onError: (e) => toast(errorMessage(e)) },
    );
    if (env.useStubs) saveOffer.mutate({ bankRequestId: props.br.id, offer: { ...offer } });
  };

  const remove = async () => {
    if (hasGuarantee())
      return toast("По этому банку уже оформлена выдача — сначала удалите данные о выдаче.");
    const ok = await confirmDialog({
      title: "Удалить запрос в банк?",
      text: `Запрос в ${app.bankName(props.br.bank_id)} и его статус будут удалены.`,
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!ok) return;
    props.ops.remove.mutate(props.br.id, {
      onSuccess: () =>
        logAppActivity(ws.wsId(), detail(), ws.me(), [
          `Удалён запрос в банк ${app.bankName(props.br.bank_id)}`,
        ]),
      onError: (e) => toast(errorMessage(e)),
    });
  };

  const others = () => ws.members().filter((m) => m.user_id !== ws.me().id);
  const sendComment = () => {
    const t = text().trim();
    if (!t) return toast("Введите текст комментария.");
    commentOps.add.mutate(
      { applicationId: detail().id, bankRequestId: props.br.id, text: t, author: ws.me() },
      {
        onSuccess: () => {
          setText("");
          const mentioned = findMentions(
            t,
            others().map((m) => ({ id: m.user_id, name: m.name })),
          );
          notifyMentions(ws.wsId(), {
            text: t,
            recipients: mentioned,
            applicationId: detail().id,
            appTitle: `№ ${applicationNumber(detail())} · ${detail().client.name}`,
            byName: ws.me().name,
          });
          if (mentioned.length) toast(`Уведомление отправлено: ${mentioned.map((m) => m.name).join(", ")}`);
        },
      },
    );
  };

  const editComment = async (id: string, current: string) => {
    const next = await promptDialog({
      title: "Редактировать комментарий",
      label: "Текст",
      initial: current,
      maxLength: 5000,
    });
    if (next && next !== current) commentOps.edit.mutate({ id, text: next, editor: ws.me() });
  };

  /** Упоминания @Имя рендерятся компонентами, без innerHTML. */
  const renderText = (t: string) => {
    const names = ws
      .members()
      .map((m) => m.name)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    if (!names.length) return t;
    const re = new RegExp(
      `(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`,
      "g",
    );
    return t
      .split(re)
      .map((part) =>
        part.startsWith("@") && names.includes(part.slice(1)) ? (
          <span class="rounded bg-[#eaf0ff] px-[3px] font-[650] text-[#2f56c4]">{part}</span>
        ) : (
          part
        ),
      );
  };

  return (
    <div class="my-2.5 overflow-hidden rounded-xl border border-line bg-white">
      <div class="flex flex-wrap items-center justify-between gap-2.5 border-b border-line bg-[#fafbfc] px-[13px] py-2.5">
        <div class="flex items-center gap-2 text-xs font-[750]">
          <span class="size-[9px] rounded-full bg-[#7890c8] shadow-[0_0_0_3px_#7890c820]" />
          {app.bankName(props.br.bank_id)}
          <Show when={hasGuarantee()}>
            <Pill tone="green">выдана</Pill>
          </Show>
        </div>
        <SegmentedControl
          label={`Статус банка ${app.bankName(props.br.bank_id)}`}
          value={state()}
          allowReset
          disabled={ro() || props.ops.update.isPending}
          onChange={setState}
          class="ml-auto"
          options={[
            { value: "wait", label: STATE_LABEL.wait },
            { value: "ok", label: STATE_LABEL.ok, tone: "ok" },
            { value: "no", label: STATE_LABEL.no, tone: "no" },
          ]}
        />
        <Show when={env.useStubs}>
          <span class="text-[11px] text-muted">
            {list().length} {list().length === 1 ? "комментарий" : "комментариев"}
          </span>
        </Show>
      </div>
      <div class="px-[13px] py-3">
        <details
          class="mb-3 rounded-[10px] border border-line bg-[#fbfcfe] px-[11px] py-2"
          open={state() === "no" || !!props.offer}
        >
          <summary class="cursor-pointer text-xs font-bold text-[#3a579d]">
            Параметры запроса{env.useStubs ? " и предложение банка" : ""}
          </summary>
          <div class="mt-2.5 grid grid-cols-3 gap-[13px] max-sm:grid-cols-1">
            <Field label="Номер в банке">
              {(id) => (
                <Input
                  id={id}
                  value={form.external_number}
                  disabled={ro()}
                  onValue={(v) => setForm("external_number", v)}
                />
              )}
            </Field>
            <Field label="Запрошенная сумма">
              {(id) => (
                <MoneyInput
                  id={id}
                  value={form.requested_amount}
                  disabled={ro()}
                  onValue={(v) => setForm("requested_amount", v)}
                />
              )}
            </Field>
            <Field label="Отправлено в банк">
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  value={form.sent_at}
                  disabled={ro()}
                  onValue={(v) => setForm("sent_at", v)}
                />
              )}
            </Field>
            <Field label="Дата решения">
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  value={form.decision_at}
                  disabled={ro()}
                  onValue={(v) => setForm("decision_at", v)}
                />
              )}
            </Field>
            <Show when={state() === "no"}>
              <Field label="Причина отказа" class="col-span-2 max-sm:col-span-1">
                {(id) => (
                  <Input
                    id={id}
                    value={form.rejection_reason}
                    disabled={ro()}
                    onValue={(v) => setForm("rejection_reason", v)}
                  />
                )}
              </Field>
            </Show>
          </div>
          <Show when={env.useStubs}>
            <div class="mt-3 grid grid-cols-3 gap-[13px] max-sm:grid-cols-1">
              <Field label="Ставка, % годовых">
                {(id) => (
                  <Input
                    id={id}
                    inputmode="decimal"
                    value={offer.rate}
                    disabled={ro()}
                    onValue={(v) => setOffer("rate", v.replace(",", "."))}
                  />
                )}
              </Field>
              <Field label="Комиссия, ₽">
                {(id) => (
                  <MoneyInput id={id} value={offer.fee} disabled={ro()} onValue={(v) => setOffer("fee", v)} />
                )}
              </Field>
              <Field label="Срок рассмотрения, дн.">
                {(id) => (
                  <Input
                    id={id}
                    inputmode="numeric"
                    value={offer.days}
                    disabled={ro()}
                    onValue={(v) => setOffer("days", v.replace(/\D/g, ""))}
                  />
                )}
              </Field>
            </div>
            <Field label="Условия" class="mt-2.5">
              {(id) => (
                <Input
                  id={id}
                  value={offer.cond}
                  disabled={ro()}
                  placeholder="Обеспечение, требования, нюансы"
                  onValue={(v) => setOffer("cond", v)}
                />
              )}
            </Field>
          </Show>
          <Field label="Заметки" class="mt-2.5">
            {(id) => (
              <Textarea
                id={id}
                rows={2}
                value={form.notes}
                disabled={ro()}
                onValue={(v) => setForm("notes", v)}
              />
            )}
          </Field>
          <Show when={!ro()}>
            <div class="mt-2.5 flex flex-wrap gap-2">
              <Button size="sm" variant="primary" loading={props.ops.update.isPending} onClick={saveDetails}>
                Сохранить параметры
              </Button>
              <Show when={ws.can("bankRequest.delete")}>
                <Button size="sm" variant="danger" onClick={() => void remove()}>
                  <Trash2 size={14} /> Удалить запрос
                </Button>
              </Show>
            </div>
          </Show>
        </details>

        <Show
          when={env.useStubs}
          fallback={<p class="text-[11px] text-muted">Комментарии по банкам — скоро.</p>}
        >
          <div class="grid gap-3">
            <For
              each={list()}
              fallback={
                <div class="py-1 text-[11px] text-faint">
                  Пока нет комментариев. Добавьте первое обновление по заявке в этом банке.
                </div>
              }
            >
              {(c) => (
                <div class="grid grid-cols-[30px_minmax(0,1fr)] gap-[9px]">
                  <div class="grid size-[30px] place-items-center rounded-full bg-[#edf1fb] text-[10px] font-extrabold text-[#3a579d]">
                    {initials(c.authorName)}
                  </div>
                  <div class="min-w-0">
                    <div class="mb-[3px] flex flex-wrap items-center gap-[7px]">
                      <span class="text-[11px] font-[750]">{c.authorName}</span>
                      <span class="text-[10px] text-[#8a94a5]">
                        {formatStamp(c.createdAt)}
                        {c.editedAt
                          ? ` · изменён ${formatStamp(c.editedAt)}${c.editedByName ? " · " + c.editedByName : ""}`
                          : ""}
                      </span>
                    </div>
                    <div class="text-xs leading-normal [overflow-wrap:anywhere] whitespace-pre-wrap">
                      {renderText(c.text)}
                    </div>
                    <Show when={!ro()}>
                      <button
                        type="button"
                        class="mt-1 border-0 bg-transparent px-[5px] py-0.5 text-[10px] text-accent"
                        onClick={() => void editComment(c.id, c.text)}
                      >
                        Редактировать
                      </button>
                    </Show>
                  </div>
                </div>
              )}
            </For>
          </div>
          <Show when={!ro()}>
            <div class="mt-[13px] flex items-start gap-2 max-sm:grid max-sm:grid-cols-1">
              <Textarea
                rows={2}
                class="min-h-[55px] flex-1 !text-xs"
                placeholder="Напишите обновление по банку…"
                aria-label={`Комментарий для ${app.bankName(props.br.bank_id)}`}
                value={text()}
                onValue={setText}
              />
              <Button
                variant="primary"
                size="sm"
                class="max-sm:justify-self-start"
                loading={commentOps.add.isPending}
                onClick={sendComment}
              >
                Добавить
              </Button>
            </div>
            <Show when={others().length}>
              <div class="mt-[7px] flex flex-wrap items-center gap-1.5">
                <span class="text-[11px] text-muted">Упомянуть:</span>
                <For each={others()}>
                  {(m) => (
                    <button
                      type="button"
                      class="rounded-full border border-line bg-white px-[11px] py-1 text-xs font-[650] text-fg-2 hover:border-accent-line"
                      onClick={() => setText((t) => `${t}${t && !/\s$/.test(t) ? " " : ""}@${m.name} `)}
                    >
                      @{m.name}
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </Show>
      </div>
    </div>
  );
}
