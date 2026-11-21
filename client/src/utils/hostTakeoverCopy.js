/**
 * BUG-23 strings, verbatim from Copywriter's signed set (2026-11-21 BUG-21 and BUG-23 strings).
 * Templates keep their {placeholders}; fillCopy() swaps them for text, fillCopyParts() for nodes.
 */
export const HOST_TAKEOVER_COPY = {
  awayChipTag: 'Away',
  awayChipTitle: '{name}, away',
  awayTurnLine: "{name}'s turn (away)",
  hint: "You can take {name}'s turn in {seconds}s",
  readySr: "You can take {name}'s turn now.",
  actions: {
    pick: 'Pick a gift for {name}',
    keep: 'Let {name} keep their gift',
    keep_and_end: 'Let {name} keep their gift and end the game',
    steal: 'Steal a random gift for {name}',
    skip: "Skip {name}'s turn",
  },
  busy: 'Working...',
  playerBack: "{name} is back, so it's their turn again. Nothing changed.",
  turnMoved: 'That turn already ended, so nothing changed.',
  notYet: "It's not time yet. Try again in a few seconds.",
  feed: {
    pick: '{hostName} picked {giftTitle} for {name}',
    keep: '{hostName} let {name} keep their gift',
    keep_and_end: '{hostName} let {name} keep their gift. Game over.',
    steal: '{hostName} stole {giftTitle} from {victimName} for {name}',
    skip: "{hostName} skipped {name}'s turn",
  },
};

/** Template with every {key} replaced by its string value. */
export function fillCopy(template, values) {
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in values ? String(values[key]) : match));
}

/** Template split into strings and the given values (React nodes), in order. */
export function fillCopyParts(template, values) {
  return template.split(/(\{\w+\})/).filter(Boolean).map((part) => {
    const key = part.match(/^\{(\w+)\}$/)?.[1];
    return key && key in values ? values[key] : part;
  });
}

const PLAYER_BACK_SUFFIX = HOST_TAKEOVER_COPY.playerBack.replace('{name}', '');

/** Host takeover refusals are state changes, so they show as amber notices, not errors. */
export function isHostTakeoverNotice(message) {
  return (
    message === HOST_TAKEOVER_COPY.turnMoved ||
    message === HOST_TAKEOVER_COPY.notYet ||
    (typeof message === 'string' && message.length > PLAYER_BACK_SUFFIX.length && message.endsWith(PLAYER_BACK_SUFFIX))
  );
}
