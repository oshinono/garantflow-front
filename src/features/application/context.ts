import { createContext, useContext } from "solid-js";
import type { SetStoreFunction } from "solid-js/store";
import type { ApplicationDraft, DraftErrors } from "@/domain/application-form";
import type { ApplicationDetail, Bank } from "@/domain/types";

export type IssuancePrefill = { bankId: string; commission: string | null } | null;

export type ApplicationCtx = {
  isNew: () => boolean;
  detail: () => ApplicationDetail | undefined;
  draft: ApplicationDraft;
  setDraft: SetStoreFunction<ApplicationDraft>;
  errors: () => DraftErrors;
  readOnly: () => boolean;
  banks: () => Bank[];
  bankName: (id: string | null | undefined) => string;
  prefill: () => IssuancePrefill;
  setPrefill: (p: IssuancePrefill) => void;
  /** Выбор банка заведения из вкладки «Банки» (Z-08): сохраняется сразу. */
  pickPrimaryBank: (bankId: string) => void;
  goTab: (tab: TabId) => void;
};

export type TabId = "data" | "issuance" | "banks" | "files" | "history";

export const ApplicationContext = createContext<ApplicationCtx>();

export function useApp(): ApplicationCtx {
  const ctx = useContext(ApplicationContext);
  if (!ctx) throw new Error("useApp outside ApplicationContext");
  return ctx;
}
