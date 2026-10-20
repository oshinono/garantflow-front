import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query";
import type { Accessor } from "solid-js";
import type { BoardItem } from "@/domain/board";
import type { ApplicationDetail, ApplicationStatus, ApplicationSummary } from "@/domain/types";
import { api, unwrap } from "../client";
import { getPrimaryBanks, listFiles } from "../stubs/extras";
import { listComments } from "../stubs/collab";
import { keys } from "./keys";

export function fetchApplications(wsId: string) {
  return unwrap(
    api.GET("/api/v1/workspaces/{workspace_id}/applications", { params: { path: { workspace_id: wsId } } }),
  );
}

/**
 * Детальная заявка. В ответе API у БГ нет банка — выводим bank_id из bank_request_id
 * (гарантия всегда ссылается на запрос в банк, а запрос знает свой банк).
 */
export async function fetchApplication(wsId: string, id: string): Promise<ApplicationDetail> {
  const app = await unwrap(
    api.GET("/api/v1/workspaces/{workspace_id}/applications/{application_id}", {
      params: { path: { workspace_id: wsId, application_id: id } },
    }),
  );
  const detail = app as unknown as ApplicationDetail;
  return {
    ...detail,
    guarantees: (app.guarantees ?? []).map((g) => ({
      ...g,
      bank_id:
        (g as { bank_id?: string | null }).bank_id ??
        (app.bank_requests ?? []).find((r) => r.id === g.bank_request_id)?.bank_id ??
        null,
    })),
  };
}

export function useApplications(wsId: Accessor<string>) {
  return useQuery(() => ({
    queryKey: keys.applications(wsId()),
    queryFn: () => fetchApplications(wsId()),
    enabled: !!wsId(),
    staleTime: 30_000,
  }));
}

export function useApplication(wsId: Accessor<string>, id: Accessor<string | null>) {
  return useQuery(() => ({
    queryKey: keys.application(wsId(), id() ?? ""),
    queryFn: () => fetchApplication(wsId(), id()!),
    enabled: !!wsId() && !!id(),
  }));
}

/** Данные заглушек для доски: банк заведения (Z-08), комментарии (Z-03) и файлы (Z-06) для поиска. */
export function useBoardExtras(wsId: Accessor<string>) {
  return useQuery(() => ({
    queryKey: keys.stub(wsId(), "board-extras"),
    queryFn: async () => {
      const [primary, comments, files] = await Promise.all([
        getPrimaryBanks(wsId()),
        listComments(wsId()),
        listFiles(wsId()),
      ]);
      const search: Record<string, string[]> = {};
      for (const c of comments) (search[c.applicationId] ??= []).push(c.text);
      for (const f of files) (search[f.applicationId] ??= []).push(f.name);
      return { primary, search };
    },
    enabled: !!wsId(),
  }));
}

export function toBoardItems(
  list: ApplicationSummary[] | undefined,
  extras: { primary: Record<string, string>; search: Record<string, string[]> } | undefined,
): BoardItem[] {
  return (list ?? []).map((a) => ({
    ...a,
    primaryBankId: extras?.primary[a.id] ?? null,
    extraSearch: extras?.search[a.id],
  }));
}

/** Обновляет заявку в списке после мутации, не дожидаясь рефетча. */
export function patchSummary(
  qc: ReturnType<typeof useQueryClient>,
  wsId: string,
  id: string,
  patch: Partial<ApplicationSummary>,
) {
  qc.setQueryData<ApplicationSummary[]>(keys.applications(wsId), (list) =>
    list?.map((a) => (a.id === id ? { ...a, ...patch } : a)),
  );
}

export function invalidateApplication(qc: ReturnType<typeof useQueryClient>, wsId: string, id?: string) {
  void qc.invalidateQueries({ queryKey: keys.applications(wsId) });
  void qc.invalidateQueries({ queryKey: keys.issuedDetails(wsId) });
  if (id) void qc.invalidateQueries({ queryKey: keys.application(wsId, id) });
}

