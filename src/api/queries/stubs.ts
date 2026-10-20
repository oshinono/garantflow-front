import { useMutation, useQuery } from "@tanstack/solid-query";
import type { Accessor } from "solid-js";
import {
  listActivity,
  listApplicationHistory,
  listNotifications,
  markNotificationRead,
} from "../stubs/collab";
import {
  addFiles,
  createPreset,
  createTemplate,
  deleteFile,
  deletePreset,
  deleteTemplate,
  listFiles,
  listPresets,
  listTemplates,
  type FilterPreset,
  type TemplateFields,
} from "../stubs/extras";
import { keys } from "./keys";

// STUB Z-09
export function useApplicationHistory(wsId: Accessor<string>, applicationId: Accessor<string>) {
  return useQuery(() => ({
    queryKey: keys.stub(wsId(), "history", applicationId()),
    queryFn: () => listApplicationHistory(wsId(), applicationId()),
    enabled: !!applicationId(),
  }));
}

// STUB Z-10
export function useActivity(wsId: Accessor<string>, userId: Accessor<string>) {
  return useQuery(() => ({
    queryKey: keys.stub(wsId(), "activity", userId()),
    queryFn: () => listActivity(wsId(), { userId: userId() || undefined, limit: 150 }),
    enabled: !!wsId(),
  }));
}

// STUB Z-11
export function useNotifications(wsId: Accessor<string>, userId: Accessor<string | undefined>) {
  return useQuery(() => ({
    queryKey: keys.stub(wsId(), "notifications", userId()),
    queryFn: () => listNotifications(wsId(), userId()!),
    enabled: !!wsId() && !!userId(),
  }));
}

// STUB Z-11
export function useMarkNotificationRead(wsId: Accessor<string>) {
  return useMutation(() => ({ mutationFn: (id: string) => markNotificationRead(wsId(), id) }));
}

// STUB Z-06
export function useFiles(wsId: Accessor<string>, applicationId: Accessor<string>) {
  return useQuery(() => ({
    queryKey: keys.stub(wsId(), "files", applicationId()),
    queryFn: () => listFiles(wsId(), applicationId()),
    enabled: !!applicationId(),
  }));
}

// STUB Z-06
export function useFileMutations(wsId: Accessor<string>) {
  const add = useMutation(() => ({
    mutationFn: (v: { applicationId: string; files: File[]; authorName: string; guaranteeId?: string }) =>
      addFiles(wsId(), v.applicationId, v.files, v.authorName, v.guaranteeId),
  }));
  const remove = useMutation(() => ({ mutationFn: (id: string) => deleteFile(wsId(), id) }));
  return { add, remove };
}

// STUB Z-14
export function useTemplates(wsId: Accessor<string>) {
  return useQuery(() => ({ queryKey: keys.stub(wsId(), "templates"), queryFn: () => listTemplates(wsId()) }));
}

// STUB Z-14
export function useTemplateMutations(wsId: Accessor<string>) {
  const create = useMutation(() => ({
    mutationFn: (v: { name: string; fields: TemplateFields }) => createTemplate(wsId(), v.name, v.fields),
  }));
  const remove = useMutation(() => ({ mutationFn: (id: string) => deleteTemplate(wsId(), id) }));
  return { create, remove };
}

// STUB Z-15
export function usePresets(wsId: Accessor<string>) {
  return useQuery(() => ({ queryKey: keys.stub(wsId(), "presets"), queryFn: () => listPresets(wsId()) }));
}

// STUB Z-15
export function usePresetMutations(wsId: Accessor<string>) {
  const create = useMutation(() => ({
    mutationFn: (v: { name: string; filters: FilterPreset["filters"] }) =>
      createPreset(wsId(), v.name, v.filters),
  }));
  const remove = useMutation(() => ({ mutationFn: (id: string) => deletePreset(wsId(), id) }));
  return { create, remove };
}
