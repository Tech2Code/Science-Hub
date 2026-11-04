// Small async helpers for code that mounts something off-screen, waits for it, and captures it (PDF rendering).

/**
 * Resolves after the browser has had two animation frames — enough for React to commit a state change and lay it out.
 * `requestAnimationFrame` never fires in a hidden tab, so a timer backs it up: without this a bulk PDF download
 * stalls the moment the user switches to another tab and only resumes when they come back.
 */
export function nextFrame(fallbackMs = 100): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    requestAnimationFrame(() => requestAnimationFrame(finish));
    setTimeout(finish, fallbackMs);
  });
}

/** Polls for an element by id (just after a state change it may not be committed yet). Resolves null on timeout. */
export async function waitForElementById(id: string, timeoutMs = 5000, pollMs = 25): Promise<HTMLElement | null> {
  const start = Date.now();
  for (;;) {
    const el = document.getElementById(id);
    if (el) return el;
    if (Date.now() - start >= timeoutMs) return null;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

/** Resolves with `fallback` if `work` neither settles nor throws within `ms` (a throw also resolves to `fallback`). */
export function settleWithin<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    work.then(
      (value) => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(fallback); },
    );
  });
}
