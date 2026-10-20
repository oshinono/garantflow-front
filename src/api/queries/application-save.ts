import {
  type ApplicationDraft,
  applicationChanged,
  clientChanged,
  procurementChanged,
  toApplicationPayload,
  toClientPayload,
  toProcurementPayload,
} from "@/domain/application-form";
import type { ApplicationDetail } from "@/domain/types";
import { api, unwrap } from "../client";
import { setPrimaryBank } from "../stubs/extras";
import { fetchApplication } from "./applications";

/** Id сущностей, уже созданных при сохранении: повтор продолжает с упавшего шага без дублей (ТЗ 4.4). */
export type SaveProgress = { clientId?: string; procurementId?: string };

export type SaveInput = {
  wsId: string;
  draft: ApplicationDraft;
  /** Черновик на момент открытия (для редактирования) */
  original: ApplicationDraft | null;
  detail: ApplicationDetail | null;
  progress: SaveProgress;
};

async function createClient(wsId: string, d: ApplicationDraft) {
  return unwrap(
    api.POST("/api/v1/workspaces/{workspace_id}/clients", {
      params: { path: { workspace_id: wsId } },
      body: toClientPayload(d),
    }),
  );
}

async function createProcurement(wsId: string, d: ApplicationDraft, clientId: string) {
  const body = toProcurementPayload(d, clientId)!;
  return unwrap(
    api.POST("/api/v1/workspaces/{workspace_id}/procurements", {
      params: { path: { workspace_id: wsId } },
      body,
    }),
  );
}

/** Создание: клиент (или выбранный) → закупка (кроме НДС) → заявка. */
async function create({ wsId, draft, progress }: SaveInput): Promise<ApplicationDetail> {
  const clientId = draft.clientId ?? progress.clientId ?? (await createClient(wsId, draft)).id;
  progress.clientId = clientId;
  let procurementId: string | null = null;
  if (draft.law !== "vat") {
    procurementId = progress.procurementId ?? (await createProcurement(wsId, draft, clientId)).id;
    progress.procurementId = procurementId;
  }
  const created = await unwrap(
    api.POST("/api/v1/workspaces/{workspace_id}/applications", {
      params: { path: { workspace_id: wsId } },
      body: toApplicationPayload(draft, clientId, procurementId),
    }),
  );
  if (draft.primaryBankId) await setPrimaryBank(wsId, created.id, draft.primaryBankId); // STUB Z-08
  // POST /applications возвращает только { id } — детальный ответ читаем отдельно.
  return fetchApplication(wsId, created.id);
}

/** Редактирование: PUT каждой изменённой сущности целиком (update в API — полная замена). */
async function update({ wsId, draft, original, detail }: SaveInput): Promise<ApplicationDetail> {
  const d = detail!;
  const before = original!;
  let clientId = d.client_id;
  if (draft.clientId && draft.clientId !== d.client_id) {
    clientId = draft.clientId;
  } else if (!draft.clientId) {
    clientId = (await createClient(wsId, draft)).id;
  } else if (clientChanged(before, draft)) {
    await unwrap(
      api.PUT("/api/v1/workspaces/{workspace_id}/clients/{client_id}", {
        params: { path: { workspace_id: wsId, client_id: clientId } },
        body: toClientPayload(draft),
      }),
    );
  }

  let procurementId: string | null = null;
  if (draft.law !== "vat") {
    if (d.procurement_id) {
      procurementId = d.procurement_id;
      if (procurementChanged(before, draft) || clientId !== d.client_id)
        await unwrap(
          api.PUT("/api/v1/workspaces/{workspace_id}/procurements/{procurement_id}", {
            params: { path: { workspace_id: wsId, procurement_id: procurementId } },
            body: toProcurementPayload(draft, clientId)!,
          }),
        );
    } else {
      procurementId = (await createProcurement(wsId, draft, clientId)).id;
    }
  }

  if (
    applicationChanged(before, draft) ||
    clientId !== d.client_id ||
    procurementId !== (d.procurement_id ?? null)
  ) {
    // PUT — полная замена, отвечает 204 без тела.
    await unwrap(
      api.PUT("/api/v1/workspaces/{workspace_id}/applications/{application_id}", {
        params: { path: { workspace_id: wsId, application_id: d.id } },
        body: toApplicationPayload(draft, clientId, procurementId),
      }),
    );
  }
  if (draft.primaryBankId !== before.primaryBankId)
    await setPrimaryBank(wsId, d.id, draft.primaryBankId || null); // STUB Z-08
  return fetchApplication(wsId, d.id);
}

export function saveApplication(input: SaveInput): Promise<ApplicationDetail> {
  return input.detail ? update(input) : create(input);
}
