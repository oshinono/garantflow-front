import { Show, createMemo } from "solid-js";
import { useApplications } from "@/api/queries/applications";
import { useBankInfo } from "@/api/queries/banks";
import { useWorkspace } from "@/app/workspace";
import { type DraftField, findDuplicate, isRegistryLaw } from "@/domain/application-form";
import { periodDays } from "@/domain/dates";
import { innProblem } from "@/domain/inn";
import { formatMoney, parseMoney, toBig } from "@/domain/money";
import {
  GUARANTEE_TYPES,
  GUARANTEE_TYPE_LABELS,
  LAW_KINDS,
  LAW_KIND_LABELS,
  applicationNumber,
} from "@/domain/types";
import type { LawKind, ProcurementGuaranteeType } from "@/domain/types";
import { env } from "@/env";
import { Field, Input, MoneyInput, Select, Textarea } from "@/shared/ui/form";
import { ClientCombobox } from "./ClientCombobox";
import { useApp } from "./context";

/** Предупреждение о лимите банка (STUB Z-05). */
export function useLimitWarning() {
  const ws = useWorkspace();
  const info = useBankInfo(ws.wsId);
  return (bankId: string | null | undefined, amount: string | null | undefined): string => {
    if (!bankId || !env.useStubs) return "";
    const n = info.data?.[bankId];
    if (!n) return "";
    const out: string[] = [];
    const sum = parseMoney(amount ?? "");
    if (n.limit && sum && toBig(sum).gt(toBig(n.limit)))
      out.push(`Сумма ${formatMoney(sum)} превышает лимит банка (${formatMoney(n.limit)})`);
    if (n.until && n.until < new Date().toISOString().slice(0, 10)) out.push("срок лимита банка истёк");
    return out.join(" · ");
  };
}

/** Предупреждения формы: контрольная сумма ИНН, возможный дубль, лимит банка. */
export function useDraftWarnings() {
  const ws = useWorkspace();
  const app = useApp();
  const apps = useApplications(ws.wsId);
  const limit = useLimitWarning();
  return createMemo(() => {
    const d = app.draft;
    const inn = innProblem(d.clientInn);
    const dup = findDuplicate(d, apps.data ?? [], app.detail()?.id ?? null);
    return {
      inn: [
        inn?.kind === "checksum" ? inn.message : "",
        dup
          ? `Возможный дубль: заявка № ${applicationNumber(dup)} по этому ИНН и ${isRegistryLaw(d.law) && d.registryNumber ? "закупке" : "сумме"}`
          : "",
      ]
        .filter(Boolean)
        .join(" · "),
      limit: limit(d.primaryBankId, d.requestedAmount),
    };
  });
}

