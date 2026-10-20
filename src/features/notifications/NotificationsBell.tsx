import { useNavigate } from "@solidjs/router";
import { Bell } from "lucide-solid";
import { For, Show, createSignal } from "solid-js";
import { useMarkNotificationRead, useNotifications } from "@/api/queries/stubs";
import { useAuth } from "@/app/auth";
import { useWorkspace } from "@/app/workspace";
import { formatStamp } from "@/domain/dates";
import { env } from "@/env";
import { cn } from "@/shared/lib/cn";
import { Dialog } from "@/shared/ui/Dialog";
import { Button } from "@/shared/ui/Button";

/** Колокольчик уведомлений с упоминаниями. STUB Z-11. */
export function NotificationsBell() {
  const auth = useAuth();
  const ws = useWorkspace();
  const navigate = useNavigate();
  const notes = useNotifications(ws.wsId, () => auth.user()?.id);
  const markRead = useMarkNotificationRead(ws.wsId);
  const [open, setOpen] = createSignal(false);
  const unread = () => notes.data?.filter((n) => !n.read).length ?? 0;

  const openNote = async (id: string, applicationId: string) => {
    await markRead.mutateAsync(id);
    setOpen(false);
    navigate(`/w/${ws.wsId()}/board/${applicationId}?tab=banks`);
  };

  return (
    <Show when={env.useStubs}>
      <button
        type="button"
        class="btn relative"
        onClick={() => setOpen(true)}
        aria-label={unread() ? `Уведомления, непрочитанных: ${unread()}` : "Уведомления"}
        title="Уведомления"
      >
        <Bell size={16} />
        <Show when={unread()}>
          <span class="absolute -top-[5px] -right-[5px] rounded-full bg-[#d92d20] px-[5px] py-px text-[9px] font-extrabold text-white">
            {unread()}
          </span>
        </Show>
      </button>
      <Dialog
        open={open()}
        onOpenChange={setOpen}
        title="Уведомления"
        width={460}
        footer={<Button onClick={() => setOpen(false)}>Закрыть</Button>}
      >
        <Show
          when={notes.data?.length}
          fallback={
            <p class="text-sm text-muted">
              Упоминаний пока нет. Напишите @Имя в комментарии, чтобы уведомить коллегу.
            </p>
          }
        >
          <For each={notes.data}>
            {(n) => (
              <button
                type="button"
                class={cn(
                  "btn mt-2 block w-full !justify-start text-left text-xs !whitespace-normal",
                  !n.read && "!border-accent-line !bg-[#f4f7ff]",
                )}
                onClick={() => void openNote(n.id, n.applicationId)}
              >
                <span class="block">
                  <strong>{n.byName}</strong> упомянул(а) вас в заявке «{n.appTitle}»
                </span>
                <span class="block text-[11px] text-muted">{formatStamp(n.at)}</span>
                <span class="mt-1 block">{n.text}</span>
              </button>
            )}
          </For>
        </Show>
      </Dialog>
    </Show>
  );
}
