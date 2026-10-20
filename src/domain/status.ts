import type { ApplicationStatus } from "./types";

/**
 * Что делает перенос карточки между колонками доски.
 * - archive: диалог причины → POST /archive
 * - reopen: из «Архива» в «В работе» → диалог комментария → POST /reopen
 * - issue: открывает карточку на вкладке «Выдача», статус меняется после сохранения гарантии
 * - forbidden: в API перехода нет (например, «Выданные» → «В работе»)
 */
export type TransitionKind = "same" | "archive" | "reopen" | "issue" | "forbidden";

export function transitionKind(from: ApplicationStatus, to: ApplicationStatus): TransitionKind {
  if (from === to) return "same";
  if (to === "archived") return from === "in_progress" ? "archive" : "forbidden";
  if (to === "in_progress") return from === "archived" ? "reopen" : "forbidden";
  if (to === "issued") return from === "in_progress" ? "issue" : "forbidden";
  return "forbidden";
}

export function forbiddenTransitionHint(from: ApplicationStatus, to: ApplicationStatus): string {
  if (from === "issued" && to === "in_progress") return "Выданную заявку нельзя вернуть в работу.";
  if (from === "issued" && to === "archived") return "Выданную заявку нельзя перенести в архив.";
  if (from === "archived" && to === "issued") return "Сначала верните заявку в работу.";
  return "Такой переход статуса недоступен.";
}
