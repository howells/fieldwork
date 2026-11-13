"use client";

// The playground's Simple mode: header, sidebar, and the task in view or the
// tool guide. On a narrow screen the sidebar opens as a sheet from the
// header's menu button. The shell sits in the app layout, so moving between
// the task and the guide keeps the task, its draft and any run in flight:
// the task view stays mounted, hidden, while a guide page shows.
import { Dialog } from "@base-ui/react/dialog";
import { usePathname, useRouter } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";
import { useState } from "react";

import { isGuide } from "@/lib/guide";
import type { ProviderId, ProviderInfo } from "@/lib/providers";
import type { Starter } from "@/lib/starters";
import { firstUrl, titleFrom } from "@/lib/tasks";

import { AgentView } from "./agent-view";
import { CompareView } from "./compare-view";
import { GuideFrame } from "./guide/guide-frame";
import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { StartView } from "./start-view";
import type { PlaygroundState as State } from "./use-playground";
import { usePlayground } from "./use-playground";

/** Providers whose reads the compare starter tries first, most complete first. */
const READ_ORDER: readonly ProviderId[] = [
  "firecrawl",
  "exa",
  "parallel",
  "tavily",
  "browserbase",
];

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five"];

const stopMonitor = async (
  state: State,
  provider: string,
  id: string
): Promise<void> => {
  const response = await fetch("/api/monitor", {
    body: JSON.stringify({ id, keys: state.settings.browserKeys, provider }),
    headers: { "content-type": "application/json" },
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(
      `Stopping the monitor failed with ${String(response.status)}`
    );
  }
  state.settings.markStopped(id);
};

const start = async (
  state: State,
  providers: readonly ProviderInfo[],
  starter: Starter
): Promise<void> => {
  if (starter.kind === "compare" && starter.url !== undefined) {
    const chosen = READ_ORDER.filter(
      (id) =>
        state.settings.keyed.has(id) &&
        providers.some(
          (provider) => provider.id === id && provider.capabilities.read
        )
    ).slice(0, 3);
    const title = `Compare ${NUMBER_WORDS[chosen.length] ?? String(chosen.length)} ${chosen.length === 1 ? "read" : "reads"}`;
    await state.startCompare(starter.url, chosen, {
      label: starter.label,
      title,
    });
    return;
  }
  await state.startAgent(starter.prompt, starter.title, {
    label: starter.label,
    url: starter.url,
  });
};

const TaskView = ({
  providers,
  state,
}: {
  providers: ProviderInfo[];
  state: State;
}) => {
  const { active, live, settings } = state;
  if (active === undefined) {
    return (
      <StartView
        disabled={state.running}
        onRun={(text) => {
          void state.startAgent(text, titleFrom(text), { url: firstUrl(text) });
        }}
        onStart={(starter) => {
          void start(state, providers, starter);
        }}
        routes={settings.routes}
      />
    );
  }
  if (active.kind === "compare") {
    return (
      <CompareView
        disabled={state.running}
        keys={settings.keys}
        liveEvents={live?.compareEvents}
        onAdd={(provider) => {
          void state.runCompare(active, [provider]);
        }}
        onPrefer={(provider) => {
          const readMany =
            providers.find((item) => item.id === provider)?.capabilities
              .readMany === true;
          settings.prefer(
            readMany
              ? { read: provider, readMany: provider }
              : { read: provider }
          );
        }}
        onStop={state.stop}
        preferred={settings.preferences.read}
        providers={providers}
        task={active}
      />
    );
  }
  return (
    <AgentView
      disabled={state.running}
      liveEvents={live?.events}
      liveStartedAt={live?.startedAt}
      onFollowUp={(question) => {
        void state.followUp(active, question);
      }}
      onRetry={
        state.running
          ? undefined
          : () => {
              void state.retry(active);
            }
      }
      onStop={state.stop}
      onStopMonitor={async (provider, id) => {
        await stopMonitor(state, provider, id);
      }}
      providers={providers}
      stopped={settings.stopped}
      task={active}
    />
  );
};

type SidebarProps = ComponentProps<typeof Sidebar>;

/** The sidebar as a sheet from the left; choosing anything in it closes it. */
const SidebarSheet = ({
  onClose,
  open,
  ...props
}: SidebarProps & { onClose: () => void; open: boolean }) => (
  <Dialog.Root
    onOpenChange={(next) => {
      if (!next) {
        onClose();
      }
    }}
    open={open}
  >
    <Dialog.Portal>
      <Dialog.Backdrop className="bg-ink/20 fixed inset-0 z-40 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 lg:hidden" />
      <Dialog.Popup className="ease-out-quint shadow-float fixed inset-y-0 left-0 z-50 flex w-[min(280px,85vw)] transition-transform duration-300 outline-none data-ending-style:-translate-x-full data-starting-style:-translate-x-full lg:hidden">
        <Dialog.Title className="sr-only">Tasks, guide and keys</Dialog.Title>
        <Sidebar
          {...props}
          className="w-full"
          onAddKey={(provider) => {
            onClose();
            props.onAddKey(provider);
          }}
          onGuide={onClose}
          onNew={() => {
            onClose();
            props.onNew();
          }}
          onOpen={(id) => {
            onClose();
            props.onOpen(id);
          }}
        />
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>
);

export const Playground = ({
  children,
  providers,
}: {
  children: ReactNode;
  providers: ProviderInfo[];
}) => {
  const state = usePlayground(providers);
  const guide = isGuide(usePathname());
  const router = useRouter();
  const [focusKey, setFocusKey] = useState<ProviderId | undefined>();
  const [menuOpen, setMenuOpen] = useState(false);
  const { settings } = state;
  // Choosing a task from the guide goes back to the task view.
  const showTask = (id?: string) => {
    state.setActiveId(id);
    if (guide) {
      router.push("/");
    }
  };
  const sidebar: SidebarProps = {
    activeId: guide ? undefined : state.active?.id,
    keys: settings.keys,
    onAddKey: setFocusKey,
    onNew: () => {
      showTask();
    },
    onOpen: showTask,
    providers,
    running: state.liveTaskId,
    tasks: state.tasks,
  };
  return (
    <div className="flex h-dvh flex-col overflow-hidden lg:min-h-[640px]">
      <Header
        focusKey={focusKey}
        keys={settings.keys}
        model={settings.model}
        onFocusDone={() => {
          setFocusKey(undefined);
        }}
        onMenu={() => {
          setMenuOpen(true);
        }}
        onModel={settings.setModel}
        onSetKey={settings.setKey}
        providers={providers}
        usable={settings.keyed.size}
      />
      <div className="flex min-h-0 grow basis-0">
        <Sidebar
          {...sidebar}
          className="border-rule hidden w-55 border-r lg:flex"
        />
        <SidebarSheet
          {...sidebar}
          onClose={() => {
            setMenuOpen(false);
          }}
          open={menuOpen}
        />
        <main className="flex min-w-0 grow basis-0 flex-col overflow-hidden">
          <div className="flex min-h-0 grow basis-0 flex-col" hidden={guide}>
            <TaskView providers={providers} state={state} />
          </div>
          {guide ? (
            <GuideFrame hasTask={state.active !== undefined}>
              {children}
            </GuideFrame>
          ) : null}
        </main>
      </div>
    </div>
  );
};
