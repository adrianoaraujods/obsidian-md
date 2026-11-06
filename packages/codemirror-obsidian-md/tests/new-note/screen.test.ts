// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createNewNoteScreen,
  type NewNoteScreen,
} from "../../src/new-note/index.js";

const existing = ["Index.md", "Geografia/Sebá.md"];
const screens: NewNoteScreen[] = [];
function mount() {
  const onCreate = vi.fn();
  const onCancel = vi.fn();
  const parent = document.createElement("div");
  document.body.append(parent);
  screens.push(
    createNewNoteScreen({
      parent,
      existingPaths: existing,
      onCreate,
      onCancel,
    }),
  );
  return { parent, onCreate, onCancel };
}
const input = (p: HTMLElement, s: string) =>
  p.querySelector(s) as HTMLInputElement;
function type(el: HTMLInputElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
function submit(parent: HTMLElement) {
  parent
    .querySelector("form")!
    .dispatchEvent(new Event("submit", { cancelable: true }));
}
afterEach(() => {
  for (const s of screens.splice(0)) s.destroy();
  document.body.innerHTML = "";
});

describe("new-note screen", () => {
  it("lists existing folders in the picker; empty means the Vault root", () => {
    const { parent } = mount();
    const options = [...parent.querySelectorAll("datalist option")].map(
      (o) => (o as HTMLOptionElement).value,
    );
    expect(options).toEqual(["Geografia"]);
    expect(input(parent, "[name=folder]").placeholder).toMatch(/vault root/i);
  });

  it("creates with the Vault-relative path from a typed nested folder", () => {
    const { parent, onCreate } = mount();
    type(input(parent, "[name=folder]"), "Mundo/Norte");
    type(input(parent, "[name=name]"), "Castelo");
    submit(parent);
    expect(onCreate).toHaveBeenCalledWith("Mundo/Norte/Castelo.md");
  });

  it("shows the error and does not create when invalid", () => {
    const { parent, onCreate } = mount();
    type(input(parent, "[name=folder]"), "Geografia");
    type(input(parent, "[name=name]"), "Sebá");
    submit(parent);
    expect(onCreate).not.toHaveBeenCalled();
    expect(parent.querySelector("[role=alert]")!.textContent).toMatch(
      /already exists/,
    );
    expect(input(parent, "[name=name]").getAttribute("aria-invalid")).toBe(
      "true",
    );
  });

  it("previews the resulting path and cancels", () => {
    const { parent, onCancel } = mount();
    type(input(parent, "[name=name]"), "Lago");
    expect(parent.querySelector("[data-preview]")!.textContent).toBe("Lago.md");
    (parent.querySelector("[data-cancel]") as HTMLElement).click();
    expect(onCancel).toHaveBeenCalled();
  });
});
