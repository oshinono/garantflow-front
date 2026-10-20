import type { BoardFilters } from "@/domain/board";
import type { ApplicationDraft } from "@/domain/application-form";
import type { ApplicationStatus } from "@/domain/types";
import { delay, readStub, stubId, updateStub, writeStub } from "./storage";

/* STUB Z-04 — предложение банка: поля в bank_request
 *   rate (Decimal, % годовых), fee (Decimal), review_days (int), conditions (string) */
export type BankOffer = { rate: string; fee: string; days: string; cond: string };

// STUB Z-04
export function getOffers(wsId: string): Promise<Record<string, BankOffer>> {
  return delay(readStub<Record<string, BankOffer>>(wsId, "offers", {}));
}
// STUB Z-04
export function saveOffer(wsId: string, bankRequestId: string, offer: BankOffer): Promise<void> {
  updateStub<Record<string, BankOffer>>(wsId, "offers", {}, (m) => ({ ...m, [bankRequestId]: offer }));
  return delay(undefined);
}

/* STUB Z-05 — лимит банка на клиента, срок лимита, контакт (поля банка в рамках воркспейса)
 *   PUT /api/v1/workspaces/{ws}/banks/{id}/settings {client_limit, limit_valid_until, contact} */
export type BankInfo = { limit: string; until: string; contact: string };

// STUB Z-05
export function getBankInfo(wsId: string): Promise<Record<string, BankInfo>> {
  return delay(readStub<Record<string, BankInfo>>(wsId, "bank-info", {}));
}
// STUB Z-05
export function saveBankInfo(wsId: string, bankId: string, info: BankInfo): Promise<void> {
  updateStub<Record<string, BankInfo>>(wsId, "bank-info", {}, (m) => ({ ...m, [bankId]: info }));
  return delay(undefined);
}

/* STUB Z-06 — файлы заявки и скан БГ
 *   POST/GET/DELETE /api/v1/workspaces/{ws}/applications/{id}/files, file_id у гарантии.
 * Заглушка хранит только метаданные: содержимое файла никуда не отправляется. */
export type AppFile = {
  id: string;
  applicationId: string;
  guaranteeId?: string;
  name: string;
  size: number;
  authorName: string;
  at: string;
};

// STUB Z-06
export function listFiles(wsId: string, applicationId?: string): Promise<AppFile[]> {
  const all = readStub<AppFile[]>(wsId, "files", []);
  return delay(applicationId ? all.filter((f) => f.applicationId === applicationId) : all);
}
// STUB Z-06
export function addFiles(
  wsId: string,
  applicationId: string,
  files: File[],
  authorName: string,
  guaranteeId?: string,
): Promise<AppFile[]> {
  const at = new Date().toISOString();
  const added = files.map<AppFile>((f) => ({
    id: stubId("f"),
    applicationId,
    guaranteeId,
    name: f.name,
    size: f.size,
    authorName,
    at,
  }));
  updateStub<AppFile[]>(wsId, "files", [], (l) => [...l, ...added]);
  return delay(added);
}
// STUB Z-06
export function deleteFile(wsId: string, id: string): Promise<void> {
  updateStub<AppFile[]>(wsId, "files", [], (l) => l.filter((f) => f.id !== id));
  return delay(undefined);
}

/* STUB Z-08 — банк заведения: application.primary_bank_id */
// STUB Z-08
export function getPrimaryBanks(wsId: string): Promise<Record<string, string>> {
  return delay(readStub<Record<string, string>>(wsId, "primary-bank", {}));
}
// STUB Z-08
export function setPrimaryBank(wsId: string, applicationId: string, bankId: string | null): Promise<void> {
  updateStub<Record<string, string>>(wsId, "primary-bank", {}, (m) => {
    const next = { ...m };
    if (bankId) next[applicationId] = bankId;
    else delete next[applicationId];
    return next;
  });
  return delay(undefined);
}

