/**
 * Gift Card Component - Memoized for Performance
 */
import { memo } from 'react';
import { Button } from './ui/Button.jsx';

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
  canPick,
  canSteal,
  ownerName,
  darkMode = false,
}) {
  const isOwned = ownerId === userId;
  const isCurrentPlayer = currentPlayerId === userId;

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

  return (
    <div
      className={`bg-white/5 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden hover:border-white/30 transition-all p-4 w-full sm:w-[280px] md:w-[320px] ${
        isFrozen ? 'border-red-400/50 opacity-75' : ''
      } ${isOwned ? 'ring-2 ring-indigo-500/50' : ''}`}
    >
      {isWrapped ? (
        <div className="text-center py-8">
          <div className="text-6xl mb-4">🎁</div>
          <p className="text-white/50 font-medium tracking-widest uppercase mb-4">Mystery Gift</p>
          {isCurrentPlayer && canPick && (
            <Button
              onClick={() => onPick(gift.id)}
              className="mt-4 w-full"
              variant="primary"
            >
              Pick Gift
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col h-full">
          {gift.image && (
            <img
              src={gift.image}
              alt={gift.title || 'Gift'}
              className="w-full h-48 object-cover rounded-lg mb-3"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
          )}
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
          {stealCount > 0 && (
            <div className="text-xs mb-2 text-slate-400">
              Stolen {stealCount} time{stealCount !== 1 ? 's' : ''}
            </div>
          )}
          {isFrozen && (
            <div className="text-xs font-semibold mb-2 text-red-400">
              🔒 Frozen
            </div>
          )}
          {isCurrentPlayer && canSteal && !isFrozen && !isOwned && (
            <Button
              onClick={() => onSteal(gift.id)}
              className="w-full mt-auto"
              variant="secondary"
            >
              Steal Gift
            </Button>
          )}
          {/* Owner Footer */}
          {ownerId && (
            <div className="bg-black/20 p-3 flex items-center gap-2 mt-auto rounded-lg">
              <div className={`w-6 h-6 rounded-full bg-gradient-to-tr ${getAvatarGradient(ownerId)} flex items-center justify-center text-white text-xs font-bold`}>
                {ownerName ? ownerName.charAt(0).toUpperCase() : '?'}
              </div>
              <span className="text-sm text-slate-300">
                {isOwned ? 'Your gift' : `Held by: ${ownerName || 'Player'}`}
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
    prevProps.userId === nextProps.userId
  );
});

