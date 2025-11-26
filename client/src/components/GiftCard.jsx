/**
 * Gift Card Component
 */
import { Button } from './ui/Button.jsx';

export function GiftCard({
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
}) {
  const isOwned = ownerId === userId;
  const isCurrentPlayer = currentPlayerId === userId;

  return (
    <div
      className={`bg-white rounded-lg shadow-md p-4 border-2 ${
        isFrozen ? 'border-red-400 opacity-75' : 'border-gray-200'
      } ${isOwned ? 'ring-2 ring-blue-500' : ''}`}
    >
      {isWrapped ? (
        <div className="text-center py-8">
          <div className="text-6xl mb-4">🎁</div>
          <p className="text-gray-600 font-semibold">Wrapped Gift</p>
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
        <div>
          {gift.image && (
            <img
              src={gift.image}
              alt={gift.title || 'Gift'}
              className="w-full h-48 object-cover rounded mb-3"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
          )}
          <h3 className="font-semibold text-lg mb-2">{gift.title || 'Gift'}</h3>
          {gift.url && (
            <a
              href={gift.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline text-sm mb-3 block"
            >
              View Gift Link ↗
            </a>
          )}
          <div className="text-sm text-gray-600 mb-3">
            {isOwned ? (
              <span className="text-blue-600">Your gift</span>
            ) : (
              <span>Owned by {ownerName || 'Player'}</span>
            )}
          </div>
          {stealCount > 0 && (
            <div className="text-xs text-gray-500 mb-2">
              Stolen {stealCount} time{stealCount !== 1 ? 's' : ''}
            </div>
          )}
          {isFrozen && (
            <div className="text-xs text-red-600 font-semibold mb-2">
              🔒 Frozen
            </div>
          )}
          {isCurrentPlayer && canSteal && !isFrozen && !isOwned && (
            <Button
              onClick={() => onSteal(gift.id)}
              className="w-full"
              variant="secondary"
            >
              Steal Gift
            </Button>
          )}
        </div>
      )}
    </div>
  );
}


