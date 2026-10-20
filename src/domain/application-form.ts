import * as v from "valibot";
import { splitDateTime, toZonedIso } from "./dates";
import { clientTypeByInn, innProblem } from "./inn";
import { parseMoney } from "./money";
import type {
  ApplicationBundle,
  ApplicationPayload,
  ApplicationView,
  ClientPayload,
  GuaranteeType,
  LawKind,
  ProcurementGuaranteeType,
  ProcurementPayload,
} from "./types";
import { LAW_KIND_LABELS } from "./types";

/** Единая форма заявки. При сохранении раскладывается на клиента, закупку и заявку (ТЗ 4.4). */
export type ApplicationDraft = {
  law: LawKind;
  clientId: string | null;
  clientName: string;
  clientInn: string;
  requestedAmount: string;
  validFrom: string;
  validTo: string;
  responsibleUserId: string;
  number: string;
  description: string;
  /** procurement.name — обязательное поле API; пустое заполняется автоматически */
  procurementName: string;
  registryNumber: string;
  placementUrl: string;
  nmc: string;
  deadlineDate: string;
  deadlineTime: string;
  customerName: string;
  customerInn: string;
  contractNumber: string;
  contractDate: string;
  guaranteeType: ProcurementGuaranteeType;
  beneficiaryName: string;
  beneficiaryInn: string;
  /** Z-08: банк заведения */
  primaryBankId: string;
};

export type DraftField = keyof ApplicationDraft;

export const DEFAULT_BENEFICIARY = "ФНС";

export function emptyDraft(responsibleUserId = ""): ApplicationDraft {
  return {
    law: "44_fz",
    clientId: null,
    clientName: "",
    clientInn: "",
    requestedAmount: "",
    validFrom: "",
    validTo: "",
    responsibleUserId,
    number: "",
    description: "",
    procurementName: "",
    registryNumber: "",
    placementUrl: "",
    nmc: "",
    deadlineDate: "",
    deadlineTime: "23:59",
    customerName: "",
    customerInn: "",
    contractNumber: "",
    contractDate: "",
    guaranteeType: "participation",
    beneficiaryName: DEFAULT_BENEFICIARY,
    beneficiaryInn: "",
    primaryBankId: "",
  };
}

export function detailToDraft(b: ApplicationBundle, primaryBankId: string | null = null): ApplicationDraft {
  const d = b.app;
  const p = b.procurement;
  const deadline = splitDateTime(p?.application_deadline);
  const isVat = d.guarantee_type === "vat";
  return {
    law: isVat ? "vat" : (p?.law_type ?? "commercial"),
    clientId: b.client.id,
    clientName: b.client.name,
    clientInn: b.client.inn ?? "",
    requestedAmount: d.requested_amount ?? "",
    validFrom: d.requested_valid_from ?? "",
    validTo: d.requested_valid_to ?? "",
    responsibleUserId: d.responsible_user_id ?? "",
    number: d.number ?? "",
    description: d.description ?? "",
    procurementName: p?.name ?? "",
    registryNumber: p?.registry_number ?? "",
    placementUrl: p?.placement_url ?? "",
    nmc: p?.nmc ?? "",
    deadlineDate: deadline.date,
    deadlineTime: deadline.time,
    customerName: p?.customer_name ?? "",
    customerInn: p?.customer_inn ?? "",
    contractNumber: p?.contract_number ?? "",
    contractDate: p?.contract_date ?? "",
    guaranteeType: isVat ? "participation" : (d.guarantee_type as ProcurementGuaranteeType),
    beneficiaryName: d.beneficiary_name ?? (isVat ? DEFAULT_BENEFICIARY : ""),
    beneficiaryInn: d.beneficiary_inn ?? "",
    primaryBankId: primaryBankId ?? "",
  };
}

/** «Повторить заявку»: копия полей без номера, выдач, банков и истории. */
export function repeatDraft(d: ApplicationDraft): ApplicationDraft {
  return { ...d, number: "" };
}

export const isRegistryLaw = (law: LawKind) => law === "44_fz" || law === "223_fz" || law === "615_pp";

const nonEmpty = (s: string) => (s.trim() ? s.trim() : null);

