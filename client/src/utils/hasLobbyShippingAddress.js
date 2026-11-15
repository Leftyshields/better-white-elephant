/** Matches PartyLobby / start-game address checks (street + city). */
export function hasLobbyShippingAddress(address) {
  if (!address || typeof address !== 'object') {
    return false;
  }
  return Boolean(String(address.street ?? '').trim() && String(address.city ?? '').trim());
}