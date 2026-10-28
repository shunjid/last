export const STEER_EVENT = "last-steer";

export function steerThread(from: Element) {
  from.dispatchEvent(new Event(STEER_EVENT, { bubbles: true }));
}
