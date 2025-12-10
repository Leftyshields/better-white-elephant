/**
 * Game Audit Trail Component (Developer Mode)
 * Real-time game state validator and audit log
 * Only visible when ?sim=true is in the URL
 */
import { useState, useEffect, useRef } from 'react';
import { useGameReferee } from '../../hooks/useGameReferee.js';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';

export function GameAuditTrail({ gameState }) {
  // Check if simulation mode is enabled via URL query parameter
  const isSimMode = new URLSearchParams(window.location.search).get('sim') === 'true';
  const [isCollapsed, setIsCollapsed] = useState(false);
  const logContainerRef = useRef(null);

  // Don't render if not in sim mode
  if (!isSimMode) {
    return null;
  }

  const { auditLog } = useGameReferee(gameState);

  // Auto-scroll to top (newest entries) when new entries are added
  // New entries are prepended, so they appear at the top
  useEffect(() => {
    if (logContainerRef.current && auditLog.length > 0) {
      logContainerRef.current.scrollTop = 0;
    }
  }, [auditLog.length]);

  const formatTimestamp = (date) => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const milliseconds = date.getMilliseconds().toString().padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${milliseconds}`;
  };

  const getEntryColor = (entry) => {
    if (entry.type === 'SNAPSHOT') {
      return 'text-purple-400';
    }
    const eventType = entry.eventType || entry.type;
    switch (eventType) {
      case 'TURN':
        return 'text-green-400';
      case 'PICK':
        return 'text-cyan-400';
      case 'STEAL':
        return 'text-yellow-400';
      case 'SKIP':
        return 'text-blue-400';
      case 'ERROR':
        return 'text-red-400';
      case 'WARNING':
        return 'text-orange-400';
      case 'INFO':
        return 'text-indigo-400';
      default:
        return 'text-slate-300';
    }
  };

  const getEntryIcon = (entry) => {
    if (entry.type === 'SNAPSHOT') {
      return '📸';
    }
    const eventType = entry.eventType || entry.type;
    switch (eventType) {
      case 'TURN':
        return '🟢';
      case 'PICK':
        return '🎁';
      case 'STEAL':
        return '🟡';
      case 'SKIP':
        return '⏭️';
      case 'ERROR':
        return '🔴';
      case 'WARNING':
        return '🟠';
      case 'INFO':
        return 'ℹ️';
      default:
        return '⚪';
    }
  };

  return (
    <div className="fixed top-20 right-4 w-80 max-h-[80vh] bg-black/90 border border-slate-700 rounded-lg text-xs font-mono z-50 flex flex-col shadow-2xl">
      {/* Header */}
      <div
        className="flex items-center justify-between p-3 bg-slate-900/80 border-b border-slate-700 cursor-pointer hover:bg-slate-800/80 transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2">
          <span className="text-white font-bold">Game Audit Trail</span>
          {auditLog.length > 0 && (
            <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
              {auditLog.length}
            </span>
          )}
        </div>
        {isCollapsed ? (
          <ChevronDownIcon className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronUpIcon className="w-4 h-4 text-slate-400" />
        )}
      </div>

      {/* Log Content */}
      {!isCollapsed && (
        <div ref={logContainerRef} className="overflow-y-auto flex-1 p-2 space-y-1">
          {auditLog.length === 0 ? (
            <div className="text-slate-500 text-center py-8">
              No events yet. Waiting for game activity...
            </div>
          ) : (
            <>
              {auditLog.map((entry) => {
                const eventType = entry.type === 'SNAPSHOT' ? 'SNAPSHOT' : (entry.eventType || entry.type);
                const borderColor = entry.type === 'SNAPSHOT'
                  ? 'border-purple-500 bg-purple-500/10 border-dashed'
                  : eventType === 'ERROR'
                  ? 'border-red-500 bg-red-500/10'
                  : eventType === 'WARNING'
                  ? 'border-orange-500 bg-orange-500/10'
                  : eventType === 'INFO'
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : eventType === 'STEAL'
                  ? 'border-yellow-500 bg-yellow-500/10'
                  : eventType === 'PICK'
                  ? 'border-cyan-500 bg-cyan-500/10'
                  : eventType === 'SKIP'
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-green-500 bg-green-500/10';
                
                return (
                  <div
                    key={entry.id}
                    className={`p-2 rounded border-l-2 ${borderColor}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-sm">{getEntryIcon(entry)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`font-bold ${getEntryColor(entry)}`}>
                            [{eventType}]
                          </span>
                          <span className="text-slate-400 text-[10px]">
                            {formatTimestamp(entry.timestamp)}
                          </span>
                        </div>
                        <div className="text-slate-200 break-words">{entry.message}</div>
                        
                        {/* Snapshot Details */}
                        {entry.type === 'SNAPSHOT' && entry.snapshot && (
                          <div className="mt-2 space-y-2 pt-2 border-t border-purple-500/20">
                            <div className="text-sm text-slate-300">
                              <strong>Description:</strong> <span className="text-slate-200">{entry.snapshot.userDescription}</span>
                            </div>
                            
                            <details className="text-xs">
                              <summary className="cursor-pointer text-purple-400 hover:text-purple-300 mb-1">
                                View Game State
                              </summary>
                              <pre className="mt-2 p-2 bg-black/50 rounded overflow-auto text-[10px] text-slate-300 max-h-48">
                                {JSON.stringify(entry.snapshot.gameState, null, 2)}
                              </pre>
                            </details>
                            
                            {entry.snapshot.browserInfo && (
                              <details className="text-xs">
                                <summary className="cursor-pointer text-purple-400 hover:text-purple-300 mb-1">
                                  View Browser Info
                                </summary>
                                <div className="mt-2 p-2 bg-black/50 rounded text-[10px] text-slate-300">
                                  <div><strong>User Agent:</strong> {entry.snapshot.browserInfo.userAgent}</div>
                                  <div className="mt-1"><strong>URL:</strong> {entry.snapshot.browserInfo.url}</div>
                                  <div className="mt-1"><strong>Viewport:</strong> {entry.snapshot.browserInfo.viewport.width}x{entry.snapshot.browserInfo.viewport.height}</div>
                                </div>
                              </details>
                            )}
                            
                            {entry.snapshot.auditLogContext && entry.snapshot.auditLogContext.length > 0 && (
                              <details className="text-xs">
                                <summary className="cursor-pointer text-purple-400 hover:text-purple-300 mb-1">
                                  View Context ({entry.snapshot.auditLogContext.length} entries)
                                </summary>
                                <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                                  {entry.snapshot.auditLogContext.map((ctxEntry, idx) => {
                                    const ctxEventType = ctxEntry.type === 'SNAPSHOT' ? 'SNAPSHOT' : (ctxEntry.eventType || ctxEntry.type);
                                    return (
                                      <div key={idx} className="p-1.5 bg-black/30 rounded text-[10px] text-slate-400">
                                        <span className="text-purple-400">[{ctxEventType}]</span> {formatTimestamp(ctxEntry.timestamp)} - {ctxEntry.message}
                                      </div>
                                    );
                                  })}
                                </div>
                              </details>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

