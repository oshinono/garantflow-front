import { Paperclip, Plus, Trash2 } from "lucide-solid";
import { For, Show, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { errorMessage } from "@/api/errors";
import { createBankRequest, useGuaranteeMutations } from "@/api/queries/bank-requests";
import { useFileMutations, useFiles } from "@/api/queries/stubs";
import { useWorkspace } from "@/app/workspace";
import { commissionPayload, displayedCommission } from "@/domain/commission";
import { periodDays } from "@/domain/dates";
import { parseMoney } from "@/domain/money";
import type { Guarantee, GuaranteePayload } from "@/domain/types";
import { lawKindOf } from "@/domain/types";
import { env } from "@/env";
import { Button } from "@/shared/ui/Button";
import { confirmDialog } from "@/shared/ui/Dialog";
import { Notice } from "@/shared/ui/display";
import { Field, Input, MoneyInput, SegmentedControl, Select, Textarea } from "@/shared/ui/form";
import { toast } from "@/shared/ui/Toast";
import { logAppActivity } from "./activity";
import { useApp } from "./context";

type Form = {
  key: string;
  id: string | null;
  bankId: string;
  number: string;
  issuedAt: string;
  amount: string;
  validFrom: string;
  validTo: string;
  commission: string;
  rate: string;
  kvAmount: string;
  manual: boolean;
  notes: string;
};

const blank = (prefill?: { bankId: string; commission: string | null } | null): Form => ({
  key: Math.random().toString(36).slice(2),
  id: null,
  bankId: prefill?.bankId ?? "",
  number: "",
  issuedAt: "",
  amount: "",
  validFrom: "",
  validTo: "",
  commission: prefill?.commission ?? "",
  rate: "",
  kvAmount: "",
  manual: false,
  notes: "",
});

const fromGuarantee = (g: Guarantee): Form => ({
  key: g.id,
  id: g.id,
  bankId: g.bank_id,
  number: g.guarantee_number ?? "",
  issuedAt: g.issued_at,
  amount: g.amount,
  validFrom: g.valid_from ?? "",
  validTo: g.valid_to ?? "",
  commission: g.bank_commission_amount ?? "",
  rate: g.agent_commission_rate ?? "",
  kvAmount: g.agent_commission_amount ?? "",
  manual: g.agent_commission_is_manual,
  notes: g.notes ?? "",
});

/** Вкладка «Выдача»: гарантии с расчётом КВ (prototype: issuancePanel). */
export function IssuanceTab() {
  const app = useApp();
  const detail = () => app.detail()!;
  const multi = () => detail().guarantee_type === "advance" && lawKindOf(detail()) === "commercial";
  const saved = () => detail().guarantees;
  const [drafts, setDrafts] = createSignal<Form[]>(saved().length ? [] : [blank(app.prefill())]);

  return (
    <div>
      <h3 class="m-0 mb-[5px] text-sm font-bold">Данные о выдаче</h3>
      <p class="m-0 mb-3 text-[11px] text-muted">
        Для учёта в отчётах укажите банк и фактическую дату выдачи.
        <Show when={detail().status === "in_progress"}>
          {" "}
          После сохранения первой гарантии заявка перейдёт в «Выданные».
        </Show>
      </p>
      <For each={saved()}>{(g, i) => <GuaranteeForm initial={fromGuarantee(g)} index={i() + 1} />}</For>
      <For each={drafts()}>
        {(f, i) => (
          <GuaranteeForm
            initial={f}
            index={saved().length + i() + 1}
            onSaved={() => setDrafts(drafts().filter((x) => x.key !== f.key))}
            onDiscard={
              saved().length || i() > 0 ? () => setDrafts(drafts().filter((x) => x.key !== f.key)) : undefined
            }
          />
        )}
      </For>
      <Show when={multi() && !app.readOnly() && saved().length > 0 && drafts().length === 0}>
        <Button onClick={() => setDrafts([...drafts(), blank()])}>
          <Plus size={15} /> Ещё БГ по этой заявке
        </Button>
      </Show>
      <Notice>
        <strong>КВ</strong> — комиссионное вознаграждение агента: доля комиссии, которую клиент платит банку,
        остаётся агенту. Поле, которое считается само, помечено «авто» и недоступно для ввода; переключатель
        выбирает, что вводить вручную. В отчёты и сверку попадают только записи с заполненными банком и датой
        выдачи.
      </Notice>
    </div>
  );
}

function GuaranteeForm(props: {
  initial: Form;
  index: number;
  onSaved?: () => void;
  onDiscard?: () => void;
}) {
  const ws = useWorkspace();
  const app = useApp();
  const detail = () => app.detail()!;
  const { save, remove } = useGuaranteeMutations(ws.wsId, () => detail().id);
  const files = useFiles(ws.wsId, () => detail().id);
  const fileOps = useFileMutations(ws.wsId);
  const [f, setF] = createStore<Form>({ ...props.initial });
  const [errors, setErrors] = createSignal<Partial<Record<keyof Form, string>>>({});
  const [busy, setBusy] = createSignal(false);
  const ro = () => app.readOnly();

  const fields = () => ({
    bank_commission_amount: parseMoney(f.commission) ?? null,
    agent_commission_rate: parseMoney(f.rate) ?? null,
    agent_commission_amount: parseMoney(f.kvAmount) ?? null,
    agent_commission_is_manual: f.manual,
  });
  const shown = () => displayedCommission(fields());
  const scans = () => (files.data ?? []).filter((x) => f.id && x.guaranteeId === f.id);

  const bankOptions = () =>
    app
      .banks()
      .filter((b) => b.is_active || b.id === f.bankId)
      .map((b) => ({
        value: b.id,
        label: detail().bank_requests.some((r) => r.bank_id === b.id) ? b.name : `${b.name} (новый запрос)`,
      }));

  const validate = () => {
    const e: Partial<Record<keyof Form, string>> = {};
    if (!f.bankId) e.bankId = "Выберите банк";
    if (!f.issuedAt) e.issuedAt = "Укажите дату выдачи";
    if (!parseMoney(f.amount)) e.amount = "Укажите сумму";
    for (const k of ["commission", "rate", "kvAmount"] as const)
      if (f[k] && parseMoney(f[k]) === undefined) e[k] = "Некорректное число";
    if (f.validFrom && f.validTo && f.validFrom > f.validTo) e.validTo = "Окончание раньше начала";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      // Если запроса в выбранный банк ещё нет — создаём его перед POST /guarantees.
      let br = detail().bank_requests.find((r) => r.bank_id === f.bankId);
      if (!br) {
        br = await createBankRequest(ws.wsId(), detail().id, {
          bank_id: f.bankId,
          sent_at: new Date().toISOString(),
          decision_at: new Date().toISOString(),
          offer_received: true,
        });
      }
      const body: GuaranteePayload = {
        bank_request_id: br.id,
        guarantee_number: f.number.trim() || null,
        issued_at: f.issuedAt,
        amount: parseMoney(f.amount)!,
        valid_from: f.validFrom || null,
        valid_to: f.validTo || null,
        notes: f.notes.trim() || null,
        ...commissionPayload(fields()),
      };
      const wasInProgress = detail().status === "in_progress";
      const g = await save.mutateAsync({ id: f.id, body });
      setF("id", g.id);
      logAppActivity(ws.wsId(), detail(), ws.me(), [
        f.id === props.initial.id && props.initial.id
          ? `Данные о выдаче обновлены (${app.bankName(f.bankId)})`
          : `Внесена выдача: ${app.bankName(f.bankId)}`,
        ...(wasInProgress ? ["Статус: В работе → Выданные"] : []),
      ]);
      toast(
        wasInProgress ? "Гарантия сохранена. Заявка перенесена в «Выданные»." : "Данные о выдаче сохранены.",
      );
      props.onSaved?.();
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    if (!f.id) return props.onDiscard?.();
    const ok = await confirmDialog({
      title: "Удалить данные о выдаче?",
      text: "Гарантия перестанет учитываться в отчётах и сверке.",
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!ok) return;
    remove.mutate(f.id, {
      onSuccess: () =>
        logAppActivity(ws.wsId(), detail(), ws.me(), [`Удалены данные о выдаче (${app.bankName(f.bankId)})`]),
      onError: (e) => toast(errorMessage(e)),
    });
  };

  const autoTag = (
    <em class="ml-1.5 rounded bg-accent-soft px-[5px] py-px align-[1px] text-[10px] font-bold text-accent not-italic">
      авто
    </em>
  );
  const days = () => (f.validFrom && f.validTo ? periodDays(f.validFrom, f.validTo) : null);

  return (
    <div class="my-3 rounded-xl border border-line p-[13px]">
      <div class="mb-3 flex items-center justify-between gap-2">
        <div class="text-xs font-[750]">
          Банковская гарантия {props.index}
          <Show when={!f.id}>
            <span class="ml-2 font-normal text-muted">· не сохранена</span>
          </Show>
        </div>
      </div>
      <div class="grid grid-cols-3 gap-[13px] max-sm:grid-cols-1">
        <Field label="Банк, выдавший БГ" error={errors().bankId}>
          {(id, d) => (
            <Select
              id={id}
              value={f.bankId}
              options={bankOptions()}
              placeholder="Выберите банк"
              disabled={ro()}
              invalid={!!errors().bankId}
              aria-describedby={d}
              onValue={(v) => setF("bankId", v)}
            />
          )}
        </Field>
        <Field label="Номер БГ">
          {(id) => (
            <Input
              id={id}
              maxlength={128}
              value={f.number}
              disabled={ro()}
              onValue={(v) => setF("number", v)}
            />
          )}
        </Field>
        <Field label="Дата фактической выдачи" error={errors().issuedAt}>
          {(id, d) => (
            <Input
              id={id}
              type="date"
              value={f.issuedAt}
              disabled={ro()}
              invalid={!!errors().issuedAt}
              aria-describedby={d}
              onValue={(v) => setF("issuedAt", v)}
            />
          )}
        </Field>
        <Field label="Сумма выданной БГ" error={errors().amount}>
          {(id, d) => (
            <MoneyInput
              id={id}
              value={f.amount}
              disabled={ro()}
              invalid={!!errors().amount}
              aria-describedby={d}
              onValue={(v) => setF("amount", v)}
            />
          )}
        </Field>
        <div class="field">
          <span>Период действия</span>
          <div class="grid grid-cols-2 gap-2">
            <Input
              type="date"
              aria-label="Действует с"
              value={f.validFrom}
              disabled={ro()}
              onValue={(v) => setF("validFrom", v)}
            />
            <Input
              type="date"
              aria-label="Действует по"
              value={f.validTo}
              disabled={ro()}
              invalid={!!errors().validTo}
              onValue={(v) => setF("validTo", v)}
            />
          </div>
          <div class="min-h-3.5 text-[11px] font-medium text-muted">
            {errors().validTo ?? (days() ? `${days()} дн.` : "")}
          </div>
        </div>
        <Field label="Комиссия клиента банку" error={errors().commission}>
          {(id, d) => (
            <MoneyInput
              id={id}
              value={f.commission}
              disabled={ro()}
              aria-describedby={d}
              onValue={(v) => setF("commission", v)}
            />
          )}
        </Field>
        <Field label={<>КВ агента, %{f.manual && autoTag}</>} error={errors().rate}>
          {(id, d) => (
            <Input
              id={id}
              inputmode="decimal"
              value={f.manual ? (shown().rate ?? "") : f.rate}
              readonly={f.manual}
              tabindex={f.manual ? -1 : undefined}
              class={f.manual ? "is-auto" : undefined}
              disabled={ro()}
              aria-describedby={d}
              onValue={(v) => setF("rate", v.replace(",", "."))}
            />
          )}
        </Field>
        <Field label={<>Сумма КВ агента{!f.manual && autoTag}</>} error={errors().kvAmount}>
          {(id, d) =>
            f.manual ? (
              <MoneyInput
                id={id}
                value={f.kvAmount}
                disabled={ro()}
                aria-describedby={d}
                onValue={(v) => setF("kvAmount", v)}
              />
            ) : (
              <Input
                id={id}
                value={shown().amount ?? ""}
                readonly
                tabindex={-1}
                class="is-auto tabular"
                disabled={ro()}
                aria-describedby={d}
              />
            )
          }
        </Field>
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-2.5">
        <span class="text-xs font-semibold text-fg-2">Что вводите вручную</span>
        <SegmentedControl
          label="Что вводите вручную"
          value={f.manual ? "amount" : "rate"}
          disabled={ro()}
          onChange={(v) => {
            const manual = v === "amount";
            if (manual === f.manual) return;
            // При переключении переносим расчётное значение, чтобы не терять данные.
            if (manual) setF({ manual, kvAmount: shown().amount ?? "" });
            else setF({ manual, rate: shown().rate ?? "" });
          }}
          options={[
            { value: "rate", label: "Ставку, %" },
            { value: "amount", label: "Сумму, ₽" },
          ]}
        />
        <span class="text-[11px] text-muted">
          {f.manual ? "Ставка КВ = сумма КВ ÷ комиссия клиента." : "Сумма КВ = комиссия клиента × ставка КВ."}
        </span>
      </div>
      <Field label="Примечание" class="mt-3">
        {(id) => (
          <Textarea
            id={id}
            rows={2}
            maxlength={5000}
            value={f.notes}
            disabled={ro()}
            onValue={(v) => setF("notes", v)}
          />
        )}
      </Field>
      <div class="mt-3 flex flex-wrap items-center gap-3">
        <Show when={env.useStubs}>
          <label
            class="btn btn-sm cursor-pointer"
            classList={{ "pointer-events-none opacity-50": !f.id || ro() }}
            title={f.id ? undefined : "Сначала сохраните гарантию"}
          >
            <Paperclip size={14} /> Скан БГ
            <input
              type="file"
              class="sr-only"
              disabled={!f.id || ro()}
              onChange={(e) => {
                const list = [...(e.currentTarget.files ?? [])];
                if (list.length && f.id)
                  fileOps.add.mutate({
                    applicationId: detail().id,
                    files: list,
                    authorName: ws.me().name,
                    guaranteeId: f.id,
                  });
                e.currentTarget.value = "";
              }}
            />
          </label>
          <For each={scans()}>{(s) => <span class="text-[11px] text-muted">📎 {s.name}</span>}</For>
        </Show>
        <span class="flex-1" />
        <Show when={!ro()}>
          <Show when={(f.id && ws.can("guarantee.delete")) || (!f.id && props.onDiscard)}>
            <Button size="sm" variant="danger" onClick={() => void del()}>
              <Trash2 size={14} /> {f.id ? "Удалить БГ" : "Убрать"}
            </Button>
          </Show>
          <Button size="sm" variant="primary" loading={busy()} onClick={() => void submit()}>
            {f.id ? "Сохранить выдачу" : "Сохранить гарантию"}
          </Button>
        </Show>
      </div>
    </div>
  );
}
