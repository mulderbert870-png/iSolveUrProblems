// Shared flag so the silence re-engage logic in context.tsx can know when the
// user is recording or analyzing a video. During those moments we suppress
// silence-break signals and avatar speech so 6 doesn't talk over the capture.

let busy = false;

export function setVideoBusy(value: boolean): void {
  busy = value;
}

export function isVideoBusy(): boolean {
  return busy;
}
