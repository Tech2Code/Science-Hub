// Lets the browser handle input and paint between two chunks of long synchronous work.
//
// PDF generation (html2canvas, PNG encoding, jsPDF's re-compression) runs on the main thread — the same thread that
// handles clicks and typing — so a single page can block the UI for a second or more, and a bulk download does it
// back to back. Awaiting this between the heavy steps turns one multi-second block into several shorter ones.
//
// Not setTimeout(0): browsers throttle timers in a hidden tab to about once a second, which would add seconds to every
// step of a download the user started and then tabbed away from. scheduler.yield() (Chromium) keeps the task's
// priority; MessageChannel messages are not throttled like timers.
interface SchedulerLike { yield?: () => Promise<void> }

export function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: SchedulerLike }).scheduler;
  if (scheduler?.yield) return scheduler.yield();
  return new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(0);
  });
}
