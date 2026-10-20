import { X } from "lucide-solid";
import { For, Show } from "solid-js";
import { useTemplateMutations, useTemplates } from "@/api/queries/stubs";
import { useWorkspace } from "@/app/workspace";
import { env } from "@/env";
import { Button } from "@/shared/ui/Button";
import { Dialog, confirmDialog } from "@/shared/ui/Dialog";
import { BUILT_IN_TEMPLATES, templateSummary } from "./templates";

export function TemplatesDialog(props: { open: boolean; onClose: () => void; onPick: (id: string) => void }) {
  const ws = useWorkspace();
  const user = useTemplates(ws.wsId);
  const { remove } = useTemplateMutations(ws.wsId);
  const all = () => [...BUILT_IN_TEMPLATES, ...(env.useStubs ? (user.data ?? []) : [])];

  const del = async (id: string, name: string) => {
    if (
      await confirmDialog({
        title: "Удалить шаблон?",
        text: `Шаблон «${name}» будет удалён.`,
        confirmLabel: "Удалить",
        danger: true,
      })
    )
      remove.mutate(id);
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={(o) => !o && props.onClose()}
      title="Новая заявка из шаблона"
      description="Шаблон заполнит тип закупки, вид БГ, срок и банк. Свой шаблон можно сохранить из формы заявки."
      width={480}
      footer={<Button onClick={() => props.onClose()}>Закрыть</Button>}
    >
      <div class="grid gap-2">
        <For each={all()}>
          {(t) => (
            <div class="flex items-stretch gap-1.5">
              <button
                type="button"
                class="btn block flex-1 !justify-start text-left text-xs !whitespace-normal"
                onClick={() => props.onPick(t.id)}
              >
                <strong class="block">{t.name}</strong>
                <span class="text-[11px] text-muted">{templateSummary(t)}</span>
              </button>
              <Show when={!t.builtIn && ws.can("template.manage")}>
                <Button
                  size="icon"
                  variant="subtle"
                  class="self-center"
                  aria-label={`Удалить шаблон ${t.name}`}
                  onClick={() => void del(t.id, t.name)}
                >
                  <X size={15} />
                </Button>
              </Show>
            </div>
          )}
        </For>
      </div>
    </Dialog>
  );
}