export function isSafeUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const draftSchema = v.object({
  clientName: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "Укажите наименование принципала"),
    v.maxLength(500, "Не более 500 символов"),
  ),
  procurementName: v.pipe(v.string(), v.maxLength(1000, "Не более 1000 символов")),
  number: v.pipe(v.string(), v.maxLength(100, "Не более 100 символов")),
  registryNumber: v.pipe(v.string(), v.maxLength(100, "Не более 100 символов")),
  contractNumber: v.pipe(v.string(), v.maxLength(100, "Не более 100 символов")),
  customerName: v.pipe(v.string(), v.maxLength(500, "Не более 500 символов")),
  beneficiaryName: v.pipe(v.string(), v.maxLength(500, "Не более 500 символов")),
  placementUrl: v.pipe(v.string(), v.maxLength(2000, "Не более 2000 символов")),
});

export type DraftErrors = Partial<Record<DraftField, string>>;

/** Блокирующие ошибки. Предупреждения (контрольная сумма, дубль, лимит) считаются отдельно. */
export function validateDraft(d: ApplicationDraft): DraftErrors {
  const errors: DraftErrors = {};
  const result = v.safeParse(draftSchema, d);
  if (!result.success) {
    for (const issue of result.issues) {
      const key = issue.path?.[0]?.key as DraftField | undefined;
      if (key && !errors[key]) errors[key] = issue.message;
    }
  }
  if (d.clientInn && innProblem(d.clientInn)?.kind === "format") errors.clientInn = "ИНН должен содержать 10 или 12 цифр";
  const money: DraftField[] = ["requestedAmount", "nmc"];
  for (const f of money) {
    if (d[f] && parseMoney(String(d[f])) === undefined) errors[f] = "Некорректная сумма";
  }
  if (d.validFrom && d.validTo && d.validFrom > d.validTo) errors.validTo = "Окончание раньше начала";
  if (isRegistryLaw(d.law) && d.placementUrl && !isSafeUrl(d.placementUrl))
    errors.placementUrl = "Ссылка должна начинаться с http:// или https://";
  if (d.law === "commercial" && d.customerInn && innProblem(d.customerInn)?.kind === "format")
    errors.customerInn = "ИНН должен содержать 10 или 12 цифр";
  if (d.law === "vat" && d.beneficiaryInn && innProblem(d.beneficiaryInn)?.kind === "format")
    errors.beneficiaryInn = "ИНН должен содержать 10 или 12 цифр";
  if (d.law === "vat" && !d.beneficiaryName.trim()) errors.beneficiaryName = "Укажите бенефициара";
  return errors;
}

/** Возможный дубль: тот же ИНН и реестровый номер, либо тот же ИНН, тип и сумма. */
export function findDuplicate(
  d: ApplicationDraft,
  list: ApplicationView[],
  selfId: string | null,
): ApplicationView | null {
  const inn = d.clientInn.trim();
  if (!inn) return null;
  const amount = parseMoney(d.requestedAmount);
  const reg = isRegistryLaw(d.law) ? d.registryNumber.trim() : "";
  return (
    list.find((a) => {
      if (a.id === selfId || a.client_inn !== inn) return false;
      if (reg) return a.registry_number === reg;
      const kind = a.guarantee_type === "vat" ? "vat" : (a.law_type ?? "commercial");
      return kind === d.law && amount != null && parseMoney(a.requested_amount ?? "") === amount;
    }) ?? null
  );
}

/** PUT клиента — полная замена: поля, которых нет в форме, уходят пустыми (см. README). */
export function toClientPayload(d: ApplicationDraft): ClientPayload {
  const inn = d.clientInn.trim();
  return {
    client_type: inn ? clientTypeByInn(inn) : "company",
    name: d.clientName.trim(),
    inn: inn || null,
  };
}

/** procurement.name обязателен в API: если поле пустое, собираем его из номера/договора. */
export function procurementNameOf(d: ApplicationDraft): string {
  const own = d.procurementName.trim();
  if (own) return own;
  if (d.law === "commercial") {
    const parts = [d.contractNumber.trim() && `Договор № ${d.contractNumber.trim()}`, d.customerName.trim()];
    return parts.filter(Boolean).join(" · ") || "Коммерческая закупка";
  }
  const reg = d.registryNumber.trim();
  return reg ? `Закупка № ${reg}` : `Закупка ${LAW_KIND_LABELS[d.law]}`;
}