type TransitionVars = {
  id: string;
  to: ApplicationStatus;
  reason?: string | null;
  comment?: string | null;
  self?: boolean | null;
};

/** Архивация и возврат в работу с оптимистичным перемещением карточки и откатом при 409. */
export function useStatusTransition(wsId: Accessor<string>) {
  const qc = useQueryClient();
  return useMutation(() => ({
    // archive/reopen возвращают 204 без тела — результат берём из инвалидации кэша.
    mutationFn: async (v: TransitionVars): Promise<void> => {
      const path = { workspace_id: wsId(), application_id: v.id };
      if (v.to === "archived") {
        await unwrap(
          api.POST("/api/v1/workspaces/{workspace_id}/applications/{application_id}/archive", {
            params: { path },
            body: { reason: v.reason || null, client_obtained_independently: v.self ?? null },
          }),
        );
        return;
      }
      await unwrap(
        api.POST("/api/v1/workspaces/{workspace_id}/applications/{application_id}/reopen", {
          params: { path },
          body: { comment: v.comment || null },
        }),
      );
    },
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: keys.applications(wsId()) });
      const prev = qc.getQueryData<ApplicationSummary[]>(keys.applications(wsId()));
      patchSummary(qc, wsId(), v.id, { status: v.to });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.applications(wsId()), ctx.prev);
    },
    onSettled: (_d, _e, v) => invalidateApplication(qc, wsId(), v.id),
  }));
}

/** PUT заявки целиком: берём актуальный детальный ответ, меняем поле и отправляем. */
export async function putApplicationPatch(
  wsId: string,
  id: string,
  patch: Partial<Pick<ApplicationDetail, "responsible_user_id">>,
): Promise<ApplicationDetail> {
  const d = await fetchApplication(wsId, id);
  // PUT заявки отвечает 204 — перечитываем детальную заявку.
  await unwrap(
    api.PUT("/api/v1/workspaces/{workspace_id}/applications/{application_id}", {
      params: { path: { workspace_id: wsId, application_id: id } },
      body: {
        procurement_id: d.procurement_id ?? null,
        guarantee_type: d.guarantee_type,
        beneficiary_name: d.beneficiary_name ?? null,
        beneficiary_inn: d.beneficiary_inn ?? null,
        requested_amount: d.requested_amount,
        requested_valid_from: d.requested_valid_from ?? null,
        requested_valid_to: d.requested_valid_to ?? null,
        responsible_user_id: d.responsible_user_id ?? null,
        number: d.number ?? null,
        description: d.description ?? null,
        ...patch,
      },
    }),
  );
  return fetchApplication(wsId, id);
}

export function useSetResponsible(wsId: Accessor<string>) {
  const qc = useQueryClient();
  return useMutation(() => ({
    mutationFn: (v: { id: string; userId: string | null }) =>
      putApplicationPatch(wsId(), v.id, { responsible_user_id: v.userId }),
    onMutate: async (v) => {
      const prev = qc.getQueryData<ApplicationSummary[]>(keys.applications(wsId()));
      patchSummary(qc, wsId(), v.id, { responsible_user_id: v.userId });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.applications(wsId()), ctx.prev);
    },
    onSettled: (_d, _e, v) => invalidateApplication(qc, wsId(), v.id),
  }));
}

/**
 * Детали выданных заявок для отчётов (STUB Z-16: до эндпоинта агрегатов —
 * агрегация на клиенте, параллельно не более 6 запросов).
 */
export function useIssuedDetails(wsId: Accessor<string>) {
  return useQuery(() => ({
    queryKey: keys.issuedDetails(wsId()),
    queryFn: async () => {
      const list = (await fetchApplications(wsId())).filter((a) => a.status === "issued" || a.issued_amount);
      return mapLimit(list, 6, (a) => fetchApplication(wsId(), a.id));
    },
    enabled: !!wsId(),
    staleTime: 60_000,
  }));
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
