import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query";
import type { Accessor } from "solid-js";
import type { BankRequest, BankRequestPayload, GuaranteePayload } from "@/domain/types";
import { api, unwrap } from "../client";
import { addComment, editComment, listComments, type Author } from "../stubs/collab";
import { getOffers, saveOffer, type BankOffer } from "../stubs/extras";
import { invalidateApplication } from "./applications";
import { keys } from "./keys";

export function createBankRequest(
  wsId: string,
  applicationId: string,
  body: BankRequestPayload & { bank_id: string },
) {
  return unwrap(
    api.POST("/api/v1/workspaces/{workspace_id}/applications/{application_id}/bank-requests", {
      params: { path: { workspace_id: wsId, application_id: applicationId } },
      body,
    }),
  );
}

/** Полная замена полей запроса в банк. */
export function bankRequestPayload(br: BankRequest): BankRequestPayload {
  return {
    external_number: br.external_number ?? null,
    requested_amount: br.requested_amount ?? null,
    sent_at: br.sent_at ?? null,
    decision_at: br.decision_at ?? null,
    offer_received: br.offer_received ?? null,
    rejection_reason: br.rejection_reason ?? null,
    notes: br.notes ?? null,
  };
}

export function useBankRequestMutations(wsId: Accessor<string>, applicationId: Accessor<string>) {
  const qc = useQueryClient();
  const done = () => invalidateApplication(qc, wsId(), applicationId());
  const create = useMutation(() => ({
    mutationFn: (bankId: string) =>
      createBankRequest(wsId(), applicationId(), { bank_id: bankId, sent_at: null }),
    onSuccess: done,
  }));
  const update = useMutation(() => ({
    mutationFn: (v: { id: string; body: BankRequestPayload }) =>
      unwrap(
        api.PUT(
          "/api/v1/workspaces/{workspace_id}/applications/{application_id}/bank-requests/{bank_request_id}",
          {
            params: {
              path: { workspace_id: wsId(), application_id: applicationId(), bank_request_id: v.id },
            },
            body: v.body,
          },
        ),
      ),
    onSuccess: done,
  }));
  const remove = useMutation(() => ({
    mutationFn: (id: string) =>
      unwrap(
        api.DELETE(
          "/api/v1/workspaces/{workspace_id}/applications/{application_id}/bank-requests/{bank_request_id}",
          { params: { path: { workspace_id: wsId(), application_id: applicationId(), bank_request_id: id } } },
        ),
      ),
    onSuccess: done,
  }));
  return { create, update, remove };
}

export function useGuaranteeMutations(wsId: Accessor<string>, applicationId: Accessor<string>) {
  const qc = useQueryClient();
  const done = () => invalidateApplication(qc, wsId(), applicationId());
  const save = useMutation(() => ({
    mutationFn: (v: { id: string | null; body: GuaranteePayload }) =>
      v.id
        ? unwrap(
            api.PUT(
              "/api/v1/workspaces/{workspace_id}/applications/{application_id}/guarantees/{guarantee_id}",
              {
                params: { path: { workspace_id: wsId(), application_id: applicationId(), guarantee_id: v.id } },
                body: v.body,
              },
            ),
          )
        : unwrap(
            api.POST("/api/v1/workspaces/{workspace_id}/applications/{application_id}/guarantees", {
              params: { path: { workspace_id: wsId(), application_id: applicationId() } },
              body: v.body,
            }),
          ),
    onSuccess: done,
  }));
  const remove = useMutation(() => ({
    mutationFn: (id: string) =>
      unwrap(
        api.DELETE(
          "/api/v1/workspaces/{workspace_id}/applications/{application_id}/guarantees/{guarantee_id}",
          { params: { path: { workspace_id: wsId(), application_id: applicationId(), guarantee_id: id } } },
        ),
      ),
    onSuccess: done,
  }));
  return { save, remove };
}

// STUB Z-03
export function useComments(wsId: Accessor<string>, applicationId: Accessor<string>) {
  return useQuery(() => ({
    queryKey: keys.stub(wsId(), "comments", applicationId()),
    queryFn: () => listComments(wsId(), applicationId()),
    enabled: !!applicationId(),
  }));
}

// STUB Z-03
export function useCommentMutations(wsId: Accessor<string>) {
  const add = useMutation(() => ({
    mutationFn: (v: { applicationId: string; bankRequestId: string; text: string; author: Author }) =>
      addComment(wsId(), v),
  }));
  const edit = useMutation(() => ({
    mutationFn: (v: { id: string; text: string; editor: Author }) =>
      editComment(wsId(), v.id, v.text, v.editor),
  }));
  return { add, edit };
}

// STUB Z-04
export function useOffers(wsId: Accessor<string>) {
  return useQuery(() => ({ queryKey: keys.stub(wsId(), "offers"), queryFn: () => getOffers(wsId()) }));
}

// STUB Z-04
export function useSaveOffer(wsId: Accessor<string>) {
  return useMutation(() => ({
    mutationFn: (v: { bankRequestId: string; offer: BankOffer }) =>
      saveOffer(wsId(), v.bankRequestId, v.offer),
  }));
}