export function toProcurementPayload(d: ApplicationDraft): ProcurementPayload | null {
  if (d.law === "vat") return null;
  const base: ProcurementPayload = {
    law_type: d.law,
    name: procurementNameOf(d),
    registry_number: null,
    placement_url: null,
    customer_name: null,
    customer_inn: null,
    nmc: null,
    contract_price: null,
    contract_number: null,
    contract_date: null,
    platform: null,
    application_deadline: null,
    contract_deadline: null,
  };
  if (d.law === "commercial") {
    return {
      ...base,
      customer_name: nonEmpty(d.customerName),
      customer_inn: nonEmpty(d.customerInn),
      contract_number: nonEmpty(d.contractNumber),
      contract_date: d.contractDate || null,
    };
  }
  return {
    ...base,
    registry_number: nonEmpty(d.registryNumber),
    placement_url: nonEmpty(d.placementUrl),
    nmc: parseMoney(d.nmc) ?? null,
    application_deadline: toZonedIso(d.deadlineDate, d.deadlineTime),
  };
}

/**
 * Сохраняет в PUT закупки поля, которых нет в форме (цена контракта, площадка, срок контракта),
 * чтобы полная замена их не стёрла.
 */
export function mergeProcurementPayload(
  next: ProcurementPayload,
  current: Partial<ProcurementPayload> | null | undefined,
): ProcurementPayload {
  if (!current) return next;
  return {
    ...next,
    contract_price: current.contract_price ?? null,
    platform: current.platform ?? null,
    contract_deadline: current.contract_deadline ?? null,
  };
}

export function guaranteeTypeOf(d: ApplicationDraft): GuaranteeType {
  return d.law === "vat" ? "vat" : d.guaranteeType;
}

export function toApplicationPayload(d: ApplicationDraft, procurementId: string | null): ApplicationPayload {
  const isVat = d.law === "vat";
  return {
    procurement_id: isVat ? null : procurementId,
    guarantee_type: guaranteeTypeOf(d),
    beneficiary_name: isVat ? nonEmpty(d.beneficiaryName) : null,
    beneficiary_inn: isVat ? nonEmpty(d.beneficiaryInn) : null,
    requested_amount: parseMoney(d.requestedAmount) ?? null,
    requested_valid_from: d.validFrom || null,
    requested_valid_to: d.validTo || null,
    responsible_user_id: d.responsibleUserId || null,
    number: nonEmpty(d.number),
    description: nonEmpty(d.description),
  };
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function clientChanged(a: ApplicationDraft, b: ApplicationDraft): boolean {
  return !sameJson(toClientPayload(a), toClientPayload(b));
}

export function procurementChanged(a: ApplicationDraft, b: ApplicationDraft): boolean {
  return !sameJson(toProcurementPayload(a), toProcurementPayload(b));
}

export function applicationChanged(a: ApplicationDraft, b: ApplicationDraft): boolean {
  return !sameJson(toApplicationPayload(a, "p"), toApplicationPayload(b, "p"));
}

export function isDraftDirty(a: ApplicationDraft, b: ApplicationDraft): boolean {
  return !sameJson(a, b);
}

/** Поля, изменения которых пишутся в журнал «было → стало» (Z-09). */
export const HISTORY_FIELDS: [DraftField, string][] = [
  ["clientName", "Принципал"],
  ["clientInn", "ИНН"],
  ["law", "Тип закупки"],
  ["guaranteeType", "Вид БГ"],
  ["requestedAmount", "Сумма БГ"],
  ["validFrom", "Действует с"],
  ["validTo", "Действует по"],
  ["procurementName", "Наименование закупки"],
  ["registryNumber", "Номер закупки"],
  ["deadlineDate", "Дата ОПЗ"],
  ["customerName", "Заказчик"],
  ["contractNumber", "Номер договора"],
  ["responsibleUserId", "Ответственный"],
  ["primaryBankId", "Банк заведения"],
  ["number", "Номер заявки"],
];

export type FieldChange = { field: DraftField; label: string; from: string; to: string };

export function diffDrafts(
  before: ApplicationDraft,
  after: ApplicationDraft,
  display: (field: DraftField, value: string) => string = (_f, val) => val,
): FieldChange[] {
  const out: FieldChange[] = [];
  for (const [field, label] of HISTORY_FIELDS) {
    const a = String(before[field] ?? "");
    const b = String(after[field] ?? "");
    if (a !== b) out.push({ field, label, from: display(field, a) || "—", to: display(field, b) || "—" });
  }
  return out;
}
