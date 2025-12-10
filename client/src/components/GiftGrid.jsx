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
  const unwrappedGifts = giftList.filter(gift => !gift.isWrapped);

  return (
    <div className="space-y-8">
      {/* Wrapped Gifts */}
      {wrappedGifts.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-white">Wrapped Gifts</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {wrappedGifts.map((gift) => (
              <GiftCard
                key={gift.id}
                gift={gift}
                isWrapped={true}
                currentPlayerId={currentPlayerId}
                userId={userId}
                onPick={actions.pickGift}
                canPick={isMyTurn && gift.isWrapped}
                canSteal={false}
                revealingGiftId={revealingGiftId}
              />
            ))}
          </div>
        </div>
      )}

      {/* Unwrapped Gifts */}
      {unwrappedGifts.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4 text-white">Unwrapped Gifts</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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
                canSteal={canSteal(gift.id)}
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

