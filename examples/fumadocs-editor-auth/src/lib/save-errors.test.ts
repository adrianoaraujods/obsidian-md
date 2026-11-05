import { describe, expect, it } from "vitest";

import { CREDENTIAL_MESSAGE, saveErrorMessage } from "./save-errors";

describe("the message for a failed Save", () => {
  it("tells the owner to fix the setup when the server could not commit", () => {
    const error = new Error("Storage request failed (500: storage-failed)");
    expect(saveErrorMessage(error)).toBe(CREDENTIAL_MESSAGE);
    expect(CREDENTIAL_MESSAGE).toBe(
      "Saving isn't configured correctly. Your text is kept. Tell the site owner.",
    );
  });

  it("does not blame the setup for a network failure", () => {
    expect(saveErrorMessage(new TypeError("Failed to fetch"))).toBe(
      "Couldn't reach the server. Your text is kept. Try again.",
    );
  });
});
