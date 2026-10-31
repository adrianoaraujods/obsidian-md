"use client";

import { PreviewCard } from "@base-ui/react/preview-card";
import Link from "next/link";
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { PREVIEW_PROPERTIES_KEY } from "react-obsidian-md";
import { PreviewBody } from "@/components/typography/preview-body";
import { Properties } from "@/components/typography/properties";
import { fetchPreviewPayload } from "@/lib/preview-client";
import { slicePreviewHtml } from "@/lib/preview-slice";
import type { PreviewPayload } from "@/lib/preview-types";
import { slugKey } from "@/lib/slug-key";

/**
 * Lets a preview tell the one that holds it (the link it sits in belongs to
 * that preview's body) that it closed, so the parent can close too when the
 * pointer left everything while the nested preview was keeping it open.
 */
const ChildClosedContext = createContext<(() => void) | null>(null);

type Part = "trigger" | "popup";
type Input = "pointer" | "focus";

const OPEN_DELAY = 300;
const CLOSE_DELAY = 150;

function PreviewContent({
  payload,
  subpath,
}: {
  payload: PreviewPayload;
  subpath: string | undefined;
}) {
  const html = slicePreviewHtml(payload.html, subpath);

  return (
    <div className="p-4">
      <Properties
        defaultOpen={false}
        noFlash={false}
        properties={payload.properties}
        storageKey={PREVIEW_PROPERTIES_KEY}
      />
      <div className="markdown-rendered prose text-sm">
        <PreviewBody html={html} />
      </div>
    </div>
  );
}

const HOVER_QUERY = "(hover: hover)";

function subscribeHover(onChange: () => void) {
  const query = window.matchMedia(HOVER_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Touch devices have no hover, so their links stay plain links. */
function useCanHover(): boolean {
  return useSyncExternalStore(
    subscribeHover,
    () => window.matchMedia(HOVER_QUERY).matches,
    () => true,
  );
}

/**
 * An internal link that shows a Hover Preview of the Note it points at.
 * `slug` is the target Note's Slug and `subpath` the link's Subpath (the part
 * after `#`), which picks the part of the Note the preview shows.
 */
export function HoverPreview({
  href,
  slug,
  subpath,
  children,
  ...props
}: Omit<ComponentProps<"a">, "href"> & {
  href: string;
  slug: string[];
  subpath?: string | undefined;
  children?: ReactNode;
}) {
  const canHover = useCanHover();
  const [payload, setPayload] = useState<PreviewPayload | null>(null);
  const [wantOpen, setWantOpen] = useState(false);
  const key = slugKey(slug);
  const notifyParent = useContext(ChildClosedContext);
  const isOpen = wantOpen && payload !== null;

  // What the reader's pointer or focus is on: the link or the popup, by
  // pointer or by focus. The popup's React events also cover the nested
  // previews portaled out of it, so "inside the popup" means anywhere in the
  // nested chain, for focus as well as for the pointer.
  const presence = useRef(new Set<string>());
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const setPresence = (part: Part, input: Input, present: boolean) => {
    const id = `${part}:${input}`;
    if (present) {
      presence.current.add(id);
      clearTimeout(closeTimer.current);
    } else {
      presence.current.delete(id);
    }
  };
  const onChildClosed = useCallback(() => {
    if (presence.current.size > 0) return;
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setWantOpen(false), CLOSE_DELAY);
  }, []);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !isOpen) notifyParent?.();
    wasOpen.current = isOpen;
  }, [isOpen, notifyParent]);

  // Starts on pointer enter or focus, in parallel with the open delay. A
  // failure opens nothing and is not cached, so the next hover retries.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` identifies `slug`
  const load = useCallback(() => {
    fetchPreviewPayload(slug).then(setPayload, () => setWantOpen(false));
  }, [key]);

  // Leaving before the content has arrived means the preview never opens.
  const cancelPending = useCallback(() => {
    if (!payload) setWantOpen(false);
  }, [payload]);

  // Hovering or focusing the link starts loading its payload; leaving it
  // before the payload has arrived cancels the preview.
  const enter = (input: Input) => {
    setPresence("trigger", input, true);
    load();
  };
  const leave = (input: Input) => {
    setPresence("trigger", input, false);
    cancelPending();
  };

  if (!canHover) {
    return (
      <Link href={href} {...props}>
        {children}
      </Link>
    );
  }

  return (
    <PreviewCard.Root onOpenChange={(next) => setWantOpen(next)} open={isOpen}>
      <PreviewCard.Trigger
        closeDelay={CLOSE_DELAY}
        delay={OPEN_DELAY}
        onBlur={() => leave("focus")}
        onFocus={() => enter("focus")}
        onPointerEnter={() => enter("pointer")}
        onPointerLeave={() => leave("pointer")}
        render={<Link href={href} {...props} />}
      >
        {children}
      </PreviewCard.Trigger>
      <PreviewCard.Portal>
        <PreviewCard.Positioner className="z-50" sideOffset={8}>
          <PreviewCard.Popup
            className="max-h-[min(24rem,70vh)] w-[min(28rem,92vw)] overflow-y-auto rounded-lg border bg-popover text-popover-foreground shadow-lg"
            data-testid="hover-preview"
            onBlur={() => setPresence("popup", "focus", false)}
            onFocus={() => setPresence("popup", "focus", true)}
            onPointerEnter={() => setPresence("popup", "pointer", true)}
            onPointerLeave={() => setPresence("popup", "pointer", false)}
          >
            <ChildClosedContext.Provider value={onChildClosed}>
              {payload && (
                <PreviewContent payload={payload} subpath={subpath} />
              )}
            </ChildClosedContext.Provider>
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
}
