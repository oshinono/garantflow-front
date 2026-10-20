import { logActivity } from "@/api/stubs/collab";
import { type ApplicationStatus, STATUS_LABELS, applicationNumber } from "@/domain/types";

type AppRef = { id: string; number?: string | null; client_name?: string };

export function appLabel(app: AppRef): string {
  return `№ ${applicationNumber({ id: app.id, number: app.number ?? null })}${app.client_name ? " · " + app.client_name : ""}`;
}

/** STUB Z-09: журнал пишет клиент после успешной мутации, пока его нет на бэкенде. */
export function logAppActivity(wsId: string, app: AppRef, by: { id: string; name: string }, texts: string[]) {
  logActivity(
    wsId,
    texts.map((text) => ({
      applicationId: app.id,
      appLabel: appLabel(app),
      byId: by.id,
      byName: by.name,
      text,
    })),
  );
}

export function statusChangeText(from: ApplicationStatus, to: ApplicationStatus): string {
  return `Статус: ${STATUS_LABELS[from]} → ${STATUS_LABELS[to]}`;
}
