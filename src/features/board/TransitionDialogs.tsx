import { Show, createEffect, createSignal } from "solid-js";
import type { ApplicationSummary } from "@/domain/types";
import { applicationNumber } from "@/domain/types";
import { Button } from "@/shared/ui/Button";
import { Dialog } from "@/shared/ui/Dialog";
import { Field, SegmentedControl, Textarea } from "@/shared/ui/form";

type SelfAnswer = "yes" | "no" | "unknown";

/** Перенос в «Архив»: причина и «Клиент получил БГ самостоятельно: да / нет / не указано». */
export function ArchiveDialog(props: {
  app: ApplicationSummary | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (v: { reason: string; self: boolean | null }) => void;
}) {
  const [reason, setReason] = createSignal("");
  const [self, setSelf] = createSignal<SelfAnswer>("unknown");
  createEffect(() => {
    if (props.app) {
      setReason("");
      setSelf("unknown");
    }
  });
  return (
    <Dialog
      open={!!props.app}
      onOpenChange={(o) => !o && props.onCancel()}
      title="Перенести в архив"
      description={
        <Show when={props.app}>{(a) => `Заявка № ${applicationNumber(a())} · ${a().client_name ?? ""}`}</Show>
      }
      width={480}
      footer={
        <>
          <Button onClick={() => props.onCancel()}>Отмена</Button>
          <Button
            variant="primary"
            loading={props.busy}
            onClick={() =>
              props.onConfirm({
                reason: reason().trim(),
                self: self() === "unknown" ? null : self() === "yes",
              })
            }
          >
            В архив
          </Button>
        </>
      }
    >
      <div class="grid gap-3.5">
        <Field label="Причина">
          {(id) => (
            <Textarea
              id={id}
              rows={3}
              maxlength={2000}
              value={reason()}
              onValue={setReason}
              placeholder="Например, отказ банков или клиент передумал"
            />
          )}
        </Field>
        <div class="field">
          <span>Клиент получил БГ самостоятельно</span>
          <SegmentedControl
            label="Клиент получил БГ самостоятельно"
            value={self()}
            onChange={(v) => setSelf(v ?? "unknown")}
            options={[
              { value: "yes", label: "Да" },
              { value: "no", label: "Нет" },
              { value: "unknown", label: "Не указано" },
            ]}
            class="w-fit"
          />
        </div>
      </div>
    </Dialog>
  );
}

/** Возврат из «Архива» в работу с комментарием. */
export function ReopenDialog(props: {
  app: ApplicationSummary | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (comment: string) => void;
}) {
  const [comment, setComment] = createSignal("");
  createEffect(() => props.app && setComment(""));
  return (
    <Dialog
      open={!!props.app}
      onOpenChange={(o) => !o && props.onCancel()}
      title="Вернуть в работу"
      description={<Show when={props.app}>{(a) => a().client_name}</Show>}
      width={460}
      footer={
        <>
          <Button onClick={() => props.onCancel()}>Отмена</Button>
          <Button variant="primary" loading={props.busy} onClick={() => props.onConfirm(comment().trim())}>
            Вернуть в работу
          </Button>
        </>
      }
    >
      <Field label="Комментарий">
        {(id) => (
          <Textarea
            id={id}
            rows={3}
            maxlength={2000}
            value={comment()}
            onValue={setComment}
            placeholder="Почему заявка снова в работе"
          />
        )}
      </Field>
    </Dialog>
  );
}
