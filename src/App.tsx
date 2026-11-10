import { useEffect } from "react";
import * as Tip from "@radix-ui/react-tooltip";
import { Toaster, toast } from "sonner";
import { t } from "./lib/i18n";
import { useStore } from "./store";
import { api } from "./lib/api";
import { Sidebar } from "./components/Sidebar";
import { TodayView } from "./components/TodayView";
import { PlanDetail } from "./components/PlanDetail";
import { AllPlansView, ProjectView } from "./components/ListViews";
import {
  ArchiveProjectDialog,
  CommandMenu,
  NewPlanDialog,
  NewProjectDialog,
  PasteChatDialog,
} from "./components/Dialogs";
import { SettingsView } from "./components/Setup";
import { Onboarding } from "./components/Onboarding";
import { RoutinesView } from "./components/RoutinesView";
import { DivulgacaoView } from "./components/DivulgacaoView";
import { ResumosView } from "./components/ResumosView";
import { DiscordView } from "./components/DiscordView";
import { ConsoleView } from "./components/ConsoleView";

function Main() {
  const view = useStore((s) => s.view);
  return (
    <main className="relative flex h-full min-w-0 flex-1 flex-col bg-[var(--bg)] shadow-[-1px_0_0_var(--border)]">
      <div data-tauri-drag-region className="h-[38px] flex-none" />
      {view.kind === "console" ? (
        <div className="min-h-0 flex-1">
          <ConsoleView />
        </div>
      ) : (
        <div data-main-scroll className="scroll-area flex-1">
          <div
            key={
              view.kind === "plan"
                ? view.id
                : view.kind === "project"
                  ? view.slug
                  : view.kind
            }
            className="animate-fade"
          >
            {view.kind === "today" && <TodayView />}
            {view.kind === "all" && <AllPlansView />}
            {view.kind === "project" && <ProjectView slug={view.slug} />}
            {view.kind === "plan" && <PlanDetail id={view.id} />}
            {view.kind === "settings" && <SettingsView />}
            {view.kind === "routines" && <RoutinesView />}
            {view.kind === "divulgacao" && <DivulgacaoView />}
            {view.kind === "resumos" && <ResumosView />}
            {view.kind === "discord" && <DiscordView />}
          </div>
        </div>
      )}
    </main>
  );
}

export default function App() {
  const ready = useStore((s) => s.ready);
  const exists = useStore((s) => s.ws?.exists);
  const onboarding = useStore((s) => s.onboarding);
  const lang = useStore((s) => s.lang);
  const load = useStore((s) => s.load);

  useEffect(() => {
    load();
    let unlisten: (() => void) | undefined;
    api.onChange(() => load()).then((u) => (unlisten = u));
    let unlistenPush: (() => void) | undefined;
    api
      .onPushFailed((erro) =>
        toast.error(t("Não consegui enviar os planos ao remoto", "Couldn't push the plans to the remote"), {
          id: "git-push",
          description: t(`O commit ficou salvo neste Mac. Erro do git: ${erro.slice(0, 200)}`, `The commit is saved on this Mac. Git error: ${erro.slice(0, 200)}`),
          duration: 12000,
        }),
      )
      .then((u) => (unlistenPush = u));
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      unlisten?.();
      unlistenPush?.();
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey) return;
      const s = useStore.getState();
      const k = e.key.toLowerCase();
      if (k === "k") {
        e.preventDefault();
        s.setPalette(!s.paletteOpen);
      } else if (k === "n") {
        e.preventDefault();
        s.openNewPlan(s.view.kind === "project" ? s.view.slug : null);
      } else if (k === "1") {
        e.preventDefault();
        s.go({ kind: "today" });
      } else if (k === "2") {
        e.preventDefault();
        s.go({ kind: "all" });
      } else if (k === "3") {
        e.preventDefault();
        s.go({ kind: "routines" });
      } else if (k === "4") {
        e.preventDefault();
        s.go({ kind: "divulgacao" });
      } else if (k === "5") {
        e.preventDefault();
        s.go({ kind: "discord" });
      } else if (k === "6" || k === "j") {
        e.preventDefault();
        s.go({ kind: "console" });
      } else if (k === ",") {
        e.preventDefault();
        s.go({ kind: "settings" });
      } else if (k === "r") {
        e.preventDefault();
        s.load();
      } else if (k === "[") {
        e.preventDefault();
        s.back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!ready) return <div className="h-full bg-[var(--bg)]" />;


  return (
    <Tip.Provider>
      <span data-app-ready hidden />
      {exists && !onboarding ? (
        <div key={lang} className="flex h-full">
          <Sidebar />
          <Main />
        </div>
      ) : (
        <Onboarding />
      )}
      <CommandMenu />
      <NewPlanDialog />
      <NewProjectDialog />
      <ArchiveProjectDialog />
      <PasteChatDialog />
      <Toaster
        position="bottom-right"
        toastOptions={{
          className:
            "!rounded-[10px] !border-0 !bg-[var(--bg)] !text-[var(--text)] !shadow-[var(--shadow-pop)] !text-[13px]",
          descriptionClassName: "!text-[var(--text-2)]",
        }}
      />
    </Tip.Provider>
  );
}
