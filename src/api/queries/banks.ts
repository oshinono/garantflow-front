import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query";
import type { Accessor } from "solid-js";
import type { Bank } from "@/domain/types";
import { api, unwrap } from "../client";
import { getBankInfo, saveBankInfo, type BankInfo } from "../stubs/extras";
import { keys } from "./keys";

export function useBanks(wsId: Accessor<string>, includeInactive: Accessor<boolean> = () => false) {
  return useQuery(() => ({
    queryKey: keys.banks(wsId(), includeInactive()),
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/workspaces/{workspace_id}/banks", {
          params: { path: { workspace_id: wsId() }, query: { include_inactive: includeInactive() } },
        }),
      ),
    enabled: !!wsId(),
    staleTime: 5 * 60_000,
  }));
}

/** Все банки (вкл. неактивные) по id — для подписей в истории и выдачах. */
export function bankName(banks: Bank[] | undefined, id: string | null | undefined): string {
  if (!id) return "Не выбран";
  return banks?.find((b) => b.id === id)?.name ?? "—";
}

export function useCreateBank(wsId: Accessor<string>) {
  const qc = useQueryClient();
  return useMutation(() => ({
    mutationFn: (name: string) =>
      unwrap(
        api.POST("/api/v1/workspaces/{workspace_id}/banks", {
          params: { path: { workspace_id: wsId() } },
          body: { name: name.trim() },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.banksAll(wsId()) }),
  }));
}

export function useRenameBank(wsId: Accessor<string>) {
  const qc = useQueryClient();
  return useMutation(() => ({
    mutationFn: (b: Pick<Bank, "id" | "name">) =>
      unwrap(
        api.PATCH("/api/v1/workspaces/{workspace_id}/banks/{bank_id}", {
          params: { path: { workspace_id: wsId(), bank_id: b.id } },
          body: { name: b.name.trim() },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.banksAll(wsId()) }),
  }));
}

/** Активация/деактивация банка — отдельные эндпоинты, тело не передаётся. */
export function useSetBankActive(wsId: Accessor<string>) {
  const qc = useQueryClient();
  return useMutation(() => ({
    mutationFn: (v: { id: string; active: boolean }) => {
      const params = { path: { workspace_id: wsId(), bank_id: v.id } };
      return unwrap(
        v.active
          ? api.POST("/api/v1/workspaces/{workspace_id}/banks/{bank_id}/activate", { params })
          : api.POST("/api/v1/workspaces/{workspace_id}/banks/{bank_id}/deactivate", { params }),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.banksAll(wsId()) }),
  }));
}

// STUB Z-05
export function useBankInfo(wsId: Accessor<string>) {
  return useQuery(() => ({
    queryKey: keys.stub(wsId(), "bank-info"),
    queryFn: () => getBankInfo(wsId()),
    enabled: !!wsId(),
  }));
}

// STUB Z-05
export function useSaveBankInfo(wsId: Accessor<string>) {
  return useMutation(() => ({
    mutationFn: (v: { bankId: string; info: BankInfo }) => saveBankInfo(wsId(), v.bankId, v.info),
  }));
}