export function DataTab() {
  const ws = useWorkspace();
  const app = useApp();
  const d = app.draft;
  const warnings = useDraftWarnings();
  const err = (f: DraftField) => app.errors()[f];
  const set =
    <K extends DraftField>(k: K) =>
    (v: string) =>
      app.setDraft(k, v as never);
  const ro = () => app.readOnly();
  const days = () => (d.validFrom && d.validTo ? periodDays(d.validFrom, d.validTo) : null);

  const onClientInput = (field: "clientName" | "clientInn", v: string) => {
    // Ручная правка выбранного из списка клиента — это новый клиент; свой клиент заявки правится PUT.
    const own = app.detail()?.client_id;
    if (d.clientId && d.clientId !== own) app.setDraft("clientId", null);
    if (!d.clientId && own) app.setDraft("clientId", own);
    app.setDraft(field, v);
  };

  const lawOptions = LAW_KINDS.map((k) => ({ value: k, label: LAW_KIND_LABELS[k] }));
  const bankOptions = () =>
    app
      .banks()
      .filter((b) => b.is_active || b.id === d.primaryBankId)
      .map((b) => ({ value: b.id, label: b.name }));

  return (
    <div>
      <h3 class="m-0 mb-[5px] text-sm font-bold">Основные сведения</h3>
      <p class="m-0 mb-3 text-[11px] text-muted">Данные принципала, закупки и параметры гарантии.</p>
      <div class="grid grid-cols-2 gap-[13px] max-sm:grid-cols-1">
        <Field label="Тип закупки">
          {(id) => (
            <Select
              id={id}
              value={d.law}
              options={lawOptions}
              disabled={ro()}
              onValue={(v) => app.setDraft("law", v as LawKind)}
            />
          )}
        </Field>
        <Field
          label={d.law === "vat" ? "Принципал (юрлицо / ИП)" : "Юрлицо / ИП (принципал)"}
          error={err("clientName")}
        >
          {(id, desc) => (
            <ClientCombobox
              id={id}
              value={d.clientName}
              disabled={ro()}
              invalid={!!err("clientName")}
              describedBy={desc}
              onInput={(v) => onClientInput("clientName", v)}
              onPick={(c) => {
                app.setDraft({ clientId: c.id, clientName: c.name, clientInn: c.inn });
              }}
            />
          )}
        </Field>
        <Field label="ИНН принципала" error={err("clientInn")} warning={warnings().inn}>
          {(id, desc) => (
            <Input
              id={id}
              inputmode="numeric"
              maxlength={12}
              value={d.clientInn}
              disabled={ro()}
              invalid={!!err("clientInn")}
              aria-describedby={desc}
              onValue={(v) => onClientInput("clientInn", v.replace(/\D/g, ""))}
            />
          )}
        </Field>
        <Field label="Сумма БГ" error={err("requestedAmount")}>
          {(id, desc) => (
            <MoneyInput
              id={id}
              value={d.requestedAmount}
              disabled={ro()}
              invalid={!!err("requestedAmount")}
              aria-describedby={desc}
              onValue={set("requestedAmount")}
            />
          )}
        </Field>
        <div class="field">
          <span>Срок действия БГ</span>
          <div class="grid grid-cols-2 gap-2">
            <Input
              type="date"
              aria-label="Действует с"
              value={d.validFrom}
              disabled={ro()}
              onValue={set("validFrom")}
            />
            <Input
              type="date"
              aria-label="Действует по"
              value={d.validTo}
              disabled={ro()}
              invalid={!!err("validTo")}
              onValue={set("validTo")}
            />
          </div>
          <div
            class="min-h-3.5 text-[11px] font-medium"
            classList={{ "text-danger": !!err("validTo"), "text-muted": !err("validTo") }}
          >
            {err("validTo") ?? (days() ? `${days()} дн.` : "")}
          </div>
        </div>
        <Show
          when={env.useStubs}
          fallback={
            <Field label="Банк заведения заявки" hint="Скоро">
              {(id) => <Select id={id} value="" options={[]} placeholder="Не выбран" disabled />}
            </Field>
          }
        >
          <Field label="Банк заведения заявки" warning={warnings().limit}>
            {(id, desc) => (
              <Select
                id={id}
                value={d.primaryBankId}
                options={bankOptions()}
                placeholder="Не выбран"
                disabled={ro()}
                aria-describedby={desc}
                onValue={set("primaryBankId")}
              />
            )}
          </Field>
        </Show>
        <Field label="Ответственный">
          {(id) => (
            <Select
              id={id}
              value={d.responsibleUserId}
              options={ws.members().map((m) => ({ value: m.user_id, label: m.name }))}
              placeholder="Не назначен"
              disabled={ro()}
              onValue={set("responsibleUserId")}
            />
          )}
        </Field>
        <Field label="Номер заявки" hint={app.isNew() ? "Пусто — номер присвоит система" : undefined}>
          {(id, desc) => (
            <Input
              id={id}
              maxlength={64}
              value={d.number}
              disabled={ro()}
              aria-describedby={desc}
              onValue={set("number")}
            />
          )}
        </Field>
      </div>

      <div class="mt-[13px] grid grid-cols-3 gap-[13px] max-sm:grid-cols-1">
        <Show when={d.law === "vat"}>
          <Field label="Бенефициар" error={err("beneficiaryName")}>
            {(id, desc) => (
              <Input
                id={id}
                value={d.beneficiaryName}
                disabled={ro()}
                invalid={!!err("beneficiaryName")}
                aria-describedby={desc}
                onValue={set("beneficiaryName")}
              />
            )}
          </Field>
          <Field label="ИНН бенефициара" error={err("beneficiaryInn")}>
            {(id, desc) => (
              <Input
                id={id}
                inputmode="numeric"
                maxlength={12}
                value={d.beneficiaryInn}
                disabled={ro()}
                aria-describedby={desc}
                onValue={(v) => app.setDraft("beneficiaryInn", v.replace(/\D/g, ""))}
              />
            )}
          </Field>
        </Show>
        <Show when={d.law === "commercial"}>
          <Field label="Наименование заказчика">
            {(id) => <Input id={id} value={d.customerName} disabled={ro()} onValue={set("customerName")} />}
          </Field>
          <Field label="ИНН заказчика" error={err("customerInn")}>
            {(id, desc) => (
              <Input
                id={id}
                inputmode="numeric"
                maxlength={12}
                value={d.customerInn}
                disabled={ro()}
                aria-describedby={desc}
                onValue={(v) => app.setDraft("customerInn", v.replace(/\D/g, ""))}
              />
            )}
          </Field>
          <Field label="Номер договора">
            {(id) => (
              <Input
                id={id}
                maxlength={128}
                value={d.contractNumber}
                disabled={ro()}
                onValue={set("contractNumber")}
              />
            )}
          </Field>
          <Field label="Дата договора">
            {(id) => (
              <Input
                id={id}
                type="date"
                value={d.contractDate}
                disabled={ro()}
                onValue={set("contractDate")}
              />
            )}
          </Field>
        </Show>
        <Show when={isRegistryLaw(d.law)}>
          <Field label="Реестровый номер закупки">
            {(id) => (
              <Input
                id={id}
                maxlength={64}
                value={d.registryNumber}
                disabled={ro()}
                onValue={set("registryNumber")}
              />
            )}
          </Field>
          <Field label="Ссылка на ЕИС / площадку" error={err("placementUrl")}>
            {(id, desc) => (
              <Input
                id={id}
                type="url"
                placeholder="https://"
                value={d.placementUrl}
                disabled={ro()}
                invalid={!!err("placementUrl")}
                aria-describedby={desc}
                onValue={set("placementUrl")}
              />
            )}
          </Field>
          <Field label="НМЦ" error={err("nmc")}>
            {(id, desc) => (
              <MoneyInput
                id={id}
                value={d.nmc}
                disabled={ro()}
                aria-describedby={desc}
                onValue={set("nmc")}
              />
            )}
          </Field>
          <div class="field">
            <span>Дата и время ОПЗ</span>
            <div class="grid grid-cols-[1fr_96px] gap-2">
              <Input
                type="date"
                aria-label="Дата ОПЗ"
                value={d.deadlineDate}
                disabled={ro()}
                onValue={set("deadlineDate")}
              />
              <Input
                type="time"
                aria-label="Время ОПЗ"
                value={d.deadlineTime}
                disabled={ro()}
                onValue={set("deadlineTime")}
              />
            </div>
          </div>
        </Show>
        <Show when={d.law !== "vat"}>
          <Field label="Вид БГ">
            {(id) => (
              <Select
                id={id}
                value={d.guaranteeType}
                options={GUARANTEE_TYPES.map((t) => ({ value: t, label: GUARANTEE_TYPE_LABELS[t] }))}
                disabled={ro()}
                onValue={(v) => app.setDraft("guaranteeType", v as ProcurementGuaranteeType)}
              />
            )}
          </Field>
        </Show>
      </div>
      <Show when={d.law === "commercial" || isRegistryLaw(d.law)}>
        <Show when={d.placementUrl && !err("placementUrl") && /^https?:\/\//.test(d.placementUrl)}>
          <a
            href={d.placementUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="mt-2 inline-block text-xs text-accent"
          >
            Открыть закупку на площадке ↗
          </a>
        </Show>
      </Show>
      <Field label="Описание" class="mt-[13px]">
        {(id) => (
          <Textarea
            id={id}
            rows={3}
            maxlength={5000}
            value={d.description}
            disabled={ro()}
            onValue={set("description")}
          />
        )}
      </Field>
    </div>
  );
}
