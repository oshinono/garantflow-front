import type { components } from "@/api/schema";

type Schemas = components["schemas"];

export type WorkspaceRole = Schemas["MemberRole"];
export type ApplicationStatus = Schemas["ApplicationStatus"];
export type GuaranteeType = Schemas["GuaranteeType"];
export type LawType = Schemas["ProcurementLawType"];
export type ClientType = Schemas["ClientType"];
export type BankRequestState = Schemas["BankRequestState"];

export type User = Schemas["UserResponse"];
export type Workspace = Schemas["WorkspaceSummaryResponse"];
export type WorkspaceDetail = Schemas["WorkspaceResponse"];
export type Member = Schemas["WorkspaceMember"];
export type Invitation = Schemas["InvitationResponse"];
export type Bank = Schemas["BankResponse"];
export type ClientPayload = Schemas["ClientRequest"];
export type Procurement = Schemas["ProcurementResponse"];
export type ProcurementPayload = Schemas["ProcurementFields"];
/**
 * Поля, которых нет в ответе API: фронтенд собирает их сам из справочника закупок
 * и локального реестра клиентов (STUB Z-01/Z-02). Присутствуют в summary доски.
 */
export type ApplicationSummaryExtras = {
  client_name: string;
  client_inn: string | null;
  law_type: LawType | null;
  procurement_name: string | null;
  registry_number: string | null;
  contract_number: string | null;
  customer_name: string | null;
  customer_inn: string | null;
  application_deadline: string | null;
  /** Z-16: сумма выданных БГ — нужна отчётам и спискам. */
  issued_amount?: string | null;
  /** Z-02: статусы банков с названием для карточек доски. */
  bank_statuses?: (Schemas["BankStatusSummary"] & { bank_name?: string })[];
};

export type ApplicationSummary = Schemas["ApplicationSummaryResponse"] & Partial<ApplicationSummaryExtras>;
export type ApplicationDetail = Omit<Schemas["ApplicationResponse"], "guarantees"> & {
  /** В ответе API у БГ нет банка — он выводится из bank_request_id при загрузке заявки. */
  guarantees: Guarantee[];
  /** Z-01: в API нет GET клиентов, клиент подмешивается на клиенте. */
  client: ClientInfo;
  /** Z-02: закупка не входит в ответ заявки, подмешивается на клиенте. */
  procurement: Procurement | null;
};
export type ApplicationPayload = Schemas["ApplicationFields"];
export type BankRequest = Schemas["BankRequestResponse"];
export type BankRequestPayload = Schemas["BankRequestFields"];
export type Guarantee = Schemas["GuaranteeResponse"] & { bank_id: string | null };
export type GuaranteePayload = Schemas["GuaranteeFields"];
export type StatusHistoryEntry = Schemas["StatusHistoryEntry"];
export type TokenPair = Schemas["TokenResponse"];

/**
 * Клиент для отображения. В API нет GET клиентов (STUB Z-01), поэтому имя и ИНН
 * берутся из локального реестра клиентов, созданных или изменённых через этот фронтенд.
 */
export type ClientInfo = {
  id: string;
  name: string;
  inn: string | null;
  client_type: ClientType;
  archived?: boolean;
};

/**
 * Заявка для доски и списков: summary + данные клиента и закупки, собранные на клиенте
 * (GET /procurements + реестр клиентов Z-01). Z-02 предлагает отдавать их прямо в summary.
 */
export type ApplicationView = ApplicationSummary & ApplicationSummaryExtras;

/** Детальная заявка вместе с закупкой и клиентом — всё, что нужно карточке. */
export type ApplicationBundle = {
  app: ApplicationDetail;
  procurement: Procurement | null;
  client: ClientInfo;
};

/** Тип закупки в терминах интерфейса: закон или «БГ по НДС» (это guarantee_type = vat без закупки). */
export type LawKind = LawType | "vat";

export const LAW_KIND_LABELS: Record<LawKind, string> = {
  commercial: "Коммерческая",
  "44_fz": "44-ФЗ",
  "223_fz": "223-ФЗ",
  "615_pp": "615-ПП",
  vat: "БГ по НДС",
};
export const LAW_KINDS: LawKind[] = ["commercial", "44_fz", "223_fz", "615_pp", "vat"];

/** Виды БГ, доступные в форме (НДС задаётся типом закупки). */
export type ProcurementGuaranteeType = Exclude<GuaranteeType, "vat">;
export const GUARANTEE_TYPES: ProcurementGuaranteeType[] = ["participation", "oik", "go", "advance"];
export const GUARANTEE_TYPE_LABELS: Record<GuaranteeType, string> = {
  participation: "участие",
  oik: "ОИК",
  go: "ГО",
  advance: "аванс",
  vat: "НДС",
};

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  in_progress: "В работе",
  issued: "Выданные",
  archived: "Архив",
};
export const STATUS_DESCRIPTIONS: Record<ApplicationStatus, string> = {
  in_progress: "Новые и активные заявки",
  issued: "Гарантии с данными выдачи",
  archived: "Завершённые кейсы",
};
export const STATUSES: ApplicationStatus[] = ["in_progress", "issued", "archived"];

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  OWNER: "Владелец",
  ADMIN: "Администратор",
  MEMBER: "Участник",
};

export function lawKindOf(app: { guarantee_type: GuaranteeType; law_type?: LawType | null }): LawKind {
  if (app.guarantee_type === "vat") return "vat";
  return app.law_type ?? "commercial";
}

/** Номер заявки для людей: поле number, иначе короткий хвост UUID (Z-07). */
export function applicationNumber(app: { id: string; number?: string | null }): string {
  if (app.number) return app.number;
  return "#" + app.id.replace(/-/g, "").slice(-6);
}

/** Номер закупки или договора для карточки. */
export function procurementRef(
  app: Pick<ApplicationView, "law_type" | "guarantee_type" | "registry_number" | "contract_number">,
): string {
  const kind = lawKindOf(app);
  if (kind === "vat") return "—";
  if (kind === "commercial") return app.contract_number || "—";
  return app.registry_number || "—";
}

/** Подпись клиента, если его нет в реестре Z-01. */
export function unknownClientName(clientId: string): string {
  return `Клиент #${clientId.replace(/-/g, "").slice(-6)}`;
}
