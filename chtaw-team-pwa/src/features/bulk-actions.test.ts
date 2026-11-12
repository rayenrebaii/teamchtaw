import { expect, it, vi } from "vitest";
import { runSelectedActions } from "./bulk-actions";
it("reports partial failures without repeating successful operations", async () => {
  const execute = vi.fn(async (item: { id: string }) => { if (item.id === "b") throw Error("Unavailable"); });
  const result = await runSelectedActions([{ id: "a" }, { id: "b" }, { id: "c" }], execute, () => true);
  expect(result.succeeded).toEqual(["a", "c"]);
  expect(result.failed).toEqual([{ item: { id: "b" }, error: "Unavailable" }]);
  expect(execute).toHaveBeenCalledTimes(3);
});
it("stops sending mutations if the session or authorization changes", async () => {
  let active = true;
  const execute = vi.fn(async () => { active = false; });
  const result = await runSelectedActions([{ id: "a" }, { id: "b" }], execute, () => active);
  expect(execute).toHaveBeenCalledTimes(1);
  expect(result.succeeded).toEqual(["a"]);
  expect(result.failed[0]?.item.id).toBe("b");
});
