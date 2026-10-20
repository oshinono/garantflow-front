import type { WorkspaceRole } from "./types";

/**
 * Матрица прав по ролям API. Восстановлена по ТЗ (раздел 5) до появления api.md;
 * при расхождении с разделом 4 api.md править только эту таблицу.
 */
export const PERMISSIONS = {
  "application.view": { label: "Просмотр заявок, клиентов и банков", roles: ["OWNER", "ADMIN", "MEMBER"] },
  "application.edit": {
    label: "Создание и редактирование заявок, запросов в банки и выдач",
    roles: ["OWNER", "ADMIN", "MEMBER"],
  },
  "bankRequest.delete": { label: "Удаление запросов в банк", roles: ["OWNER", "ADMIN"] },
  "guarantee.delete": { label: "Удаление данных о выдаче", roles: ["OWNER", "ADMIN"] },
  "bank.manage": {
    label: "Справочник банков: добавление, переименование, активность",
    roles: ["OWNER", "ADMIN"],
  },
  "member.invite": { label: "Приглашение участников и отзыв приглашений", roles: ["OWNER", "ADMIN"] },
  "member.remove": { label: "Удаление участников (кроме владельца)", roles: ["OWNER", "ADMIN"] },
  "member.role": { label: "Смена ролей участников", roles: ["OWNER"] },
  "workspace.manage": { label: "Переименование и удаление воркспейса, цвета колонок", roles: ["OWNER"] },
  "template.manage": { label: "Удаление общих шаблонов", roles: ["OWNER", "ADMIN"] },
} as const satisfies Record<string, { label: string; roles: readonly WorkspaceRole[] }>;

export type Action = keyof typeof PERMISSIONS;

export function can(role: WorkspaceRole | null | undefined, action: Action): boolean {
  if (!role) return false;
  return (PERMISSIONS[action].roles as readonly WorkspaceRole[]).includes(role);
}
