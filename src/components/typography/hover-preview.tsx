"use client";

import { PreviewCard } from "@base-ui/react/preview-card";
import Link from "next/link";
import {
  type ComponentProps,
  type ReactNode,
  useCallback,
  useState,
  useSyncExternalStore,
} from "react";

import { Properties } from "@/components/typography/properties";
import { fetchPreviewPayload } from "@/lib/preview-client";
import { slicePreviewHtml } from "@/lib/preview-slice";
import type { PreviewPayload } from "@/lib/preview-types";
import { PREVIEW_PROPERTIES_KEY } from "@/lib/properties-keys";

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
      <div
        className="markdown-rendered prose text-sm"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: payload HTML is rendered from the Vault at build time
        dangerouslySetInnerHTML={{ __html: html }}
      />
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
  const key = slug.join("/");

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

  if (!canHover) {
    return (
      <Link href={href} {...props}>
        {children}
      </Link>
    );
  }

  return (
    <PreviewCard.Root
      onOpenChange={(next) => setWantOpen(next)}
      open={wantOpen && payload !== null}
    >
      <PreviewCard.Trigger
        closeDelay={CLOSE_DELAY}
        delay={OPEN_DELAY}
        onBlur={cancelPending}
        onFocus={load}
        onPointerEnter={load}
        onPointerLeave={cancelPending}
        render={<Link href={href} {...props} />}
      >
        {children}
      </PreviewCard.Trigger>
      <PreviewCard.Portal>
        <PreviewCard.Positioner sideOffset={8}>
          <PreviewCard.Popup
            className="z-50 max-h-[min(24rem,70vh)] w-[min(28rem,92vw)] overflow-y-auto rounded-lg border bg-popover text-popover-foreground shadow-lg"
            data-testid="hover-preview"
          >
            {payload && <PreviewContent payload={payload} subpath={subpath} />}
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
}
