import { useNavigate } from "@solidjs/router";
import { Pencil, Plus, Trash2 } from "lucide-solid";
import { For, Show, createMemo, createSignal } from "solid-js";
import { errorMessage } from "@/api/errors";
import { useApplications } from "@/api/queries/applications";
import {
  useCreateWorkspace,
  useInvitations,
  useInvite,
  useRemoveMember,
  useResendInvitation,
  useRevokeInvitation,
  useUpdateMemberRole,
} from "@/api/queries/workspaces";
import {
  DEFAULT_COLUMN_COLORS,
  deleteWorkspace,
  getColumnColors,
  renameWorkspace,
  saveColumnColors,
} from "@/api/stubs/extras";
import { stubVersion } from "@/api/stubs/storage";
import { PageHeader } from "@/app/PageHeader";
import { useWorkspace } from "@/app/workspace";
import { formatDate } from "@/domain/dates";
import { PERMISSIONS, type Action } from "@/domain/permissions";
import { ROLE_LABELS, STATUSES, STATUS_LABELS, type Workspace, type WorkspaceRole } from "@/domain/types";
import { env } from "@/env";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/Button";
import { Dialog, confirmDialog, promptDialog } from "@/shared/ui/Dialog";
import { Avatar, EmptyState, Pill, Skeleton } from "@/shared/ui/display";
import { Field, Input, Select } from "@/shared/ui/form";
import { toast } from "@/shared/ui/Toast";

const ROLES: WorkspaceRole[] = ["OWNER", "ADMIN", "MEMBER"];

export default function SettingsPage() {
  const ws = useWorkspace();
  return (
    <>
      <PageHeader
        eyebrow="Рабочая среда"
        title="Воркспейсы"
        description="Пространства, их настройки, участники и права доступа."
      />
      <WorkspacesSection />
      <div class="mt-6 mb-3">
        <h2 class="m-0 mb-[5px] text-[15px] font-bold">Настройки воркспейса</h2>
        <p class="m-0 text-xs text-muted">
          Текущее пространство: <strong>{ws.workspace()?.name}</strong>.
          {ws.can("workspace.manage") ? "" : " Для изменения нужна роль владельца."}
        </p>
      </div>
      <ColumnColors />
      <div class="mt-6 mb-3">
        <h2 class="m-0 mb-[5px] text-[15px] font-bold">Участники и права доступа</h2>
        <p class="m-0 text-xs text-muted">
          Текущее пространство: <strong>{ws.workspace()?.name}</strong>.
        </p>
      </div>
      <MembersSection />
      <Show when={ws.can("member.invite")}>
        <InvitationsSection />
      </Show>
      <PermissionsTable />
    </>
  );
}

