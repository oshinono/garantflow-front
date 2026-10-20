import { useParams } from "@solidjs/router";
import { type ParentProps, createContext, createEffect, useContext } from "solid-js";
import { useMembers, useWorkspaces, type MemberWithUser } from "@/api/queries/workspaces";
import { type Action, can } from "@/domain/permissions";
import type { Workspace, WorkspaceRole } from "@/domain/types";
import { LAST_WORKSPACE_KEY, local } from "@/shared/lib/storage";
import { useAuth } from "./auth";

type WorkspaceContextValue = {
  wsId: () => string;
  workspace: () => Workspace | undefined;
  workspaces: () => Workspace[];
  role: () => WorkspaceRole | null;
  can: (action: Action) => boolean;
  members: () => MemberWithUser[];
  memberName: (userId: string | null | undefined) => string;
  me: () => { id: string; name: string };
  loading: () => boolean;
  notFound: () => boolean;
};

const WorkspaceContext = createContext<WorkspaceContextValue>();

export function WorkspaceProvider(props: ParentProps) {
  const params = useParams<{ workspaceId: string }>();
  const auth = useAuth();
  const wsId = () => params.workspaceId ?? "";
  const workspacesQ = useWorkspaces();
  const membersQ = useMembers(wsId);
  const workspace = () => workspacesQ.data?.find((w) => w.id === wsId());

  createEffect(() => {
    if (workspace()) local.set(LAST_WORKSPACE_KEY, wsId());
  });

  const value: WorkspaceContextValue = {
    wsId,
    workspace,
    workspaces: () => workspacesQ.data ?? [],
    role: () => workspace()?.role ?? null,
    can: (action) => can(workspace()?.role, action),
    members: () => membersQ.data ?? [],
    memberName: (id) => {
      if (!id) return "Не назначен";
      return membersQ.data?.find((m) => m.user_id === id)?.name ?? "Бывший участник";
    },
    me: () => ({ id: auth.user()?.id ?? "", name: auth.user()?.full_name || auth.user()?.email || "Участник" }),
    loading: () => workspacesQ.isLoading,
    notFound: () => workspacesQ.isSuccess && !workspace(),
  };

  return <WorkspaceContext.Provider value={value}>{props.children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace outside WorkspaceProvider");
  return ctx;
}
