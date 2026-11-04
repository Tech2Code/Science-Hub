import { describe, it, expect, vi, afterEach } from "vitest";
import { nextFrame, waitForElementById, settleWithin } from "@/lib/domWait";
import { bulkZipDownload, bulkDownloadPdfsAsZip } from "@/lib/bulkPdfDownload";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("nextFrame", () => {
  it("resolves after two animation frames when the tab is visible", async () => {
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) => { cb(); return 1; });
    await expect(nextFrame()).resolves.toBeUndefined();
  });

  // requestAnimationFrame never fires in a hidden tab — the bulk PDF download used to stall there.
  it("still resolves via the timer fallback when requestAnimationFrame never fires (hidden tab)", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", () => 1);
    let resolved = false;
    void nextFrame(100).then(() => { resolved = true; });
    await vi.advanceTimersByTimeAsync(99);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(resolved).toBe(true);
  });
});

describe("waitForElementById", () => {
  it("returns the element as soon as it appears", async () => {
    vi.useFakeTimers();
    const el = { id: "x" };
    let calls = 0;
    vi.stubGlobal("document", { getElementById: () => (++calls >= 3 ? el : null) });
    const p = waitForElementById("x", 5000, 25);
    await vi.advanceTimersByTimeAsync(100);
    await expect(p).resolves.toBe(el);
  });

  it("gives up with null after the timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("document", { getElementById: () => null });
    const p = waitForElementById("missing", 200, 25);
    await vi.advanceTimersByTimeAsync(300);
    await expect(p).resolves.toBeNull();
  });
});

describe("settleWithin", () => {
  it("returns the work's value when it finishes in time", async () => {
    await expect(settleWithin(Promise.resolve("done"), 1000, "fallback")).resolves.toBe("done");
  });

  it("returns the fallback when the work never settles — a hung job can't block the queue", async () => {
    vi.useFakeTimers();
    const p = settleWithin(new Promise<string>(() => {}), 45_000, "fallback");
    await vi.advanceTimersByTimeAsync(44_999);
    let settled = false;
    void p.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    await expect(p).resolves.toBe("fallback");
  });

  it("returns the fallback when the work throws", async () => {
    await expect(settleWithin(Promise.reject(new Error("boom")), 1000, "fallback")).resolves.toBe("fallback");
  });
});

describe("bulk download cancellation", () => {
  it("stops before the next item, downloads nothing, and reports cancelled (no document/download is ever touched)", async () => {
    const produced: number[] = [];
    let checks = 0;
    const result = await bulkZipDownload(
      [1, 2, 3, 4, 5],
      async (n) => { produced.push(n); return [{ name: `${n}.pdf`, blob: new Uint8Array([1]) as unknown as Blob }]; },
      "x.zip",
      undefined,
      () => ++checks > 2, // allow two items, then the page "unmounts"
    );
    expect(produced).toEqual([1, 2]);
    expect(result).toEqual({ entriesZipped: 0, cancelled: true });
  });

  it("bulkDownloadPdfsAsZip passes the cancellation through and does not count the unrendered items as failures", async () => {
    const generated: string[] = [];
    const result = await bulkDownloadPdfsAsZip(
      [{ fileName: "a.pdf" }, { fileName: "b.pdf" }, { fileName: "c.pdf" }],
      async (item) => { generated.push(item.fileName); return new Uint8Array([1]) as unknown as Blob; },
      "x.zip",
      undefined,
      () => generated.length >= 1,
    );
    expect(generated).toEqual(["a.pdf"]);
    expect(result.cancelled).toBe(true);
    expect(result.failed).toEqual([]);
    expect(result.succeeded).toBe(0);
  });
});
