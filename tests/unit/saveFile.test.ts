import { describe, it, expect, vi, afterEach } from "vitest";
import { askSaveLocation, deliverBlob, discardSaveTarget } from "@/lib/saveFile";

afterEach(() => vi.unstubAllGlobals());

const fakeHandle = () => {
  const written: Blob[] = []; let closed = 0; const remove = vi.fn(async () => {});
  return { written, get closed() { return closed; }, remove, createWritable: async () => ({ write: async (b: Blob) => { written.push(b); }, close: async () => { closed++; } }) };
};

describe("askSaveLocation", () => {
  it("is unsupported when the browser has no save picker", async () => {
    vi.stubGlobal("window", {});
    expect(await askSaveLocation("a.zip")).toEqual({ kind: "unsupported" });
  });
  it("returns the handle the user picked, suggesting the file name", async () => {
    const h = fakeHandle(); const picker = vi.fn(async () => h);
    vi.stubGlobal("window", { showSaveFilePicker: picker });
    const r = await askSaveLocation("Invoices_Nov_2026.zip");
    expect(r).toEqual({ kind: "picked", handle: h });
    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: "Invoices_Nov_2026.zip" }));
  });
  it("reports a cancelled dialog as cancelled (not as a failure)", async () => {
    vi.stubGlobal("window", { showSaveFilePicker: async () => { throw new DOMException("x", "AbortError"); } });
    expect(await askSaveLocation("a.zip")).toEqual({ kind: "cancelled" });
  });
  it("falls back to a normal download when the picker is blocked", async () => {
    vi.stubGlobal("window", { showSaveFilePicker: async () => { throw new DOMException("x", "SecurityError"); } });
    expect(await askSaveLocation("a.zip")).toEqual({ kind: "unsupported" });
  });
});

describe("deliverBlob", () => {
  it("writes to the chosen file, closes it, and says saved", async () => {
    const h = fakeHandle(); const blob = new Blob(["zip"]);
    expect(await deliverBlob(blob, "a.zip", { kind: "picked", handle: h })).toBe("saved");
    expect(h.written).toEqual([blob]); expect(h.closed).toBe(1);
  });
  it("still closes the file and rethrows when the write fails (so no false 'saved')", async () => {
    let closed = 0;
    const handle = { createWritable: async () => ({ write: async () => { throw new Error("disk full"); }, close: async () => { closed++; } }) };
    await expect(deliverBlob(new Blob(["x"]), "a.zip", { kind: "picked", handle })).rejects.toThrow("disk full");
    expect(closed).toBe(1);
  });
});

describe("discardSaveTarget", () => {
  it("removes the empty file the Save dialog created, and tolerates failure or no target", async () => {
    const h = fakeHandle(); await discardSaveTarget({ kind: "picked", handle: h }); expect(h.remove).toHaveBeenCalledOnce();
    await expect(discardSaveTarget({ kind: "picked", handle: { createWritable: fakeHandle().createWritable, remove: async () => { throw new Error("no"); } } })).resolves.toBeUndefined();
    await expect(discardSaveTarget(undefined)).resolves.toBeUndefined();
    await expect(discardSaveTarget({ kind: "unsupported" })).resolves.toBeUndefined();
  });
});