function WorkspacesSection() {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const apps = useApplications(ws.wsId);
  const create = useCreateWorkspace();
  const [open, setOpen] = createSignal(false);
  const [name, setName] = createSignal("");

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!name().trim()) return;
    try {
      const created = await create.mutateAsync(name().trim());
      setOpen(false);
      setName("");
      toast("Воркспейс создан.");
      navigate(`/w/${created.id}/settings`);
    } catch (err) {
      toast(errorMessage(err));
    }
  };

  // STUB Z-12: переименование и удаление воркспейса.
  const rename = async (w: Workspace) => {
    const next = await promptDialog({
      title: "Переименовать воркспейс",
      label: "Новое название",
      initial: w.name,
      maxLength: 255,
    });
    if (next && next !== w.name) {
      await renameWorkspace(w.id, next);
      toast("Название воркспейса обновлено.");
    }
  };
  const remove = async (w: Workspace) => {
    if (ws.workspaces().length <= 1) return toast("Нельзя удалить последний доступный воркспейс.");
    const ok = await confirmDialog({
      title: "Удалить воркспейс?",
      text: `Воркспейс «${w.name}» вместе с его заявками будет удалён. Это действие нельзя отменить.`,
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!ok) return;
    await deleteWorkspace(w.id);
    toast("Воркспейс удалён.");
    if (w.id === ws.wsId()) navigate("/");
  };

  return (
    <div class="card mb-1.5 p-[18px]">
      <div class="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 class="m-0 mb-[5px] text-[15px] font-bold">Ваши рабочие пространства</h2>
          <p class="m-0 text-xs text-muted">
            Каждое пространство хранит собственные заявки и участников. Нажмите на карточку, чтобы
            переключиться.
          </p>
        </div>
        <Button
          variant="primary"
          size="icon"
          aria-label="Создать воркспейс"
          title="Создать воркспейс"
          onClick={() => setOpen(true)}
        >
          <Plus size={18} />
        </Button>
      </div>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-3">
        <For each={ws.workspaces()}>
          {(w) => {
            const active = () => w.id === ws.wsId();
            return (
              <article
                class={cn(
                  "card min-w-0 cursor-pointer p-4 transition-colors hover:border-[#c9d6f4]",
                  active() && "!border-[#b9ccf5] !bg-[#f8faff]",
                )}
                role="button"
                tabindex="0"
                aria-label={`Открыть ${w.name}`}
                onClick={() => navigate(`/w/${w.id}/settings`)}
                onKeyDown={(e) => e.key === "Enter" && navigate(`/w/${w.id}/settings`)}
              >
                <div class="flex items-start gap-2.5">
                  <Avatar
                    name={w.name}
                    square
                    size={38}
                    class="!rounded-[11px] !bg-accent-soft !text-accent"
                  />
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-1 text-[13px] font-[750] [overflow-wrap:anywhere]">
                      <span class="mr-0.5">{w.name}</span>
                      <Show when={w.role === "OWNER" && env.useStubs}>
                        <button
                          type="button"
                          class="grid size-[26px] place-items-center rounded-[7px] border-0 bg-transparent text-[#7a8597] hover:bg-[#eef2f9] hover:text-accent"
                          aria-label={`Переименовать ${w.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            void rename(w);
                          }}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          class="grid size-[26px] place-items-center rounded-[7px] border-0 bg-transparent text-[#7a8597] hover:bg-[#fdecec] hover:text-[#c0362c]"
                          aria-label={`Удалить ${w.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            void remove(w);
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </Show>
                      <Show when={active()}>
                        <Pill tone="blue" class="ml-1">
                          Текущий
                        </Pill>
                      </Show>
                    </div>
                    <div class="mt-1 text-[11px] text-muted">
                      <Show when={active()}>{apps.data?.length ?? 0} заявок · </Show>роль:{" "}
                      {ROLE_LABELS[w.role]}
                    </div>
                  </div>
                </div>
              </article>
            );
          }}
        </For>
      </div>
      <Dialog
        open={open()}
        onOpenChange={setOpen}
        title="Новый воркспейс"
        description="Например, отдельное пространство для другой команды, проекта или группы клиентов."
        width={440}
      >
        <form onSubmit={submit}>
          <Field label="Название пространства">
            {(id) => (
              <Input
                id={id}
                maxlength={255}
                placeholder="Например, Корпоративные клиенты"
                value={name()}
                onValue={setName}
                autofocus
              />
            )}
          </Field>
          <div class="mt-[21px] flex justify-end gap-2 border-t border-line pt-[15px]">
            <Button onClick={() => setOpen(false)}>Отмена</Button>
            <Button type="submit" variant="primary" loading={create.isPending} disabled={!name().trim()}>
              Создать
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

/** Цвета колонок доски — STUB Z-13. */
function ColumnColors() {
  const ws = useWorkspace();
  const colors = createMemo(() => (void stubVersion(), getColumnColors(ws.wsId())));
  const can = () => ws.can("workspace.manage");
  return (
    <div class="card mb-[15px] p-[18px]">
      <div class="mb-[13px] flex items-start justify-between gap-3">
        <div>
          <h3 class="m-0 text-sm font-bold">Цвета колонок доски</h3>
          <p class="mt-[3px] mb-0 text-xs text-muted">
            Этапы соответствуют статусам API: «В работе», «Выданные», «Архив».
          </p>
        </div>
        <Show when={can() && env.useStubs}>
          <Button size="sm" onClick={() => void saveColumnColors(ws.wsId(), null)}>
            Сбросить цвета
          </Button>
        </Show>
      </div>
      <Show when={env.useStubs} fallback={<p class="text-xs text-muted">Скоро.</p>}>
        <div class="flex flex-wrap gap-3">
          <For each={STATUSES}>
            {(st) => (
              <label class="flex items-center gap-[9px] rounded-[10px] border border-line bg-white px-3 py-2 text-xs font-[650]">
                <input
                  type="color"
                  class="h-7 w-[34px] cursor-pointer rounded-[7px] border border-line bg-white p-0.5"
                  value={colors()[st]}
                  disabled={!can()}
                  aria-label={`Цвет колонки ${STATUS_LABELS[st]}`}
                  onChange={(e) =>
                    void saveColumnColors(ws.wsId(), {
                      ...colors(),
                      [st]: e.currentTarget.value.toUpperCase(),
                    })
                  }
                />
                {STATUS_LABELS[st]}
                <Show when={colors()[st].toUpperCase() !== DEFAULT_COLUMN_COLORS[st]}>
                  <span class="text-[10px] font-normal text-muted">изменён</span>
                </Show>
              </label>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function MembersSection() {
  const ws = useWorkspace();
  const updateRole = useUpdateMemberRole(ws.wsId);
  const remove = useRemoveMember(ws.wsId);

  const del = async (userId: string, name: string) => {
    const ok = await confirmDialog({
      title: "Удалить участника?",
      text: `${name} потеряет доступ к воркспейсу.`,
      confirmLabel: "Удалить",
      danger: true,
    });
    if (ok)
      remove.mutate(userId, {
        onSuccess: () => toast("Участник удалён."),
        onError: (e) => toast(errorMessage(e)),
      });
  };

  return (
    <div class="card mb-[15px] p-[18px]">
      <h3 class="m-0 text-sm font-bold">Участники воркспейса</h3>
      <p class="mt-[3px] mb-2 text-xs text-muted">Роль владельца назначается при создании воркспейса.</p>
      <Show when={ws.members().length} fallback={<Skeleton lines={3} class="py-3" />}>
        <For each={ws.members()}>
          {(m) => (
            <div class="grid grid-cols-[minmax(150px,1.4fr)_minmax(160px,.8fr)_auto] items-center gap-3.5 border-b border-line-soft py-4 last:border-b-0 max-sm:grid-cols-[1fr_auto] max-sm:gap-[9px]">
              <div class="flex min-w-0 items-center gap-2.5">
                <Avatar name={m.name || m.email} />
                <div class="min-w-0">
                  <strong class="block text-xs [overflow-wrap:anywhere]">
                    {m.name}
                    {m.user_id === ws.me().id ? " · вы" : ""}
                  </strong>
                  <span class="block text-[11px] [overflow-wrap:anywhere] text-muted">{m.email}</span>
                </div>
              </div>
              <div class="max-sm:col-span-1">
                <Show
                  when={ws.can("member.role") && m.role !== "OWNER" && m.user_id !== ws.me().id}
                  fallback={<Pill tone={m.role === "OWNER" ? "blue" : "gray"}>{ROLE_LABELS[m.role]}</Pill>}
                >
                  <Select
                    value={m.role}
                    aria-label={`Роль ${m.name}`}
                    class="!p-2 !text-xs"
                    options={ROLES.filter((r) => r !== "OWNER").map((r) => ({
                      value: r,
                      label: ROLE_LABELS[r],
                    }))}
                    onValue={(v) =>
                      updateRole.mutate(
                        { userId: m.user_id, role: v as WorkspaceRole },
                        { onSuccess: () => toast("Роль обновлена."), onError: (e) => toast(errorMessage(e)) },
                      )
                    }
                  />
                </Show>
              </div>
              <div class="justify-self-end max-sm:col-start-2 max-sm:row-start-1">
                <Show when={ws.can("member.remove") && m.role !== "OWNER" && m.user_id !== ws.me().id}>
                  <Button
                    size="sm"
                    variant="subtle"
                    class="!text-danger"
                    onClick={() => void del(m.user_id, m.name)}
                  >
                    Удалить
                  </Button>
                </Show>
              </div>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}

function InvitationsSection() {
  const ws = useWorkspace();
  const invitations = useInvitations(ws.wsId, () => ws.can("member.invite"));
  const invite = useInvite(ws.wsId);
  const revoke = useRevokeInvitation(ws.wsId);
  const resend = useResendInvitation(ws.wsId);
  const [email, setEmail] = createSignal("");
  const [role, setRole] = createSignal<WorkspaceRole>("MEMBER");
  const expired = (iso: string) => new Date(iso) < new Date();

  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email().trim())) return toast("Укажите корректный email.");
    invite.mutate(
      { email: email(), role: role() },
      {
        onSuccess: () => {
          setEmail("");
          toast("Приглашение отправлено.");
        },
        onError: (err) => toast(errorMessage(err)),
      },
    );
  };

  return (
    <>
      <div class="card mb-[15px] p-[18px]">
        <h3 class="m-0 mb-[5px] text-sm font-bold">Пригласить участника</h3>
        <p class="m-0 mb-3.5 text-[11px] text-muted">
          На почту придёт письмо со ссылкой. Приглашение действует ограниченное время.
        </p>
        <form
          class="grid grid-cols-[minmax(180px,1fr)_170px_auto] items-end gap-[9px] max-sm:grid-cols-1"
          onSubmit={submit}
        >
          <label class="field">
            Email участника
            <Input
              type="email"
              placeholder="colleague@company.ru"
              value={email()}
              onValue={setEmail}
              autocomplete="off"
            />
          </label>
          <label class="field">
            Роль
            <Select
              value={role()}
              options={[
                { value: "MEMBER", label: ROLE_LABELS.MEMBER },
                { value: "ADMIN", label: ROLE_LABELS.ADMIN },
              ]}
              onValue={(v) => setRole(v as WorkspaceRole)}
            />
          </label>
          <Button type="submit" variant="primary" loading={invite.isPending}>
            Отправить приглашение
          </Button>
        </form>
      </div>
      <div class="card mb-[15px] p-[18px]">
        <h3 class="m-0 mb-[5px] text-sm font-bold">Приглашения</h3>
        <p class="m-0 mb-3.5 text-[11px] text-muted">Ожидающие приглашения и срок их действия.</p>
        <Show when={!invitations.isLoading} fallback={<Skeleton lines={2} />}>
          <div class="grid gap-2">
            <For each={invitations.data} fallback={<EmptyState title="Ожидающих приглашений нет" />}>
              {(inv) => (
                <div class="flex flex-wrap items-center gap-2.5 rounded-[10px] border border-line bg-[#fafbfc] px-3 py-[11px]">
                  <Avatar name={inv.email} />
                  <div class="min-w-0">
                    <div class="text-xs font-[650] [overflow-wrap:anywhere]">{inv.email}</div>
                    <div class="text-[11px] text-muted">
                      Роль: {ROLE_LABELS[inv.role]} · до {formatDate(inv.expires_at)}
                    </div>
                  </div>
                  <span class="flex-1" />
                  <Pill tone={expired(inv.expires_at) ? "red" : "amber"}>
                    {expired(inv.expires_at) ? "Истекло" : "Ожидает"}
                  </Pill>
                  <Button
                    size="sm"
                    loading={resend.isPending && resend.variables?.id === inv.id}
                    onClick={() =>
                      resend.mutate(inv, {
                        onSuccess: () => toast(`Приглашение для ${inv.email} отправлено повторно.`),
                        onError: (e) => toast(errorMessage(e)),
                      })
                    }
                  >
                    Отправить повторно
                  </Button>
                  <Button
                    size="sm"
                    variant="subtle"
                    class="!text-danger"
                    onClick={() => revoke.mutate(inv.id, { onSuccess: () => toast("Приглашение отозвано.") })}
                  >
                    Отозвать
                  </Button>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </>
  );
}

function PermissionsTable() {
  const actions = Object.keys(PERMISSIONS) as Action[];
  return (
    <div class="card mb-[15px] p-[18px]">
      <h3 class="m-0 mb-[5px] text-sm font-bold">Справочник прав</h3>
      <p class="m-0 mb-3.5 text-[11px] text-muted">Что может каждая роль в воркспейсе.</p>
      <div class="w-full overflow-auto rounded-[11px] border border-line">
        <table class="data-table">
          <thead>
            <tr>
              <th>Действие</th>
              <For each={ROLES}>{(r) => <th class="!text-center">{ROLE_LABELS[r]}</th>}</For>
            </tr>
          </thead>
          <tbody>
            <For each={actions}>
              {(a) => (
                <tr>
                  <td class="!whitespace-normal">{PERMISSIONS[a].label}</td>
                  <For each={ROLES}>
                    {(r) => {
                      const ok = (PERMISSIONS[a].roles as readonly WorkspaceRole[]).includes(r);
                      return (
                        <td class={cn("!text-center", ok ? "text-ok" : "text-faint")}>
                          {ok ? "✓" : "—"}
                          <span class="sr-only">{ok ? "разрешено" : "нет"}</span>
                        </td>
                      );
                    }}
                  </For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </div>
  );
}
