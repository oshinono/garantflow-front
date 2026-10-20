import { A } from "@solidjs/router";
import { For, Show, createMemo, createSignal } from "solid-js";
import { useApplications } from "@/api/queries/applications";
import { useActivity } from "@/api/queries/stubs";
import { PageHeader } from "@/app/PageHeader";
import { useWorkspace } from "@/app/workspace";
import { formatDayLong, formatTime } from "@/domain/dates";
import { applicationNumber } from "@/domain/types";
import { env } from "@/env";
import { EmptyState, Skeleton } from "@/shared/ui/display";
import { Select } from "@/shared/ui/form";

/** Лента активности воркспейса (renderFeed() прототипа). STUB Z-10. */
export default function FeedPage() {
  const ws = useWorkspace();
  const [who, setWho] = createSignal("");
  const feed = useActivity(ws.wsId, who);
  const apps = useApplications(ws.wsId);
  const label = (id: string) => {
    const a = apps.data?.find((x) => x.id === id);
    return a ? `№ ${applicationNumber(a)} · ${a.client_name ?? ""}` : null;
  };
  const grouped = createMemo(() => {
    const out: { day: string; items: NonNullable<typeof feed.data> }[] = [];
    for (const e of feed.data ?? []) {
      const day = formatDayLong(e.at);
      const last = out[out.length - 1];
      if (last?.day === day) last.items.push(e);
      else out.push({ day, items: [e] });
    }
    return out;
  });

  return (
    <>
      <PageHeader
        eyebrow="Активность"
        title="Лента воркспейса"
        description="Кто и что менял в заявках воркспейса."
      />
      <Show
        when={env.useStubs}
        fallback={<EmptyState title="Скоро" text="Лента появится вместе с API журнала активности." />}
      >
        <div class="mb-3.5 flex flex-wrap items-center gap-2">
          <Select
            value={who()}
            onValue={setWho}
            placeholder="Все участники"
            options={ws.members().map((m) => ({ value: m.user_id, label: m.name }))}
            class="!w-auto !max-w-[220px] !px-[9px] !py-[7px] !text-xs"
            aria-label="Участник"
          />
          <span class="text-[11px] text-muted">Показано: {feed.data?.length ?? 0}</span>
        </div>
        <div class="card px-4 py-1.5">
          <Show when={!feed.isLoading} fallback={<Skeleton lines={6} class="py-3" />}>
            <For each={grouped()} fallback={<EmptyState title="Событий пока нет." />}>
              {(g) => (
                <>
                  <div class="pt-3.5 pb-1 text-[11px] font-extrabold tracking-[.04em] text-[#7a8597] uppercase">
                    {g.day}
                  </div>
                  <For each={g.items}>
                    {(e) => (
                      <div class="flex gap-2.5 border-b border-line py-2 text-xs last:border-b-0">
                        <time class="min-w-[48px] text-[10px] whitespace-nowrap text-[#8a94a5]">
                          {formatTime(e.at)}
                        </time>
                        <div>
                          <strong>{e.byName}</strong> · {e.text}
                          <Show when={label(e.applicationId) ?? e.appLabel}>
                            {(l) => (
                              <A
                                href={`/w/${ws.wsId()}/board/${e.applicationId}?tab=history`}
                                class="ml-1 font-[650] text-[#2f56c4] no-underline hover:underline"
                              >
                                {l()}
                              </A>
                            )}
                          </Show>
                        </div>
                      </div>
                    )}
                  </For>
                </>
              )}
            </For>
          </Show>
        </div>
      </Show>
    </>
  );
}
