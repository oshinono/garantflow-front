import { Paperclip, Trash2, Upload } from "lucide-solid";
import { For, Show, createMemo, createSignal } from "solid-js";
import { useApplicationHistory, useFileMutations, useFiles } from "@/api/queries/stubs";
import { useWorkspace } from "@/app/workspace";
import { formatStamp } from "@/domain/dates";
import { STATUS_LABELS } from "@/domain/types";
import { env } from "@/env";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/Button";
import { confirmDialog } from "@/shared/ui/Dialog";
import { logAppActivity } from "./activity";
import { useApp } from "./context";

/** Вложения заявки (STUB Z-06: хранятся только метаданные). */
export function FilesTab() {
  const ws = useWorkspace();
  const app = useApp();
  const detail = () => app.detail()!;
  const files = useFiles(ws.wsId, () => detail().id);
  const ops = useFileMutations(ws.wsId);
  const [over, setOver] = createSignal(false);

  const add = (list: File[]) => {
    if (!list.length) return;
    ops.add.mutate(
      { applicationId: detail().id, files: list, authorName: ws.me().name },
      {
        onSuccess: () =>
          logAppActivity(
            ws.wsId(),
            detail(),
            ws.me(),
            list.map((f) => `Вложение добавлено: ${f.name}`),
          ),
      },
    );
  };
  const del = async (id: string, name: string) => {
    if (!(await confirmDialog({ title: "Удалить файл?", text: name, confirmLabel: "Удалить", danger: true })))
      return;
    ops.remove.mutate(id, {
      onSuccess: () => logAppActivity(ws.wsId(), detail(), ws.me(), [`Вложение удалено: ${name}`]),
    });
  };

  return (
    <div>
      <h3 class="m-0 mb-[5px] text-sm font-bold">Вложения</h3>
      <p class="m-0 mb-3 text-[11px] text-muted">Документы по заявке и сканы гарантий.</p>
      <Show
        when={env.useStubs}
        fallback={<p class="text-sm text-muted">Скоро: загрузка файлов появится вместе с API хранения.</p>}
      >
        <Show when={!app.readOnly()}>
          <label
            class={cn(
              "flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed border-[#cdd4df] px-4 py-6 text-center text-xs text-muted hover:border-accent-line",
              over() && "border-accent bg-accent-soft",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              add([...(e.dataTransfer?.files ?? [])]);
            }}
          >
            <Upload size={20} />
            <span>
              Перетащите файлы сюда или <span class="font-semibold text-accent">выберите на компьютере</span>
            </span>
            <span class="text-[10px] text-faint">
              Пока сохраняются только названия и размеры (заглушка Z-06)
            </span>
            <input
              type="file"
              multiple
              class="sr-only"
              onChange={(e) => {
                add([...(e.currentTarget.files ?? [])]);
                e.currentTarget.value = "";
              }}
            />
          </label>
        </Show>
        <For each={files.data} fallback={<div class="mt-2.5 text-[11px] text-faint">Файлов пока нет.</div>}>
          {(f) => (
            <div class="mt-2 flex items-center justify-between gap-2.5 rounded-[9px] border border-line px-2.5 py-2 text-xs">
              <span class="flex min-w-0 items-center gap-1.5">
                <Paperclip size={14} class="flex-none text-muted" />
                <strong class="truncate">{f.name}</strong>
                <span class="text-[11px] text-muted">
                  {Math.max(1, Math.round(f.size / 1024))} КБ · {f.authorName} · {formatStamp(f.at)}
                  {f.guaranteeId ? " · скан БГ" : ""}
                </span>
              </span>
              <Show when={!app.readOnly()}>
                <Button
                  size="sm"
                  variant="danger"
                  aria-label={`Удалить ${f.name}`}
                  onClick={() => void del(f.id, f.name)}
                >
                  <Trash2 size={14} />
                </Button>
              </Show>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}

/** История: status_history из API + журнал изменений полей (STUB Z-09), новые сверху. */
export function HistoryTab() {
  const ws = useWorkspace();
  const app = useApp();
  const detail = () => app.detail()!;
  const log = useApplicationHistory(ws.wsId, () => detail().id);
  const items = createMemo(() => {
    const status = detail().status_history.map((h) => ({
      at: h.changed_at,
      by: h.changed_by_user_id ? ws.memberName(h.changed_by_user_id) : "Система",
      text: h.from_status
        ? `Статус: ${STATUS_LABELS[h.from_status]} → ${STATUS_LABELS[h.to_status]}${h.comment ? ` · ${h.comment}` : ""}`
        : "Заявка создана",
      source: "api" as const,
    }));
    // Статусные записи журнала дублируют status_history — оставляем серверные.
    const fields = (env.useStubs ? (log.data ?? []) : [])
      .filter((e) => !e.text.startsWith("Статус:"))
      .map((e) => ({ at: e.at, by: e.byName, text: e.text, source: "log" as const }));
    return [...status, ...fields].sort((a, b) => b.at.localeCompare(a.at));
  });
  return (
    <div>
      <h3 class="m-0 mb-[5px] text-sm font-bold">История изменений</h3>
      <p class="m-0 mb-3 text-[11px] text-muted">Кто, когда и что менял в заявке.</p>
      <For
        each={items()}
        fallback={
          <div class="text-[11px] text-faint">Изменений пока нет. Они появятся после сохранения.</div>
        }
      >
        {(x) => (
          <div class="flex gap-2.5 border-b border-line py-2 text-xs">
            <time class="min-w-[118px] text-[10px] whitespace-nowrap text-[#8a94a5]">
              {formatStamp(x.at)}
            </time>
            <div>
              <strong>{x.by}</strong> · {x.text}
            </div>
          </div>
        )}
      </For>
    </div>
  );
}
