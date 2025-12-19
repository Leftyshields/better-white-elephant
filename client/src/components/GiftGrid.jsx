/**
 * Gift Grid Component - Memoized for Performance
 * 
 * Only re-renders when gifts object changes (shallow comparison)
 */
import { memo } from 'react';
import { GiftCard } from './GiftCard.jsx';

export const GiftGrid = memo(function GiftGrid({ 
  gifts, 
  isMyTurn, 
  canSteal,
  getStealBlockReason,
  actions,
  currentPlayerId,
  userId,
  userNames = {},
  userEmails = {},
  revealingGiftId = null,
}) {
  const giftList = Object.values(gifts || {});
  
  // Separate wrapped and unwrapped gifts
  const wrappedGifts = giftList.filter(gift => gift.isWrapped);
  
  
  // Sort unwrapped gifts by lastInteractedAt (most recent first)
  const unwrappedGifts = giftList
    .filter(gift => !gift.isWrapped)
    .sort((a, b) => {
      const aTime = a.lastInteractedAt || 0;
      const bTime = b.lastInteractedAt || 0;
      if (bTime !== aTime) return bTime - aTime; // Most recent first
      return (a.id || '').localeCompare(b.id || ''); // Fallback to ID for stable sort
    });
  

  return (
    <div className="space-y-8">
      {/* Wrapped Gifts */}
      {wrappedGifts.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-white text-center">Wrapped Gifts</h2>
          <div className="flex flex-wrap justify-center gap-3 w-full">
            {wrappedGifts.map((gift, index) => {
              return (
                <GiftCard
                  key={gift.id}
                  gift={gift}
                  isWrapped={true}
                  compact={true}
                  giftNumber={index + 1}
                  currentPlayerId={currentPlayerId}
                  userId={userId}
                  onPick={actions.pickGift}
                  canPick={isMyTurn && gift.isWrapped}
                  canSteal={false}
                  revealingGiftId={revealingGiftId}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Unwrapped Gifts */}
      {unwrappedGifts.length > 0 && (
        <div>
          <div className="border-t border-white/5 mt-4 mb-6"></div>
          <h2 className="text-xl font-semibold mb-4 text-white text-center">Unwrapped Gifts</h2>
          <div className="flex flex-wrap justify-center gap-6 w-full max-w-7xl mx-auto">
            {unwrappedGifts.map((gift) => {
              const ownerName = gift.ownerId 
                ? (userNames[gift.ownerId] || userEmails[gift.ownerId] || null)
                : null;
              
              
              return (
                <GiftCard
                  key={gift.id}
                  gift={gift}
                  isWrapped={false}
                  ownerId={gift.ownerId}
                  ownerName={ownerName}
                  stealCount={gift.stealCount}
                  isFrozen={gift.isFrozen}
                  currentPlayerId={currentPlayerId}
                  userId={userId}
                  onSteal={actions.stealGift}
                  canPick={false}
                  canSteal={(()=>{const result=canSteal(gift.id);console.log('[DEBUG]',{location:'GiftGrid.jsx:canSteal',message:'canSteal result passed to GiftCard',data:{giftId:gift.id,canStealResult:result},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'});return result;})()}
                  stealBlockReason={getStealBlockReason ? getStealBlockReason(gift.id) : null}
                  revealingGiftId={revealingGiftId}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for memo
  // Only re-render if gifts object reference changes
  return (
    prevProps.gifts === nextProps.gifts &&
    prevProps.isMyTurn === nextProps.isMyTurn &&
    prevProps.currentPlayerId === nextProps.currentPlayerId &&
    prevProps.userId === nextProps.userId &&
    prevProps.userNames === nextProps.userNames &&
    prevProps.userEmails === nextProps.userEmails &&
    prevProps.revealingGiftId === nextProps.revealingGiftId
  );
});

