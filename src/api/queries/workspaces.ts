import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query";
import type { Accessor } from "solid-js";
import type { Invitation, Member, Workspace, WorkspaceRole } from "@/domain/types";
import { api, unwrap } from "../client";
import { getWorkspaceOverride } from "../stubs/extras";
import { stubVersion } from "../stubs/storage";
import { keys } from "./keys";

/** Воркспейс с учётом локального переименования/скрытия (STUB Z-12). */
export function applyOverride(ws: Workspace): Workspace & { hidden?: boolean } {
  const o = getWorkspaceOverride(ws.id);
  return { ...ws, name: o.name || ws.name, hidden: o.hidden };
}

export function fetchWorkspaces() {
  return unwrap(api.GET("/api/v1/workspaces"));
}

export function useWorkspaces(enabled: Accessor<boolean> = () => true) {
  return useQuery(() => {
    const version = stubVersion();
    return {
      queryKey: keys.workspaces,
      queryFn: fetchWorkspaces,
      // Локальные переименования (Z-12) применяются поверх ответа API.
      select: (list: Workspace[]) => (void version, list.map(applyOverride).filter((w) => !w.hidden)),
      enabled: enabled(),
      staleTime: 60_000,
    };
  });
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation(() => ({
    mutationFn: (name: string) => unwrap(api.POST("/api/v1/workspaces", { body: { name } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.workspaces }),
  }));
}

export type MemberWithUser = Member & { name: string; email: string };

export function useMembers(wsId: Accessor<string>) {
  const qc = useQueryClient();
  return useQuery(() => ({
    queryKey: keys.members(wsId()),
    queryFn: async (): Promise<MemberWithUser[]> => {
      // Список участников есть только в ответе воркспейса (GET /workspaces/{id}.members).
      const ws = await unwrap(
        api.GET("/api/v1/workspaces/{workspace_id}", { params: { path: { workspace_id: wsId() } } }),
      );
      return Promise.all(
        ws.members.map(async (m) => {
          const user = await qc.fetchQuery({
            queryKey: keys.user(m.user_id),
            queryFn: () =>
              unwrap(api.GET("/api/v1/users/{user_id}", { params: { path: { user_id: m.user_id } } })),
            staleTime: 10 * 60_000,
          });
          return { ...m, name: user.full_name, email: user.email };
        }),
      );
    },
    enabled: !!wsId(),
    staleTime: 60_000,
  }));
}

export function useUpdateMemberRole(wsId: Accessor<string>) {
  const qc = useQueryClient();
  return useMutation(() => ({
    mutationFn: (v: { userId: string; role: WorkspaceRole }) =>
      unwrap(
        api.PATCH("/api/v1/workspaces/{workspace_id}/members/{user_id}", {
          params: { path: { workspace_id: wsId(), user_id: v.userId } },
          body: { role: v.role },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.members(wsId()) }),
  }));
}

export function useRemoveMember(wsId: Accessor<string>) {
  const qc = useQueryClient();
  return useMutation(() => ({
    mutationFn: (userId: string) =>
      unwrap(
        api.DELETE("/api/v1/workspaces/{workspace_id}/members/{user_id}", {
          params: { path: { workspace_id: wsId(), user_id: userId } },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.members(wsId()) }),
  }));
}

export function useInvitations(wsId: Accessor<string>, enabled: Accessor<boolean>) {
  return useQuery(() => ({
    queryKey: keys.invitations(wsId()),
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/workspaces/{workspace_id}/invitations", {
          params: { path: { workspace_id: wsId() } },
        }),
      ),
    enabled: !!wsId() && enabled(),
  }));
}

function createInvitation(wsId: string, email: string, role: WorkspaceRole) {
  return unwrap(
    api.POST("/api/v1/workspaces/{workspace_id}/invitations", {
      params: { path: { workspace_id: wsId } },
      body: { email, role },
    }),
  );
}

function revokeInvitation(wsId: string, id: string) {
  return unwrap(
    api.DELETE("/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}", {
      params: { path: { workspace_id: wsId, invitation_id: id } },
    }),
  );
}

export function useInvite(wsId: Accessor<string>) {
  const qc = useQueryClient();
  return useMutation(() => ({
    mutationFn: (v: { email: string; role: WorkspaceRole }) =>
      createInvitation(wsId(), v.email.trim(), v.role),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.invitations(wsId()) }),
  }));
}

export function useRevokeInvitation(wsId: Accessor<string>) {
  const qc = useQueryClient();
  return useMutation(() => ({
    mutationFn: (id: string) => revokeInvitation(wsId(), id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.invitations(wsId()) }),
  }));
}

/**
 * STUB Z-17 — повторная отправка приглашения.
 * Предлагаемый контракт: POST /api/v1/workspaces/{ws}/invitations/{id}/resend.
 * До него — отзыв и новое приглашение на тот же адрес и роль.
 */
export function useResendInvitation(wsId: Accessor<string>) {
  const qc = useQueryClient();
  return useMutation(() => ({
    mutationFn: async (inv: Invitation) => {
      await revokeInvitation(wsId(), inv.id);
      return createInvitation(wsId(), inv.email, inv.role);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.invitations(wsId()) }),
  }));
}
