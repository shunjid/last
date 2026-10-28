const MIN_CHARS = 1200;
const MIN_CARDS = 3;
const MIN_CARD_CHARS = 200;

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^#{1,4}\s/;
const LABEL = /^\*\*[^*\n]+\*\*/;
const RULE = /^(?:-{3,}|\*{3,}|_{3,})\s*$/;
const TITLE = /^(?:#{1,4}\s+(.+)|\*\*([^*\n]+)\*\*)/;

function sections(text: string): string[] {
  const parts: string[][] = [[]];
  let fence = "";
  let afterBlank = true;

  for (const line of text.split("\n")) {
    const marker = FENCE.exec(line)?.[1] ?? "";

    if (fence) {
      if (marker[0] === fence[0] && marker.length >= fence.length) fence = "";
      parts[parts.length - 1].push(line);
      afterBlank = false;
      continue;
    }

    if (marker) {
      fence = marker;
    } else if (afterBlank && RULE.test(line)) {
      parts.push([]);
      continue;
    } else if (HEADING.test(line) || (afterBlank && LABEL.test(line))) {
      parts.push([]);
    }

    parts[parts.length - 1].push(line);
    afterBlank = line.trim() === "";
  }

  return parts.map((part) => part.join("\n").trim()).filter(Boolean);
}

export function answerCards(text: string): string[] | null {
  if (text.length < MIN_CHARS) return null;

  const cards: string[] = [];
  let carry = "";

  for (const part of sections(text)) {
    carry = carry ? `${carry}\n\n${part}` : part;
    if (carry.length < MIN_CARD_CHARS) continue;
    cards.push(carry);
    carry = "";
  }
  if (carry && cards.length > 0) cards[cards.length - 1] += `\n\n${carry}`;

  return cards.length >= MIN_CARDS ? cards : null;
}

export function cardTitle(card: string): string | null {
  const match = TITLE.exec(card.split("\n", 1)[0]);
  const title = (match?.[1] ?? match?.[2] ?? "").replace(/[`*]/g, "").replace(/[:.]$/, "").trim();
  return title || null;
}
