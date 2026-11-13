"use client";

// The header: the lockup, the mode switch, the model picker and the keys
// menu, as the Paper header draws them.
import { Menu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { DOCS_SITE, GUIDE_ROOT, isGuide } from "@/lib/guide";
import { MODELS, modelLabel, routerId } from "@/lib/models";
import type { ProviderId, ProviderInfo } from "@/lib/providers";

import { Chevron, Mark, Menu as MenuIcon, Tick } from "./icons";
import { KeyList } from "./keys";

const CONTROL =
  "hit-area flex h-7 shrink-0 items-center gap-1.5 rounded-control border border-rule bg-paper px-2 transition-colors duration-150 hover:border-rule-strong data-popup-open:border-rule-strong";

const POPUP =
  "origin-(--transform-origin) rounded-panel border border-rule bg-paper shadow-float outline-none transition-[opacity,scale] duration-150 ease-out-quint data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0";

const ModeSwitch = () => (
  <div className="rounded-group border-rule bg-wash hidden items-center gap-px border p-0.5 md:flex">
    <span className="rounded-control bg-paper shadow-control type-label strong flex h-6 items-center px-2.5">
      Simple
    </span>
    <button
      className="rounded-control text-graphite type-label flex h-6 items-center px-2.5"
      disabled
      title="Advanced comes next"
      type="button"
    >
      Advanced
    </button>
  </div>
);

interface ModelPickerProps {
  model: string;
  onChange: (id: string) => void;
}

const ModelPicker = ({ model, onChange }: ModelPickerProps) => (
  <Menu.Root>
    <Menu.Trigger className={CONTROL}>
      <span className="text-graphite type-body hidden sm:inline">Model</span>
      <span className="type-body strong whitespace-nowrap">
        {modelLabel(model)}
      </span>
      <Chevron />
    </Menu.Trigger>
    <Menu.Portal>
      <Menu.Positioner
        align="end"
        className="z-30 outline-none"
        collisionPadding={8}
        sideOffset={6}
      >
        <Menu.Popup
          className={`${POPUP} flex w-[min(640px,calc(100vw-16px))] flex-col p-1`}
        >
          {MODELS.map((choice) => (
            <Menu.Item
              className="rounded-control data-highlighted:bg-wash flex h-11 shrink-0 cursor-default items-center gap-3 px-2 outline-none sm:h-7"
              key={choice.id}
              onClick={() => {
                onChange(choice.id);
              }}
            >
              <span className="type-body strong w-[104px] shrink-0">
                {choice.label}
              </span>
              <span className="text-graphite type-label min-w-0 grow basis-0 truncate">
                {choice.note}
              </span>
              <span className="text-muted type-code hidden w-[196px] shrink-0 truncate md:inline">
                {routerId(choice.id)}
              </span>
              <span className="text-ink flex w-3.5 shrink-0 justify-center">
                {choice.id === model ? <Tick /> : null}
              </span>
            </Menu.Item>
          ))}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  </Menu.Root>
);

interface KeysMenuProps {
  focus?: ProviderId;
  keys: Readonly<Record<string, string>>;
  onFocusDone: () => void;
  onSetKey: (provider: ProviderId, value: string) => void;
  providers: readonly ProviderInfo[];
  usable: number;
}

const KeysMenu = ({
  focus,
  keys,
  onFocusDone,
  onSetKey,
  providers,
  usable,
}: KeysMenuProps) => {
  const [open, setOpen] = useState(false);
  const shown = open || focus !== undefined;
  return (
    <Popover.Root
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          onFocusDone();
        }
      }}
      open={shown}
    >
      <Popover.Trigger className={CONTROL}>
        <span className="figures type-body strong whitespace-nowrap">
          {usable} of {providers.length} keys
        </span>
        <Chevron />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          align="end"
          className="z-30 outline-none"
          collisionPadding={8}
          sideOffset={6}
        >
          <Popover.Popup
            className={`${POPUP} flex w-[min(400px,calc(100vw-16px))] flex-col p-1`}
          >
            <div className="border-rule mb-1 flex flex-col gap-0.5 border-b px-2 pt-1.5 pb-2">
              <Popover.Title className="type-body strong">Keys</Popover.Title>
              <Popover.Description className="text-graphite type-label">
                A key you add stays in this browser and goes only to its
                provider.
              </Popover.Description>
            </div>
            <KeyList
              focus={focus}
              keys={keys}
              onSetKey={onSetKey}
              providers={providers}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
};

export interface HeaderProps {
  focusKey?: ProviderId;
  onMenu: () => void;
  keys: Readonly<Record<string, string>>;
  model: string;
  onFocusDone: () => void;
  onModel: (id: string) => void;
  onSetKey: (provider: ProviderId, value: string) => void;
  providers: readonly ProviderInfo[];
  usable: number;
}

const GuideLink = () => {
  const current = isGuide(usePathname());
  return (
    <Link
      aria-current={current ? "page" : undefined}
      className="text-graphite type-body hover:text-ink aria-[current=page]:text-ink aria-[current=page]:strong inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center px-1.5 whitespace-nowrap transition-colors duration-150"
      href={GUIDE_ROOT}
    >
      <span className="sm:hidden">Guide</span>
      <span className="hidden sm:inline">Tool guide</span>
    </Link>
  );
};

export const Header = ({
  focusKey,
  keys,
  model,
  onFocusDone,
  onMenu,
  onModel,
  onSetKey,
  providers,
  usable,
}: HeaderProps) => (
  <header className="border-rule bg-paper flex h-11 shrink-0 items-center justify-between gap-3 border-b px-2 lg:px-3">
    <div className="flex min-w-0 grow basis-0 items-center gap-2">
      <button
        aria-label="Tasks, guide and keys"
        className="hit-area rounded-control hover:bg-wash flex size-7 shrink-0 items-center justify-center lg:hidden"
        onClick={onMenu}
        type="button"
      >
        <MenuIcon />
      </button>
      <Mark className="ml-1 hidden size-4.5 shrink-0 min-[360px]:block" />
      <span className="type-body strong hidden sm:inline">Fieldwork</span>
      <span
        aria-hidden
        className="bg-rule hidden h-3.5 w-px shrink-0 lg:block"
      />
      <span className="text-graphite type-body hidden lg:inline">
        Playground
      </span>
    </div>
    <ModeSwitch />
    <div className="flex grow basis-0 items-center justify-end gap-1.5 sm:gap-2">
      <ModelPicker model={model} onChange={onModel} />
      <KeysMenu
        focus={focusKey}
        keys={keys}
        onFocusDone={onFocusDone}
        onSetKey={onSetKey}
        providers={providers}
        usable={usable}
      />
      <GuideLink />
      <a
        className="text-graphite type-body hover:text-ink hidden min-h-11 items-center px-1.5 transition-colors duration-150 sm:inline-flex"
        href={`${DOCS_SITE}/docs`}
        rel="noreferrer"
        target="_blank"
      >
        Docs
      </a>
    </div>
  </header>
);
