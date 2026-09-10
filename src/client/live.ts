import { MAX_THREAD_ITEMS, type Block, type ThreadItem, type ThreadOp } from "@/lib/types";

function itemId(item: ThreadItem) {
  return item.type === "turn" ? item.turn.id : item.divider.id;
}

function findFromEnd(items: ThreadItem[], id: string) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (itemId(items[index]) === id) return index;
  }
  return -1;
}

function replaceBlock(items: ThreadItem[], index: number, at: number, block: Block) {
  const item = items[index];
  if (item.type !== "turn") return;
  const blocks = item.turn.blocks.slice();
  blocks[at] = block;
  items[index] = { turn: { ...item.turn, blocks }, type: "turn" };
}

export function applyOps(current: ThreadItem[], ops: ThreadOp[]): ThreadItem[] | null {
  const items = current.slice();

  for (const op of ops) {
    if (op.op === "add") {
      if (findFromEnd(items, itemId(op.item)) !== -1) continue;
      items.push(op.item);
      if (items.length > MAX_THREAD_ITEMS) items.splice(0, items.length - MAX_THREAD_ITEMS);
      continue;
    }

    const index = findFromEnd(items, op.id);
    if (index === -1) continue;
    const item = items[index];
    if (item.type !== "turn") return null;

    if (op.op === "blocks") {
      if (item.turn.blocks.length >= op.at + op.blocks.length) continue;
      if (item.turn.blocks.length !== op.at) return null;
      items[index] = {
        turn: { ...item.turn, blocks: [...item.turn.blocks, ...op.blocks] },
        type: "turn",
      };
      continue;
    }

    if (op.op === "model") {
      if (item.turn.model) continue;
      items[index] = { turn: { ...item.turn, model: op.model }, type: "turn" };
      continue;
    }

    const target = item.turn.blocks[op.block];
    if (!target) return null;
    if (target.kind !== "tool") return null;
    if (target.result === op.result) continue;
    replaceBlock(items, index, op.block, { ...target, result: op.result });
  }

  return items;
}
