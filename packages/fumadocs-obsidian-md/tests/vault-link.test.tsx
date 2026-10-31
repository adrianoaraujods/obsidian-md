import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";

import {
  createVaultLink,
  resolveVaultLink,
  type VaultPage,
} from "../src/index.js";
import { createFixtureSource } from "./helpers/fixture-source.js";

let source: Awaited<ReturnType<typeof createFixtureSource>>;
let beta: VaultPage;
beforeAll(async () => {
  source = await createFixtureSource("preview-vault");
  beta = source.getPage(["beta-note"]) as VaultPage;
});

describe("resolveVaultLink", () => {
  it("targets a different Vault Note, with the Subpath", () => {
    expect(resolveVaultLink(source, beta, "/alpha-note#alpha-child")).toEqual({
      href: "/alpha-note#alpha-child",
      target: { slug: ["alpha-note"], subpath: "alpha-child" },
    });
  });

  it.each([
    ["itself", "/beta-note"],
    ["a same-Note anchor", "#beta-heading"],
    ["an Asset", "pic.png"],
    ["an external URL", "https://example.com"],
    ["a non-Vault route", "/api/search"],
    ["a missing Note", "/nowhere-note"],
  ])("has no target for %s", (_name, href) => {
    expect(resolveVaultLink(source, beta, href).target).toBeUndefined();
  });

  it("decides relative to the Note being rendered", () => {
    const alpha = source.getPage(["alpha-note"]) as VaultPage;

    expect(resolveVaultLink(source, alpha, "/beta-note").target).toBeDefined();
    expect(resolveVaultLink(source, beta, "/beta-note").target).toBeUndefined();
  });
});

describe("createVaultLink", () => {
  const html = (href: string) => {
    const Link = createVaultLink(source, beta);
    return renderToStaticMarkup(<Link href={href}>text</Link>);
  };

  it("renders a Hover Preview trigger only for a link to another Note", () => {
    expect(html("/alpha-note")).toContain("base-ui-");
    expect(html("/beta-note")).not.toContain("base-ui-");
    expect(html("https://example.com")).not.toContain("base-ui-");
  });
});
