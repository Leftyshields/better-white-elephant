/**
 * Game Audit Trail Component
 * Shows a fun, engaging history of all picks and steals
 */
export function GameAuditTrail({ history, gifts, userNames, userEmails }) {
  if (!history || history.length === 0) {
    return null;
  }

  // Create a map of giftId -> gift data for quick lookup
  const giftMap = new Map();
  gifts.forEach(gift => {
    giftMap.set(gift.id, gift);
  });

  const getPlayerName = (playerId) => {
    if (!playerId) return 'Unknown';
    if (userNames[playerId]) return userNames[playerId];
    if (userEmails[playerId]) return userEmails[playerId].split('@')[0];
    return `Player ${playerId.slice(0, 8)}`;
  };

  const getGiftName = (giftId) => {
    const gift = giftMap.get(giftId);
    return gift?.title || 'Mystery Gift';
  };

  return (
    <div className="mt-16 mb-12">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/50 p-3 rounded-full">
          <svg className="w-8 h-8 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white mb-6">Game History</h2>
      </div>

      <div className="space-y-4">
        {history.map((event, index) => {
          const playerName = getPlayerName(event.playerId);
          const giftName = getGiftName(event.giftId);
          
          if (event.type === 'PICK') {
            return (
              <div
                key={index}
                className="bg-slate-800/40 border border-white/5 mb-3 rounded-xl p-4 hover:border-white/10 transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="bg-blue-500/20 border border-blue-500/30 rounded-full p-2 mt-0.5">
                    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-white">{playerName}</span>
                      <span className="text-slate-200">picked</span>
                      <span className="font-bold text-white">{giftName}</span>
                    </div>
                    <p className="text-slate-500 text-sm">🎁 Fresh from the pile!</p>
                  </div>
                  <div className="text-xs text-slate-500 font-mono">
                    #{index + 1}
                  </div>
                </div>
              </div>
            );
          } else if (event.type === 'STEAL') {
            const previousOwnerName = getPlayerName(event.previousOwnerId);
            const isFrozen = event.isFrozen;
            
            return (
              <div
                key={index}
                className={`bg-slate-800/40 border mb-3 rounded-xl p-4 hover:border-white/10 transition-all ${
                  isFrozen
                    ? 'border-red-500/30'
                    : 'border-white/5'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`rounded-full p-2 mt-0.5 border ${
                    isFrozen 
                      ? 'bg-red-500/20 border-red-500/30' 
                      : 'bg-amber-500/20 border-amber-500/30'
                  }`}>
                    <svg className={`w-5 h-5 ${isFrozen ? 'text-red-400' : 'text-amber-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-bold text-white">{playerName}</span>
                      <span className="text-slate-200">stole</span>
                      <span className="font-bold text-white">{giftName}</span>
                      <span className="text-slate-200">from</span>
                      <span className="font-bold text-white">{previousOwnerName}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-slate-200 text-sm">
                        {event.stealCount > 1 && (
                          <span className="inline-block bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold px-2 py-0.5 rounded mr-2">
                            Steal #{event.stealCount}
                          </span>
                        )}
                        {isFrozen ? (
                          <span className="text-red-400 font-semibold">🔒 Gift is now frozen!</span>
                        ) : (
                          <span className="text-slate-500">⚡ The plot thickens!</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 font-mono">
                    #{index + 1}
                  </div>
                </div>
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

