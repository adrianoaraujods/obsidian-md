/** Whether an IME is composing; every Editing Shortcut stays out of its way. */
export function isComposing(view: {
  composing: boolean;
  compositionStarted: boolean;
}): boolean {
  return view.composing || view.compositionStarted;
}
