import { describe, it, expect } from "vitest";
import { createJobQueue } from "@/lib/pdfJobQueue";

// A job whose completion the test controls.
function controlled<T>(value: T) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const log: string[] = [];
  return { gate, release, log, task: async (name?: string) => { await gate; if (name) log.push(name); return value; } };
}

describe("createJobQueue", () => {
  it("runs one job at a time", async () => {
    const q = createJobQueue();
    let active = 0; let maxActive = 0;
    const job = () => async () => { active++; maxActive = Math.max(maxActive, active); await new Promise((r) => setTimeout(r, 5)); active--; return 1; };
    await Promise.all([q.run(job()), q.run(job()), q.run(job(), "low"), q.run(job(), "low")]);
    expect(maxActive).toBe(1);
  });

  it("a high-priority job jumps ahead of waiting low-priority (bulk) jobs, FIFO within a priority", async () => {
    const q = createJobQueue();
    const order: string[] = [];
    const first = controlled("x");
    const p0 = q.run(async () => { await first.gate; order.push("running"); });   // occupies the lane
    const pA = q.run(async () => { order.push("bulk-A"); }, "low");
    const pB = q.run(async () => { order.push("bulk-B"); }, "low");
    const pView = q.run(async () => { order.push("user-click-1"); }, "high");
    const pView2 = q.run(async () => { order.push("user-click-2"); }, "high");
    expect(q.pending()).toBe(4);
    first.release();
    await Promise.all([p0, pA, pB, pView, pView2]);
    expect(order).toEqual(["running", "user-click-1", "user-click-2", "bulk-A", "bulk-B"]);
  });

  it("returns each task's own value and defaults to high priority", async () => {
    const q = createJobQueue();
    await expect(q.run(async () => 42)).resolves.toBe(42);
    await expect(q.run(async () => "s", "low")).resolves.toBe("s");
  });

  it("a failing job rejects its own promise but never blocks or poisons the queue", async () => {
    const q = createJobQueue();
    const bad = q.run(async () => { throw new Error("boom"); });
    const good = q.run(async () => "after");
    await expect(bad).rejects.toThrow("boom");
    await expect(good).resolves.toBe("after");
    expect(q.pending()).toBe(0);
  });

  it("keeps accepting jobs after it has drained", async () => {
    const q = createJobQueue();
    await q.run(async () => 1);
    await expect(q.run(async () => 2, "low")).resolves.toBe(2);
  });
});
