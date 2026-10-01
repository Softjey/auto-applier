/**
 * Waiting that survives a tab in the background. Chrome runs a hidden tab's timers at most once a
 * second, and after a few minutes hidden once a MINUTE ("intensive throttling"), so `setTimeout(25)`
 * can take a minute and a fill that polls dozens of times never finishes — which is exactly the
 * tab a browser-driving agent works in. A message-channel round trip is not throttled: it yields to
 * the page between steps and returns at once, so a hidden tab spins on the clock instead.
 */
const yieldNow = (): Promise<void> =>
  new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(0);
  });

export async function sleep(ms: number): Promise<void> {
  if (!document.hidden) {
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
    return;
  }
  const deadline = performance.now() + ms;
  while (performance.now() < deadline) await yieldNow();
}
