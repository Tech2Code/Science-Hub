// A tiny single-lane job queue with two priorities.
//
// The invoice print area is rendered into ONE off-screen host, so PDF jobs must run one at a time. A bulk ZIP enqueues
// its items at "low" priority and anything the user clicks directly (View, PDF, Share) at "high": the click jumps
// ahead of the remaining bulk items instead of waiting behind a hundred of them. Within a priority it is FIFO.
export type JobPriority = "high" | "low";

export interface JobQueue {
  /** Runs `task` when its turn comes; resolves/rejects with the task's own result. A failing task never blocks the queue. */
  run<T>(task: () => Promise<T>, priority?: JobPriority): Promise<T>;
  /** Number of jobs waiting (not counting the one currently running). */
  pending(): number;
}

interface Entry { start: () => Promise<void> }

export function createJobQueue(): JobQueue {
  const high: Entry[] = [];
  const low: Entry[] = [];
  let running = false;

  const pump = () => {
    if (running) return;
    const next = high.shift() ?? low.shift();
    if (!next) return;
    running = true;
    void next.start().finally(() => {
      running = false;
      pump();
    });
  };

  return {
    run<T>(task: () => Promise<T>, priority: JobPriority = "high"): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const entry: Entry = {
          start: async () => {
            try { resolve(await task()); } catch (err) { reject(err); }
          },
        };
        (priority === "high" ? high : low).push(entry);
        pump();
      });
    },
    pending: () => high.length + low.length,
  };
}
