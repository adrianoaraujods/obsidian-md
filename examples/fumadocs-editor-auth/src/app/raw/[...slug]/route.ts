import fs from "node:fs/promises";
import path from "node:path";
import { source } from "@/lib/source";
import { vaultDir } from "@/lib/vault-dir";

/** Raw `.md` export of every Note, written at build time. */
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return source.getPages().map((page) => ({ slug: page.path.split("/") }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  const notePath = slug.map(decodeURIComponent).join("/");
  const known = source.getPages().some((page) => page.path === notePath);
  if (!known) return new Response("Not found", { status: 404 });

  const markdown = await fs.readFile(path.join(vaultDir, notePath), "utf8");
  return new Response(markdown, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