/* STUB Z-12 — переименование и удаление воркспейса: PATCH, DELETE /workspaces/{id}.
 * Заглушка: локальное имя и скрытие воркспейса в этом браузере. */
export type WorkspaceOverride = { name?: string; hidden?: boolean };

// STUB Z-12
export function getWorkspaceOverride(wsId: string): WorkspaceOverride {
  return readStub<WorkspaceOverride>(wsId, "workspace", {});
}
// STUB Z-12
export function renameWorkspace(wsId: string, name: string): Promise<void> {
  updateStub<WorkspaceOverride>(wsId, "workspace", {}, (o) => ({ ...o, name }));
  return delay(undefined);
}
// STUB Z-12
export function deleteWorkspace(wsId: string): Promise<void> {
  updateStub<WorkspaceOverride>(wsId, "workspace", {}, (o) => ({ ...o, hidden: true }));
  return delay(undefined);
}

/* STUB Z-13 — настройки воркспейса: цвета колонок. PATCH /workspaces/{id}/settings {column_colors} */
export type ColumnColors = Record<ApplicationStatus, string>;
export const DEFAULT_COLUMN_COLORS: ColumnColors = {
  in_progress: "#5278D8",
  issued: "#238866",
  archived: "#8B6AC8",
};

// STUB Z-13
export function getColumnColors(wsId: string): ColumnColors {
  return { ...DEFAULT_COLUMN_COLORS, ...readStub<Partial<ColumnColors>>(wsId, "column-colors", {}) };
}
// STUB Z-13
export function saveColumnColors(wsId: string, colors: ColumnColors | null): Promise<void> {
  writeStub(wsId, "column-colors", colors ?? {});
  return delay(undefined);
}

/* STUB Z-14 — пользовательские шаблоны заявок: GET/POST/DELETE /workspaces/{ws}/templates */
export type TemplateFields = Partial<
  Pick<
    ApplicationDraft,
    "law" | "guaranteeType" | "requestedAmount" | "primaryBankId" | "validFrom" | "validTo" | "deadlineTime"
  >
> & { validDays?: number };
export type ApplicationTemplate = { id: string; name: string; fields: TemplateFields; builtIn?: boolean };

// STUB Z-14
export function listTemplates(wsId: string): Promise<ApplicationTemplate[]> {
  return delay(readStub<ApplicationTemplate[]>(wsId, "templates", []));
}
// STUB Z-14
export function createTemplate(
  wsId: string,
  name: string,
  fields: TemplateFields,
): Promise<ApplicationTemplate> {
  const t = { id: stubId("t"), name: name.slice(0, 60), fields };
  updateStub<ApplicationTemplate[]>(wsId, "templates", [], (l) => [...l, t]);
  return delay(t);
}
// STUB Z-14
export function deleteTemplate(wsId: string, id: string): Promise<void> {
  updateStub<ApplicationTemplate[]>(wsId, "templates", [], (l) => l.filter((t) => t.id !== id));
  return delay(undefined);
}

/* STUB Z-15 — сохранённые наборы фильтров: GET/POST/DELETE /workspaces/{ws}/filter-presets */
export type FilterPreset = { id: string; name: string; filters: Omit<BoardFilters, "q"> };

// STUB Z-15
export function listPresets(wsId: string): Promise<FilterPreset[]> {
  return delay(readStub<FilterPreset[]>(wsId, "filter-presets", []));
}
// STUB Z-15
export function createPreset(
  wsId: string,
  name: string,
  filters: Omit<BoardFilters, "q">,
): Promise<FilterPreset> {
  const p = { id: stubId("p"), name: name.slice(0, 30), filters };
  updateStub<FilterPreset[]>(wsId, "filter-presets", [], (l) => [...l, p]);
  return delay(p);
}
// STUB Z-15
export function deletePreset(wsId: string, id: string): Promise<void> {
  updateStub<FilterPreset[]>(wsId, "filter-presets", [], (l) => l.filter((p) => p.id !== id));
  return delay(undefined);
}
