import { describe, expect, it } from "vitest";
import { formatStrivenHttpError } from "../lib/striven/errors";

describe("Striven HTTP error formatting", () => {
  it.each([
    [400, "Validation issue"],
    [401, "Token issue"],
    [404, "Wrong endpoint"],
    [429, "Rate limit"],
    [500, "server issue"]
  ])("formats HTTP %s clearly", (status, text) => {
    expect(formatStrivenHttpError(status, "post", "https://api.striven.com/x", "body")).toContain(text);
  });
});
