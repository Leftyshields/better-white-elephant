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
  // #region agent log
  fetch('http://localhost:7243/ingest/aa8b9df8-f732-4ee4-afb1-02470529209e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'GiftGrid.jsx:RENDER',message:'GiftGrid render',data:{giftsCount:Object.keys(gifts||{}).length,firstGiftId:Object.keys(gifts||{})[0],firstGiftHasImage:!!gifts?.[Object.keys(gifts||{})[0]]?.image,firstGiftImage:gifts?.[Object.keys(gifts||{})[0]]?.image},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B,C,D'})}).catch(()=>{});
  // #endregion
  const giftList = Object.values(gifts || {});
  
  // Separate wrapped and unwrapped gifts
  const wrappedGifts = giftList.filter(gift => gift.isWrapped);
  
  // #region agent log
  wrappedGifts.forEach(gift => {
    fetch('http://localhost:7243/ingest/aa8b9df8-f732-4ee4-afb1-02470529209e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'GiftGrid.jsx:WRAPPED_GIFT',message:'Wrapped gift data',data:{giftId:gift.id,hasImage:!!gift.image,imageUrl:gift.image,title:gift.title,isWrapped:gift.isWrapped},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  });
  // #endregion
  
  // Sort unwrapped gifts by lastInteractedAt (most recent first)
  const unwrappedGifts = giftList
    .filter(gift => !gift.isWrapped)
    .sort((a, b) => {
      const aTime = a.lastInteractedAt || 0;
      const bTime = b.lastInteractedAt || 0;
      if (bTime !== aTime) return bTime - aTime; // Most recent first
      return (a.id || '').localeCompare(b.id || ''); // Fallback to ID for stable sort
    });
  
  // #region agent log
  fetch('http://localhost:7243/ingest/aa8b9df8-f732-4ee4-afb1-02470529209e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'GiftGrid.jsx:AFTER_SORT',message:'After filtering and sorting',data:{wrappedCount:wrappedGifts.length,unwrappedCount:unwrappedGifts.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
  // #endregion

  return (
    <div className="space-y-8">
      {/* Wrapped Gifts */}
      {wrappedGifts.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-white text-center">Wrapped Gifts</h2>
          <div className="flex flex-wrap justify-center gap-3 w-full">
            {wrappedGifts.map((gift, index) => {
              // #region agent log
              fetch('http://localhost:7243/ingest/aa8b9df8-f732-4ee4-afb1-02470529209e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'GiftGrid.jsx:WRAPPED_RENDER',message:'Rendering wrapped gift card',data:{giftId:gift.id,hasImage:!!gift.image,imageUrl:gift.image,compact:true,giftNumber:index+1},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B,C'})}).catch(()=>{});
              // #endregion
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
              
              // #region agent log
              fetch('http://localhost:7243/ingest/aa8b9df8-f732-4ee4-afb1-02470529209e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'GiftGrid.jsx:UNWRAPPED_RENDER',message:'Rendering unwrapped gift card',data:{giftId:gift.id,hasImage:!!gift.image,imageUrl:gift.image},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
              // #endregion
              
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

