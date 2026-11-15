/**
 * Lobby setup copy. Flat object sorted by key for easy merges across PRs.
 * Interpolate with formatLobbySetupString(template, values).
 */
export const LOBBY_SETUP_STRINGS = {
  'address.consent': 'Only the person picked to ship you a gift will see your address.',
  'address.prefilled': "We filled this in from your profile. Fix anything that's off.",
  'address.summary': 'Shipping to {city}',
  'chip.invited': 'Invited',
  'chip.joined': 'Joined',
  'chip.ready': 'Ready',
  'error.load': "We couldn't load this party.",
  'error.load.retry': 'Try again',
  'gift.counter.many': '{count} gifts are in',
  'gift.counter.one': '1 gift is in',
  'gift.counter.zero': "No gifts yet. Who's going first?",
  'gift.error.store_name': "That's the store, not the gift. What's the gift called?",
  'gift.manual_helper':
    "This store won't share its gift details with us. Add them below and you're all set.",
  'gift.summary': 'Your gift: {giftTitle} from {storeName}',
  'gift.summary_no_store': 'Your gift: {giftTitle}',
  'guest.ready.cta': "I'm ready",
  'guest.ready.done': "You're in! Hang tight while everyone else gets ready.",
  'guest.ready.locked.address': "Add your shipping address before you're ready.",
  'guest.ready.locked.both': "Add your gift and shipping address before you're ready.",
  'guest.ready.locked.gift': "Add your gift before you're ready.",
  'guest.ready.missing.address': 'your shipping address',
  'guest.ready.missing.both': 'your gift and shipping address',
  'guest.ready.missing.gift': 'your gift',
  'guest.ready.undo': 'Not ready yet',
  'guest.rules_changed': 'Heads up, {hostFirstName} changed the {changedRule}.',
  'guest.rules_changed_no_host': 'Heads up, your host changed the {changedRule}.',
  'guest.welcome.body':
    "{hostFirstName} here. Please go find a gift and share it here. I'll wait.",
  'guest.welcome.body_no_host':
    'Please go find a gift and share it here. Your host will wait.',
  'guest.welcome.cta': 'Add my gift',
  'guest.welcome.title': 'Hiya pal, welcome to {partyName}!',
  'host.invite.empty': "No one's invited yet. Add a friend's email to get things going.",
  'host.invite.locked': 'Set the rules first, then you can invite people.',
  'host.invite.summary': '{n} invited',
  'host.rules.summary': 'Spend up to {budget}. Each gift can be stolen {maxSteals} times.',
  'host.start.all_ready': "Everyone's ready. Let's play!",
  'host.start.count': '{ready} of {total} ready',
  'host.start.cta': 'Start the game',
  'host.start.disabled': "Not everyone's ready yet.",
  'host.start.locked': 'Add {missing} and then you can start.',
  'progress': '{done} of {total} done',
  'rules.name.budget': 'budget',
  'rules.name.date': 'date',
  'rules.name.steal_limit': 'steal limit',
  'wait.address': '{name} still needs to add a shipping address.',
  'wait.gift': '{name} still needs to add a gift.',
  'wait.not_joined': "{name} hasn't joined yet.",
};

export function formatLobbySetupString(key, values = {}) {
  const template = LOBBY_SETUP_STRINGS[key];
  if (!template) {
    return '';
  }
  return template.replace(/\{(\w+)\}/g, (_, name) =>
    values[name] !== undefined && values[name] !== null ? String(values[name]) : `{${name}}`,
  );
}

export function lobbyStepHeadingId(stepId) {
  return `lobby-step-heading-${stepId}`;
}

export function focusLobbyStepHeading(stepId) {
  const el = document.getElementById(lobbyStepHeadingId(stepId));
  if (el) {
    el.focus({ preventScroll: true });
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}