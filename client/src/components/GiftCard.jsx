/**
 * Gift Card Component - Memoized for Performance
 */
import { memo, useState, useEffect, useRef } from 'react';
import { Button } from './ui/Button.jsx';
import { GiftIcon, LockClosedIcon, FireIcon } from '@heroicons/react/24/outline';

export const GiftCard = memo(function GiftCard({
  gift,
  isWrapped,
  ownerId,
  stealCount,
  isFrozen,
  currentPlayerId,
  userId,
  onPick,
  onSteal,
  onEndTurn,
  canPick,
  canSteal,
  stealBlockReason,
  ownerName,
  darkMode = false,
  compact = false,
  giftNumber,
  revealingGiftId = null,
  isMyGift = false,
}) {
  const isOwned = ownerId === userId;
  const isCurrentPlayer = currentPlayerId === userId;
  // Recalculate isMyGift from gift prop to avoid stale prop values
  // This ensures the badge always shows correctly even if the passed prop is stale
  const computedIsMyGift = gift?.submitterId === userId || isMyGift;
  const [imageError, setImageError] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const revealTimerRef = useRef(null);

  // Handle reveal animation when revealingGiftId matches this gift
  useEffect(() => {
    if (revealingGiftId === gift.id && !isWrapped) {
      // Start reveal animation
      setIsRevealing(true);
      
      // Clear any existing timer
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
      }
      
      // End reveal after 3 seconds
      revealTimerRef.current = setTimeout(() => {
        setIsRevealing(false);
      }, 3000);
    } else if (revealingGiftId !== gift.id) {
      // If another gift is revealing, clear this one's reveal state
      setIsRevealing(false);
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    }
    
    // Cleanup on unmount
    return () => {
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
      }
    };
  }, [revealingGiftId, gift.id, isWrapped]);

  // Generate gradient colors for avatar based on ownerId
  const getAvatarGradient = (id) => {
    if (!id) return 'from-gray-500 to-gray-600';
    const colors = [
      'from-purple-500 to-pink-400',
      'from-blue-500 to-cyan-400',
      'from-indigo-500 to-purple-400',
      'from-pink-500 to-orange-400',
      'from-yellow-500 to-orange-400',
      'from-green-500 to-emerald-400',
    ];
    const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  // Determine if we should show wrapped state (either actually wrapped OR revealing)
  const shouldShowWrapped = isWrapped || isRevealing;
  const revealShakeClass = isRevealing ? 'animate-shake-violent' : '';
  const revealScaleClass = !isRevealing && !isWrapped ? 'animate-scale-up' : '';

  return (
    <div
      id={`gift-${gift.id}`}
      className={`bg-white/5 backdrop-blur-md border rounded-xl overflow-hidden hover:border-white/30 transition-all ${
        compact && shouldShowWrapped
          ? 'p-2 aspect-square h-24 cursor-pointer'
          : 'p-4 w-full sm:w-[280px] md:w-[320px]'
      } ${
        isFrozen 
          ? 'border-red-400/50 opacity-75' 
          : computedIsMyGift && shouldShowWrapped && isCurrentPlayer && canPick
          ? 'border-amber-400/60 ring-2 ring-amber-400/30'
          : computedIsMyGift && !shouldShowWrapped
          ? 'border-amber-400/40'
          : 'border-white/10'
      } ${isOwned ? 'ring-2 ring-indigo-500/50' : ''} ${revealShakeClass} ${revealScaleClass}`}
      onClick={compact && shouldShowWrapped && isCurrentPlayer && canPick ? () => onPick(gift.id) : undefined}
    >
      {shouldShowWrapped ? (
        compact ? (
          <div className="relative h-full flex items-center justify-center">
            <div className="text-4xl">🎁</div>
            {giftNumber && (
              <div className="absolute top-1 right-1 bg-slate-800/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-white/20">
                #{giftNumber}
              </div>
            )}
            {computedIsMyGift && (
              <div className="absolute bottom-1 left-1 bg-amber-500/90 text-white shadow-lg shadow-amber-500/50 text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 z-10 border border-amber-300/50 whitespace-nowrap">
                <span className="text-[8px]">⚠️</span>
                <span>Your Gift</span>
              </div>
            )}
            {isCurrentPlayer && canPick && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl opacity-0 hover:opacity-100 transition-opacity">
                <span className="text-white text-xs font-semibold">Click to Pick</span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 relative">
            <div className="text-6xl mb-4">🎁</div>
            {/* Show "Your Gift" badge during reveal if it's my gift */}
            {computedIsMyGift && !isWrapped && isRevealing && (
              <div className="absolute top-2 right-2 bg-amber-500/90 text-white shadow-lg shadow-amber-500/50 text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 z-20 border border-amber-300/50">
                <GiftIcon className="w-3 h-3" />
                <span>Your Gift</span>
              </div>
            )}
            <p className="text-white/50 font-medium tracking-widest uppercase mb-4">Mystery Gift</p>
            {computedIsMyGift && !isRevealing && (
              <div className="mb-3 bg-amber-500/20 border border-amber-400/50 rounded-lg px-4 py-2">
                <p className="text-amber-300 text-sm font-semibold flex items-center justify-center gap-2">
                  <span>⚠️</span>
                  <span>You added this gift</span>
                </p>
              </div>
            )}
            {isCurrentPlayer && canPick && !isRevealing && (
              <Button
                onClick={() => onPick(gift.id)}
                className="mt-4 w-full"
                variant="primary"
              >
                Pick Gift
              </Button>
            )}
          </div>
        )
      ) : (
        <div className="flex flex-col h-full">
          {/* Image or Fallback Container */}
          <div className="relative w-full h-48 rounded-lg mb-3 overflow-hidden bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500">
            {gift.image && !imageError ? (
              <img
                src={gift.image}
                alt={gift.title || 'Gift'}
                className="w-full h-full object-cover"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <GiftIcon className="w-16 h-16 text-white opacity-50" />
              </div>
            )}
            
            {/* Status Badge Overlay */}
            {isFrozen ? (
              <div className="absolute top-2 left-2 bg-cyan-500 text-white shadow-lg shadow-cyan-500/50 text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 z-10">
                <LockClosedIcon className="w-3 h-3" />
                LOCKED
              </div>
            ) : stealCount > 0 ? (
              <div className="absolute top-2 left-2 bg-orange-500 text-white shadow-lg shadow-orange-500/50 text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 z-10">
                <FireIcon className="w-3 h-3" />
                {stealCount} STEAL{stealCount !== 1 ? 'S' : ''}
              </div>
            ) : null}
            {/* Your Gift Badge - Shows on unwrapped gifts (always visible when gift is unwrapped) */}
            {computedIsMyGift && !isWrapped && (
              <div className="absolute top-2 right-2 bg-amber-500/90 text-white shadow-lg shadow-amber-500/50 text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 z-20 border border-amber-300/50">
                <GiftIcon className="w-3 h-3" />
                <span>Your Gift</span>
              </div>
            )}
          </div>
          
          <h3 className="text-white font-bold truncate mb-2">{gift.title || 'Gift'}</h3>
          {gift.url && (
            <a
              href={gift.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-300 hover:text-indigo-200 text-sm mb-3 block"
            >
              View Gift Link ↗
            </a>
          )}
          {isCurrentPlayer && !isOwned && (
            canSteal && !isFrozen ? (
              <Button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('[GiftCard] 🔘 Steal button clicked!', { giftId: gift.id, canSteal, isFrozen, isOwned });
                  console.log('[DEBUG]',{location:'GiftCard.jsx:onClick',message:'Steal button clicked',data:{giftId:gift.id,canSteal,isFrozen,isOwned},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'});
                  onSteal(gift.id);
                }}
                className="w-full mt-auto"
                variant="secondary"
                disabled={false}
              >
                Steal Gift
              </Button>
            ) : stealBlockReason ? (
              <div className="w-full mt-auto px-3 py-2 text-center text-sm text-slate-400 bg-slate-800/50 border border-slate-700 rounded-lg">
                {stealBlockReason}
              </div>
            ) : null
          )}
          {isCurrentPlayer && isOwned && onEndTurn && (
            <Button
              onClick={() => onEndTurn()}
              className="w-full mt-auto"
              variant="secondary"
            >
              Skip Turn
            </Button>
          )}
          {/* Owner Footer */}
          {ownerId && (
            <div className="bg-black/20 p-3 flex items-center gap-2 mt-auto rounded-lg">
              <div className={`w-6 h-6 rounded-full bg-gradient-to-tr ${getAvatarGradient(ownerId)} flex items-center justify-center text-white text-xs font-bold`}>
                {ownerName ? ownerName.charAt(0).toUpperCase() : '?'}
              </div>
              <span className="text-sm text-slate-300 flex-1">
                {isOwned ? 'Held by you' : `Held by: ${ownerName || 'Player'}`}
              </span>
            </div>
          )}
          {/* Show "Your Gift" indicator even when no owner (shouldn't happen for unwrapped, but safety check) */}
          {!ownerId && computedIsMyGift && !isWrapped && (
            <div className="bg-black/20 p-3 flex items-center gap-2 mt-auto rounded-lg">
              <span className="text-amber-400 text-sm flex items-center gap-1">
                <GiftIcon className="w-4 h-4" />
                <span>Your Gift</span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for memoization
  return (
    prevProps.gift.id === nextProps.gift.id &&
    prevProps.gift.ownerId === nextProps.gift.ownerId &&
    prevProps.gift.isWrapped === nextProps.gift.isWrapped &&
    prevProps.gift.isFrozen === nextProps.gift.isFrozen &&
    prevProps.gift.stealCount === nextProps.gift.stealCount &&
    prevProps.canPick === nextProps.canPick &&
    prevProps.canSteal === nextProps.canSteal &&
    prevProps.currentPlayerId === nextProps.currentPlayerId &&
    prevProps.userId === nextProps.userId &&
    prevProps.compact === nextProps.compact &&
    prevProps.giftNumber === nextProps.giftNumber &&
    prevProps.onEndTurn === nextProps.onEndTurn &&
    prevProps.revealingGiftId === nextProps.revealingGiftId &&
    prevProps.isMyGift === nextProps.isMyGift
  );
});

