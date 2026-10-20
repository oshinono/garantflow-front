import { A, useLocation, useNavigate } from "@solidjs/router";
import {
  Activity,
  CalendarCheck,
  ChartColumn,
  ChevronLeft,
  Landmark,
  LogOut,
  SquareKanban,
  Users,
} from "lucide-solid";
import { type JSX, type ParentProps, For, Show, createSignal } from "solid-js";
import { useApplications } from "@/api/queries/applications";
import { cn } from "@/shared/lib/cn";
import { SIDEBAR_KEY, local } from "@/shared/lib/storage";
import { Avatar } from "@/shared/ui/display";
import { useAuth } from "./auth";
import { useWorkspace } from "./workspace";

type NavItem = { path: string; label: string; icon: () => JSX.Element; count?: () => number | undefined };

export function AppShell(props: ParentProps) {
  const auth = useAuth();
  const ws = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  const apps = useApplications(ws.wsId);
  const [collapsed, setCollapsed] = createSignal(local.get(SIDEBAR_KEY) === "1");

  const toggle = () => {
    const next = !collapsed();
    setCollapsed(next);
    local.set(SIDEBAR_KEY, next ? "1" : "0");
  };

  const nav: NavItem[] = [
    { path: "today", label: "Сегодня", icon: () => <CalendarCheck size={18} /> },
    { path: "board", label: "Доска", icon: () => <SquareKanban size={18} />, count: () => apps.data?.length },
    { path: "feed", label: "Лента", icon: () => <Activity size={18} /> },
    { path: "reports", label: "Отчёты", icon: () => <ChartColumn size={18} /> },
    { path: "banks", label: "Банки", icon: () => <Landmark size={18} /> },
    { path: "settings", label: "Воркспейсы", icon: () => <Users size={18} /> },
  ];

  const isActive = (path: string) => location.pathname.startsWith(`/w/${ws.wsId()}/${path}`);

  const switchWorkspace = (id: string) => {
    const section = location.pathname.split("/")[3] || "today";
    navigate(`/w/${id}/${section === "board" ? "board" : section}`);
  };

  return (
    <div
      class={cn(
        "grid min-h-screen max-sm:block",
        collapsed()
          ? "grid-cols-[76px_minmax(0,1fr)]"
          : "grid-cols-[258px_minmax(0,1fr)] max-lg:grid-cols-[228px_minmax(0,1fr)]",
      )}
    >
      <aside
        class={cn(
          "sticky top-0 z-[12] flex h-screen min-h-[560px] flex-col gap-[19px] overflow-y-auto border-r border-line bg-white px-3.5 pt-[22px] pb-3.5",
          "max-lg:px-2.5 max-lg:pt-[18px] max-lg:pb-3",
          "max-sm:relative max-sm:h-auto max-sm:min-h-0 max-sm:gap-3 max-sm:overflow-visible max-sm:border-r-0 max-sm:border-b max-sm:p-3",
          collapsed() && "gap-3.5 overflow-x-hidden !px-2",
        )}
        aria-label="Боковое меню"
      >
        <div
          class={cn(
            "flex min-w-0 items-center gap-2.5 px-[7px] pb-[7px] max-sm:px-[3px] max-sm:pb-0.5",
            collapsed() && "flex-col justify-center !px-0 sm:gap-2.5",
          )}
        >
          <div class="grid size-9 flex-none place-items-center rounded-[11px] bg-[linear-gradient(140deg,#3a69dc,#2349a6)] text-[13px] font-extrabold tracking-[-0.5px] text-white shadow-[0_4px_12px_#315fce30]">
            БГ
          </div>
          <Show when={!collapsed()}>
            <div class="min-w-0">
              <div class="text-[13px] font-[750] tracking-[-0.25px]">Учёт заявок на БГ</div>
              <div class="mt-[3px] text-[10px] text-muted">Рабочее пространство</div>
            </div>
          </Show>
          <button
            type="button"
            class={cn(
              "ml-auto grid size-[30px] flex-none place-items-center rounded-lg border border-line bg-white p-0 text-[#536176] hover:border-[#cbd5e1] hover:bg-[#f5f7fb] max-sm:hidden",
              collapsed() && "m-0 rotate-180",
            )}
            onClick={toggle}
            aria-label={collapsed() ? "Развернуть меню" : "Свернуть меню"}
            title={collapsed() ? "Развернуть меню" : "Свернуть меню"}
          >
            <ChevronLeft size={18} />
          </button>
        </div>

        <Show when={!collapsed()}>
          <div>
            <div class="mb-[7px] px-[9px] text-[9px] font-extrabold tracking-[1px] text-[#98a2b3]">
              ТЕКУЩИЙ ВОРКСПЕЙС
            </div>
            <select
              class="control !bg-[#f8f9fc] !py-2.5 !text-xs font-semibold"
              aria-label="Рабочее пространство"
              value={ws.wsId()}
              onChange={(e) => switchWorkspace(e.currentTarget.value)}
            >
              <For each={ws.workspaces()}>
                {(w) => (
                  <option value={w.id} selected={w.id === ws.wsId()}>
                    {w.name}
                  </option>
                )}
              </For>
            </select>
          </div>
          <div class="-mb-3 px-[9px] text-[9px] font-extrabold tracking-[1px] text-[#98a2b3] max-sm:hidden">
            РАБОТА
          </div>
        </Show>

        <nav class="grid gap-1 max-sm:flex max-sm:flex-wrap max-sm:gap-[5px]" aria-label="Основная навигация">
          <For each={nav}>
            {(item) => (
              <A
                href={`/w/${ws.wsId()}/${item.path}`}
                class={cn(
                  "flex w-full items-center gap-2.5 rounded-[9px] border border-transparent px-[11px] py-2.5 text-left text-xs font-semibold text-[#566276] no-underline hover:border-[#edf0f5] hover:bg-[#f5f7fb]",
                  "max-sm:w-auto max-sm:flex-auto max-sm:px-2.5 max-sm:py-[9px]",
                  isActive(item.path) && "!border-[#dfe8ff] !bg-accent-soft font-[750] !text-accent-fg",
                  collapsed() && "min-h-[42px] justify-center gap-0 !px-1",
                )}
                aria-current={isActive(item.path) ? "page" : undefined}
                title={item.label}
                aria-label={collapsed() ? item.label : undefined}
              >
                <span class="flex w-[21px] justify-center">{item.icon()}</span>
                <Show when={!collapsed()}>
                  <span>{item.label}</span>
                  <Show when={item.count?.() != null}>
                    <span class="ml-auto rounded-full border border-[#dfe7f8] bg-white px-1.5 py-0.5 text-[10px] text-[#5370ad]">
                      {item.count?.()}
                    </span>
                  </Show>
                </Show>
              </A>
            )}
          </For>
        </nav>

        <div
          class={cn(
            "mt-auto flex min-w-0 items-center gap-[9px] border-t border-line px-1.5 pt-3 pb-0.5 max-sm:mt-0 max-sm:pt-[9px]",
            collapsed() && "flex-col !px-0",
          )}
        >
          <Avatar name={auth.user()?.full_name || auth.user()?.email} size={32} />
          <Show when={!collapsed()}>
            <div class="min-w-0 flex-1">
              <div class="truncate text-[11px] font-[650]">{auth.user()?.full_name}</div>
              <div class="truncate text-[10px] text-muted">{auth.user()?.email}</div>
            </div>
          </Show>
          <button
            type="button"
            class="grid size-[31px] place-items-center rounded-lg border-0 bg-transparent p-0 text-muted hover:bg-hover hover:text-fg"
            onClick={() => void auth.logout()}
            title="Выйти из аккаунта"
            aria-label="Выйти из аккаунта"
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div class="min-h-screen min-w-0 max-sm:min-h-0">
        <main class="w-full px-[clamp(18px,2vw,32px)] pt-[27px] pb-[50px] max-lg:px-[18px] max-lg:pt-[22px] max-lg:pb-10 max-sm:px-3 max-sm:pt-[18px] max-sm:pb-8">
          {props.children}
        </main>
      </div>
    </div>
  );
}
