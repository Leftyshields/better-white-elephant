/**
 * Whether every gift is unwrapped and frozen, so no pick or steal remains.
 * Game start (no unwrapped gifts) is false: Array#every on [] is not treated as frozen.
 * Mid-game, frozen unwrapped gifts with wrapped gifts still left is also false.
 */
export function areAllGiftsFrozenWithNoLegalAction(gifts) {
  const list = Array.isArray(gifts) ? gifts : Object.values(gifts ?? {});
  const wrappedCount = list.filter((g) => g.isWrapped).length;
  const unwrapped = list.filter((g) => !g.isWrapped);
  const allUnwrappedFrozen = unwrapped.length > 0 && unwrapped.every((g) => g.isFrozen);
  return wrappedCount === 0 && allUnwrappedFrozen;
}
