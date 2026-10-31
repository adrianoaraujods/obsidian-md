import { createPreviewRoute } from "fumadocs-obsidian-md/next";

import { source } from "@/lib/source";

export const { GET, generateStaticParams } = createPreviewRoute(source);
