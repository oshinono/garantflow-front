import { useNavigate } from "@solidjs/router";
import { AtSign, Flame, FolderKanban, UserX } from "lucide-solid";
import { For, type JSX, Show, createMemo } from "solid-js";
import { errorMessage } from "@/api/errors";
import { useApplications } from "@/api/queries/applications";
import { useMarkNotificationRead, useNotifications } from "@/api/queries/stubs";
import { PageHeader } from "@/app/PageHeader";
import { useWorkspace } from "@/app/workspace";
import { daysUntil, deadlineTag } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import { type ApplicationSummary, LAW_KIND_LABELS, applicationNumber, lawKindOf } from "@/domain/types";
import { env } from "@/env";
import { ErrorState, KpiCard, Pill, SkeletonCards } from "@/shared/ui/display";

export function TodayPage() {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const apps = useApplications(ws.wsId);
  const notes = useNotifications(ws.wsId, () => ws.me().id);
  const markRead = useMarkNotificationRead(ws.wsId);

  const data = createMemo(() => {
    const me = ws.me().id;
    const work = (apps.data ?? []).filter((a) => a.status === "in_progress");
    const days = (a: ApplicationSummary) => daysUntil(a.application_deadline);
    const hot = work
      .filter((a) => (days(a) ?? Infinity) <= 3)
      .sort((x, y) => (days(x) ?? 0) - (days(y) ?? 0));
    return {
      mine: work.filter((a) => a.responsible_user_id === me),
      mineHot: hot.filter((a) => a.responsible_user_id === me),
      otherHot: hot.filter((a) => a.responsible_user_id !== me),
      unowned: work.filter((a) => !a.responsible_user_id),
    };
  });
  const unread = () => (notes.data ?? []).filter((n) => !n.read);
  const open = (id: string, tab = "data") => navigate(`/w/${ws.wsId()}/board/${id}?tab=${tab}`);

  const Row = (p: { a: ApplicationSummary }) => {
    const tag = () => deadlineTag(daysUntil(p.a.application_deadline));
    return (
      <button
        type="button"
        class="mt-2 flex w-full items-center justify-between gap-2.5 rounded-[10px] border border-line bg-white px-3 py-2.5 text-left text-xs hover:border-accent-line hover:bg-[#f8faff]"
        onClick={() => open(p.a.id)}
      >
        <span>
          <strong>
            № {applicationNumber(p.a)} · {p.a.client_name || "Без названия"}
          </strong>
          <span class="text-[11px] text-muted">
            {" "}
            {LAW_KIND_LABELS[lawKindOf(p.a)]} · {formatMoney(p.a.requested_amount)}
          </span>
        </span>
        <Show when={tag()}>{(t) => <Pill tone={t().tone}>{t().text}</Pill>}</Show>
      </button>
    );
  };

  const Section = (p: {
    title: string;
    list: ApplicationSummary[];
    empty: string;
    max?: number;
    children?: JSX.Element;
  }) => (
    <div class="card mt-3.5 p-[18px]">
      <h3 class="m-0 text-sm font-bold">{p.title}</h3>
      <Show when={p.list.length} fallback={<div class="mt-2 text-[11px] text-faint">{p.empty}</div>}>
        <For each={p.list.slice(0, p.max ?? p.list.length)}>{(a) => <Row a={a} />}</For>
        <Show when={p.max && p.list.length > p.max}>
          <div class="mt-2 text-[11px] text-muted">и ещё {p.list.length - (p.max ?? 0)}</div>
        </Show>
      </Show>
    </div>
  );

  return (
    <>
      <PageHeader
        eyebrow="Старт"
        title="Сегодня"
        description="Ваши сроки, упоминания и заявки, которым нужно внимание."
      />
      <Show
        when={!apps.isError}
        fallback={<ErrorState message={errorMessage(apps.error)} onRetry={() => void apps.refetch()} />}
      >
        <Show
          when={!apps.isLoading}
          fallback={<SkeletonCards count={4} class="grid-cols-4 max-md:grid-cols-2" />}
        >
          <div class="mb-[17px] grid grid-cols-4 gap-[13px] max-md:grid-cols-2 max-sm:gap-[9px]">
            <KpiCard
              label="Мои заявки в работе"
              value={data().mine.length}
              icon={<FolderKanban size={16} />}
            />
            <KpiCard label="Горят сроки (мои)" value={data().mineHot.length} icon={<Flame size={16} />} />
            <KpiCard
              label="Новые упоминания"
              value={env.useStubs ? unread().length : "—"}
              icon={<AtSign size={16} />}
            />
            <KpiCard label="Без ответственного" value={data().unowned.length} icon={<UserX size={16} />} />
          </div>
          <Section title="Мои горящие заявки" list={data().mineHot} empty="Срочных заявок нет." />
          <Show when={unread().length}>
            <div class="card mt-3.5 p-[18px]">
              <h3 class="m-0 text-sm font-bold">Упоминания</h3>
              <For each={unread()}>
                {(n) => (
                  <button
                    type="button"
                    class="mt-2 flex w-full items-center justify-between gap-2.5 rounded-[10px] border border-line bg-white px-3 py-2.5 text-left text-xs hover:border-accent-line hover:bg-[#f8faff]"
                    onClick={() => {
                      markRead.mutate(n.id);
                      open(n.applicationId, "banks");
                    }}
                  >
                    <span>
                      <strong>{n.byName}</strong> · {n.appTitle}
                      <br />
                      <span class="text-[11px] text-muted">{n.text}</span>
                    </span>
                  </button>
                )}
              </For>
            </div>
          </Show>
          <Section
            title="Горящие в воркспейсе (не мои)"
            list={data().otherHot}
            empty="Больше срочных заявок нет."
          />
          <Show when={data().unowned.length}>
            <Section title="Без ответственного" list={data().unowned} empty="" max={8} />
          </Show>
        </Show>
      </Show>
    </>
  );
}
