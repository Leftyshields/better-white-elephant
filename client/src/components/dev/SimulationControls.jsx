/**
 * Simulation Controls Component
 * Developer-only toolbar for stress-testing the game
 * Only appears when ?sim=true is in the URL
 */
import { useState, useEffect, useRef } from 'react';
import { useParty } from '../../hooks/useParty.js';
import { useGameReferee } from '../../hooks/useGameReferee.js';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { apiRequest } from '../../utils/api.js';
import { validateGameHistory } from '../../utils/gameValidator.js';

export function SimulationControls({ socket, partyId, gameState }) {
  
  try {
    // Check if simulation mode is enabled via URL query parameter
    const isSimMode = new URLSearchParams(window.location.search).get('sim') === 'true';
    
    // Don't render if not in sim mode
    if (!isSimMode) {
      return null;
    }

  const { participants, party } = useParty(partyId);
  const [botCount, setBotCount] = useState(10);
  const [isAutoPlay, setIsAutoPlay] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState(null);
  // Auto-expand audit trail if game is finished/ended
  const isGameFinished = party?.status === 'ENDED' || gameState?.phase === 'ENDED' || gameState?.phase === 'FINISHED';
  const [showAuditTrail, setShowAuditTrail] = useState(isGameFinished);
  const [lastGameState, setLastGameState] = useState(null);
  const [userNames, setUserNames] = useState({});
  const [userEmails, setUserEmails] = useState({});
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportDescription, setReportDescription] = useState('');
  const [minimalMode, setMinimalMode] = useState(false);
  const auditLogContainerRef = useRef(null);
  
  const canAddBots = party?.status === 'LOBBY' || party?.status === 'ACTIVE';
  
  // Expose validator on window with current game state for convenience
  useEffect(() => {
    if (lastGameState) {
      // Store game state on window for validateGame() convenience function
      window.__GAME_STATE__ = {
        history: lastGameState.history || [],
        gifts: {}, // Gift metadata not available in gameState, but validator works with IDs
        userNames: userNames,
        gameState: lastGameState, // Pass full gameState so validator can check total gift count
        maxSteals: lastGameState.config?.maxSteals || 3,
      };
    }
  }, [lastGameState, userNames]);
  
  // Load last game state from party document if game ended and no gameState provided
  useEffect(() => {
    if (!gameState && party?.status === 'ENDED' && party?.gameState) {
      setLastGameState(party.gameState);
    } else if (gameState) {
      setLastGameState(gameState);
    } else {
      setLastGameState(null);
    }
  }, [gameState, party?.status, party?.gameState]);

  // Auto-expand audit trail when game finishes
  useEffect(() => {
    const isFinished = party?.status === 'ENDED' || gameState?.phase === 'ENDED' || gameState?.phase === 'FINISHED';
    if (isFinished) {
      setShowAuditTrail(true);
    }
  }, [party?.status, gameState?.phase]);
  
  // Fetch user names for display in audit trail
  useEffect(() => {
    const fetchUserNames = async () => {
      if (!lastGameState || participants.length === 0) {
        setUserNames({});
        setUserEmails({});
        return;
      }

      try {
        // Get all unique user IDs from participants and game state
        const allUserIds = [...new Set([
          ...participants.map(p => p.id),
          lastGameState.currentPlayerId,
          ...(lastGameState.turnOrder || []),
          ...Array.from(new Map(lastGameState.unwrappedGifts || []).values()).map(g => g?.ownerId).filter(Boolean),
          ...(lastGameState.history || []).map(e => [e.playerId, e.previousOwnerId]).flat().filter(Boolean)
        ].filter(Boolean))];

        if (allUserIds.length === 0) return;

        const response = await apiRequest('/api/users/batch', {
          method: 'POST',
          body: JSON.stringify({ userIds: allUserIds }),
        });
        
        if (response.users) {
          setUserNames(response.users);
        }
        if (response.emails) {
          setUserEmails(response.emails);
        }
      } catch (error) {
        console.error('Error fetching user names:', error);
      }
    };

    fetchUserNames();
  }, [lastGameState, participants]);
  
  // Always call the hook (React hooks must be called unconditionally)
  // Pass null if no game state available - the hook handles null gracefully
  const { auditLog, addSnapshotEntry, addLogEntry } = useGameReferee(lastGameState, userNames, userEmails);

  // Listen for bot addition success, autoplay updates, and errors
  useEffect(() => {
    if (!socket) return;

    const handleBotsAdded = ({ count, bots }) => {
      console.log(`✅ Successfully added ${count} bots:`, bots);
      console.log(`📊 Current participants count: ${participants?.length || 0}`);
      console.log(`👀 Watch for "Participants updated" log from Firestore listener`);
      setFeedbackMessage({ type: 'success', text: `Successfully added ${count} bots! Check participants list.` });
    };

    const handleAutoplayToggled = ({ active }) => {
      console.log(`✅ Autoplay ${active ? 'enabled' : 'disabled'}`);
      setIsAutoPlay(active);
      setFeedbackMessage({ 
        type: 'success', 
        text: `Autoplay ${active ? 'enabled' : 'disabled'}` 
      });
    };

    const handleAutoplayUpdated = ({ active }) => {
      console.log(`📢 Autoplay updated: ${active}`);
      setIsAutoPlay(active);
    };

    const handleGameReset = () => {
      console.log('🔄 Game reset');
      setIsAutoPlay(false);
      setFeedbackMessage({ type: 'success', text: 'Game reset successfully' });
    };

    const handleBotMoveForced = ({ success, result, error }) => {
      if (success) {
        console.log(`✅ Bot move forced:`, result);
        setFeedbackMessage({ 
          type: 'success', 
          text: `Bot moved: ${result.action || 'endTurn'}` 
        });
      } else if (error) {
        const errorMessage = `Bot move failed: ${error}`;
        setFeedbackMessage({ type: 'error', text: errorMessage });
        // Add to audit trail
        if (addLogEntry) {
          addLogEntry('ERROR', errorMessage);
        }
      }
    };

    const handleError = ({ message, code }) => {
      console.error('❌ Socket error:', message, { code });
      setFeedbackMessage({ type: 'error', text: `Error: ${message}` });
      // Add to audit trail
      if (addLogEntry) {
        addLogEntry('ERROR', `Socket Error: ${message}`, { code });
      }
    };
    
    // Handle unhandled errors from bot actions
    const handleBotActionError = (error) => {
      console.error('❌ Bot action error:', error);
      setFeedbackMessage({ type: 'error', text: `Bot action failed: ${error?.message || 'Unknown error'}` });
    };

    socket.on('bots-added', handleBotsAdded);
    socket.on('autoplay-toggled', handleAutoplayToggled);
    socket.on('autoplay-updated', handleAutoplayUpdated);
    socket.on('game-reset', handleGameReset);
    socket.on('bot-move-forced', handleBotMoveForced);
    socket.on('error', handleError);
    
    // Wrap socket handlers in try-catch to prevent crashes
    const safeEmit = (event, data) => {
      try {
        socket.emit(event, data);
      } catch (error) {
        handleBotActionError(error);
      }
    };
    
    // Store safeEmit for use in handlers
    window.__safeSocketEmit = safeEmit;

    return () => {
      socket.off('bots-added', handleBotsAdded);
      socket.off('autoplay-toggled', handleAutoplayToggled);
      socket.off('autoplay-updated', handleAutoplayUpdated);
      socket.off('game-reset', handleGameReset);
      socket.off('bot-move-forced', handleBotMoveForced);
      socket.off('error', handleError);
    };
  }, [socket]);

  // Clear feedback message after longer duration for errors
  useEffect(() => {
    if (feedbackMessage) {
      const duration = feedbackMessage.type === 'error' ? 8000 : 3000; // Show errors for 8 seconds
      const timer = setTimeout(() => setFeedbackMessage(null), duration);
      return () => clearTimeout(timer);
    }
  }, [feedbackMessage]);

  // Handle adding bots
  const handleAddBots = () => {
    console.log('🔍 handleAddBots called:', { 
      hasSocket: !!socket, 
      socketConnected: socket?.connected, 
      socketId: socket?.id,
      botCount,
      partyId 
    });
    
    if (!socket) {
      console.error('❌ No socket available');
      setFeedbackMessage({ type: 'error', text: 'Socket not initialized' });
      return;
    }

    if (!socket.connected) {
      console.error('❌ Socket not connected:', { socketId: socket.id, connected: socket.connected });
      setFeedbackMessage({ type: 'error', text: 'Socket not connected. Please wait...' });
      return;
    }

    try {
      console.log(`📤 Emitting admin_batch_add_bots:`, { 
        count: botCount, 
        partyId, 
        socketId: socket.id, 
        connected: socket.connected,
        socketExists: !!socket
      });
      
      if (!socket.connected) {
        console.error('❌ Socket not connected!');
        setFeedbackMessage({ type: 'error', text: 'Socket not connected. Please refresh the page.' });
        return;
      }
      
      socket.emit('admin_batch_add_bots', { 
        count: botCount,
        partyId 
      });
      console.log(`🤖 Emitted admin_batch_add_bots event. Waiting for server response...`);
      setFeedbackMessage({ type: 'success', text: `Adding ${botCount} bots...` });
      
      // Set a timeout to detect if server doesn't respond
      setTimeout(() => {
        if (participants?.length < botCount + 1) {
          console.warn(`⚠️ No response from server after 3 seconds. Check server logs.`);
          setFeedbackMessage({ type: 'error', text: 'No response from server. Check server logs.' });
        }
      }, 3000);
    } catch (error) {
      console.error('❌ Error adding bots:', error);
      setFeedbackMessage({ type: 'error', text: `Failed to add bots: ${error.message}` });
    }
  };

  // Handle auto-play toggle
  const handleToggleAutoPlay = () => {
    if (!socket || !socket.connected) {
      console.warn('⚠️ Cannot toggle auto-play - socket not connected');
      return;
    }

    const newState = !isAutoPlay;
    setIsAutoPlay(newState);

    try {
      socket.emit('admin_toggle_autoplay', { 
        active: newState,
        partyId 
      });
      console.log(`🎮 Auto-play ${newState ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('Error toggling auto-play:', error);
      // Revert state on error
      setIsAutoPlay(!newState);
    }
  };

  // Handle reset game
  const handleResetGame = () => {
    if (!socket || !socket.connected) {
      console.warn('⚠️ Cannot reset game - socket not connected');
      return;
    }

    if (!confirm('Are you sure you want to reset the game? This will clear all game state.')) {
      return;
    }

    try {
      socket.emit('admin_reset_game', { partyId });
      console.log(`🔄 Resetting game for party ${partyId}`);
    } catch (error) {
      console.error('Error resetting game:', error);
    }
  };

  // Handle force bot move
  const handleForceBotMove = () => {
    try {
      if (!socket || !socket.connected) {
        console.warn('⚠️ Cannot force bot move - socket not connected');
        setFeedbackMessage({ type: 'error', text: 'Socket not connected' });
        return;
      }

      if (!lastGameState || lastGameState.phase !== 'ACTIVE') {
        setFeedbackMessage({ type: 'error', text: 'Game is not active' });
        return;
      }

      const currentPlayerId = lastGameState.currentPlayerId;
      if (!currentPlayerId || !currentPlayerId.startsWith('bot_')) {
        setFeedbackMessage({ type: 'error', text: 'Current player is not a bot' });
        return;
      }

      socket.emit('admin_force_bot_move', { partyId });
      console.log(`🤖 Forcing bot move for party ${partyId}`);
      setFeedbackMessage({ type: 'success', text: 'Forcing bot move...' });
    } catch (error) {
      console.error('Error forcing bot move:', error);
      const errorMessage = `Failed to force bot move: ${error.message}`;
      setFeedbackMessage({ type: 'error', text: errorMessage });
      // Add to audit trail
      if (addLogEntry) {
        addLogEntry('ERROR', errorMessage);
      }
    }
  };

  const handleForceBotSteal = () => {
    try {
      if (!socket || !socket.connected) {
        console.warn('⚠️ Cannot force bot steal - socket not connected');
        setFeedbackMessage({ type: 'error', text: 'Socket not connected' });
        return;
      }

      if (!lastGameState || lastGameState.phase !== 'ACTIVE') {
        setFeedbackMessage({ type: 'error', text: 'Game is not active' });
        return;
      }

      const currentPlayerId = lastGameState.currentPlayerId;
      if (!currentPlayerId || !currentPlayerId.startsWith('bot_')) {
        setFeedbackMessage({ type: 'error', text: 'Current player is not a bot' });
        return;
      }

      socket.emit('admin_force_bot_steal', { partyId });
      console.log(`🤖 Forcing bot steal for party ${partyId}`);
      setFeedbackMessage({ type: 'success', text: 'Forcing bot to steal...' });
    } catch (error) {
      console.error('Error forcing bot steal:', error);
      const errorMessage = `Failed to force bot steal: ${error.message}`;
      setFeedbackMessage({ type: 'error', text: errorMessage });
      // Add to audit trail
      if (addLogEntry) {
        addLogEntry('ERROR', errorMessage);
      }
    }
  };

  const handleForceBotPick = () => {
    try {
      if (!socket || !socket.connected) {
        console.warn('⚠️ Cannot force bot pick - socket not connected');
        setFeedbackMessage({ type: 'error', text: 'Socket not connected' });
        return;
      }

      if (!lastGameState || lastGameState.phase !== 'ACTIVE') {
        setFeedbackMessage({ type: 'error', text: 'Game is not active' });
        return;
      }

      const currentPlayerId = lastGameState.currentPlayerId;
      if (!currentPlayerId || !currentPlayerId.startsWith('bot_')) {
        setFeedbackMessage({ type: 'error', text: 'Current player is not a bot' });
        return;
      }

      socket.emit('admin_force_bot_pick', { partyId });
      console.log(`🤖 Forcing bot pick for party ${partyId}`);
      setFeedbackMessage({ type: 'success', text: 'Forcing bot to pick...' });
    } catch (error) {
      console.error('Error forcing bot pick:', error);
      const errorMessage = `Failed to force bot pick: ${error.message}`;
      setFeedbackMessage({ type: 'error', text: errorMessage });
      // Add to audit trail
      if (addLogEntry) {
        addLogEntry('ERROR', errorMessage);
      }
    }
  };

  const handleForceBotSkip = () => {
    try {
      if (!socket || !socket.connected) {
        console.warn('⚠️ Cannot force bot skip - socket not connected');
        setFeedbackMessage({ type: 'error', text: 'Socket not connected' });
        return;
      }

      if (!lastGameState || lastGameState.phase !== 'ACTIVE') {
        setFeedbackMessage({ type: 'error', text: 'Game is not active' });
        return;
      }

      const currentPlayerId = lastGameState.currentPlayerId;
      if (!currentPlayerId || !currentPlayerId.startsWith('bot_')) {
        setFeedbackMessage({ type: 'error', text: 'Current player is not a bot' });
        return;
      }

      socket.emit('admin_force_bot_skip', { partyId });
      console.log(`🤖 Forcing bot skip for party ${partyId}`);
      setFeedbackMessage({ type: 'success', text: 'Forcing bot to skip...' });
    } catch (error) {
      console.error('Error forcing bot skip:', error);
      const errorMessage = `Failed to force bot skip: ${error.message}`;
      setFeedbackMessage({ type: 'error', text: errorMessage });
      // Add to audit trail
      if (addLogEntry) {
        addLogEntry('ERROR', errorMessage);
      }
    }
  };

  // Check if current player is a bot
  const isCurrentPlayerBot = lastGameState && 
    lastGameState.phase === 'ACTIVE' && 
    lastGameState.currentPlayerId && 
    lastGameState.currentPlayerId.startsWith('bot_');

  // Capture snapshot function
  const captureSnapshot = (userDescription) => {
    return {
      gameState: JSON.parse(JSON.stringify(lastGameState || {})), // Deep clone
      userDescription,
      browserInfo: {
        userAgent: navigator.userAgent,
        url: window.location.href,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        }
      },
      auditLogContext: auditLog.slice(0, 20) // Last 20 entries
    };
  };

  // Handle report submission
  const handleReportSubmit = () => {
    if (!reportDescription.trim()) {
      setFeedbackMessage({ type: 'error', text: 'Please describe the issue' });
      return;
    }

    if (!lastGameState) {
      setFeedbackMessage({ type: 'error', text: 'No game state available to capture' });
      return;
    }

    const snapshot = captureSnapshot(reportDescription.trim());
    addSnapshotEntry(snapshot);
    
    setFeedbackMessage({ type: 'success', text: 'Issue report captured with full state snapshot!' });
    setShowReportModal(false);
    setReportDescription('');
  };

  // Handle report cancel
  const handleReportCancel = () => {
    setShowReportModal(false);
    setReportDescription('');
  };

  // Auto-scroll audit log to top (newest entries) when new entries are added
  useEffect(() => {
    if (auditLogContainerRef.current && auditLog && auditLog.length > 0 && showAuditTrail) {
      auditLogContainerRef.current.scrollTop = 0;
    }
  }, [auditLog?.length, showAuditTrail]);

  const formatTimestamp = (date) => {
    try {
      if (!date) return 'N/A';
      const d = date instanceof Date ? date : new Date(date);
      if (isNaN(d.getTime())) return 'Invalid Date';
      const hours = d.getHours().toString().padStart(2, '0');
      const minutes = d.getMinutes().toString().padStart(2, '0');
      const seconds = d.getSeconds().toString().padStart(2, '0');
      const milliseconds = d.getMilliseconds().toString().padStart(3, '0');
      return `${hours}:${minutes}:${seconds}.${milliseconds}`;
    } catch (error) {
      return 'N/A';
    }
  };

  const getEntryColor = (entry) => {
    if (entry.type === 'SNAPSHOT') {
      return 'text-purple-400';
    }
    const eventType = entry.eventType || entry.type;
    switch (eventType) {
      case 'TURN':
        return 'text-green-400';
      case 'STEAL':
        return 'text-yellow-400';
      case 'ERROR':
        return 'text-red-400';
      case 'WARNING':
        return 'text-orange-400';
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
      case 'STEAL':
        return '🟡';
      case 'ERROR':
        return '🔴';
      case 'WARNING':
        return '🟠';
      default:
        return '⚪';
    }
  };

  // Check socket readiness - also check if socket exists and is in a valid state
  const isSocketReady = socket && (socket.connected || socket.io?.readyState === 'open');

    return (
    <div className="fixed bottom-4 left-4 z-[9999]">
      <div className={`bg-slate-950/90 border border-red-500/30 rounded-lg shadow-2xl backdrop-blur-md flex flex-col ${
        minimalMode ? 'p-2' : 'p-4 w-80 max-h-[85vh]'
      }`}>
        {/* Header with Minimal Mode Toggle */}
        <div className="flex items-center justify-between mb-3">
          {!minimalMode && (
            <div className="text-red-400 font-mono text-xs uppercase tracking-wider">
              🛠️ Sim Tools
            </div>
          )}
          <button
            onClick={() => setMinimalMode(!minimalMode)}
            className={`text-xs px-2 py-1 rounded transition-colors ${
              minimalMode
                ? 'bg-green-600 hover:bg-green-500 text-white'
                : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
            }`}
            title={minimalMode ? 'Show all controls' : 'Hide all except force steal/pick'}
          >
            {minimalMode ? '👁️ Show All' : '👁️‍🗨️ Minimal'}
          </button>
        </div>

        {!minimalMode && (
          <>
            {/* Participant Count */}
            <div className="mb-3 text-xs text-slate-400">
              Participants: <span className="text-white font-bold">{participants?.length || 0}</span>
              {participants && participants.length > 0 && (
                <div className="mt-1 text-xs text-slate-500">
                  ({participants.filter(p => p.id?.startsWith('bot_')).length} bots)
                </div>
              )}
            </div>

            {/* Feedback Message */}
            {feedbackMessage && (
              <div className={`mb-3 text-xs px-2 py-1 rounded animate-pulse ${
                feedbackMessage.type === 'success' 
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                  : 'bg-red-500/30 text-red-300 border-2 border-red-500/50 font-semibold'
              }`}>
                {feedbackMessage.text}
              </div>
            )}

            {/* Batch Bot Adder */}
            <div className="mb-4">
              {party?.status && party.status !== 'LOBBY' && party.status !== 'ACTIVE' && (
                <div className="mb-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1">
                  ⚠️ Bots can only be added in LOBBY or ACTIVE status
                </div>
              )}
              {party?.status === 'ACTIVE' && (
                <div className="mb-2 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/30 rounded px-2 py-1">
                  ⚠️ Bots added during active game won't join current game
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={botCount}
                  onChange={(e) => setBotCount(parseInt(e.target.value) || 1)}
                  className="bg-black border border-slate-700 text-white w-12 rounded px-1 text-xs"
                  disabled={!isSocketReady || !canAddBots}
                />
                <button
                  onClick={handleAddBots}
                  disabled={!isSocketReady || !canAddBots}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-xs px-3 py-1 rounded ml-2 flex-1 transition-colors"
                >
                  Add Bots
                </button>
              </div>
            </div>

            {/* Auto-Play Toggle */}
            <div className="mb-4">
              <button
                onClick={handleToggleAutoPlay}
                disabled={!isSocketReady}
                className={`w-full text-white text-xs px-3 py-2 rounded transition-colors ${
                  isAutoPlay
                    ? 'bg-green-600 hover:bg-green-500'
                    : 'bg-slate-600 hover:bg-slate-500'
                } disabled:bg-slate-700 disabled:cursor-not-allowed`}
              >
                Auto-Play: {isAutoPlay ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* Force Bot Move Button */}
            {lastGameState && lastGameState.phase === 'ACTIVE' && (
              <div className="mb-4">
                <button
                  onClick={handleForceBotMove}
                  disabled={!isSocketReady || !isCurrentPlayerBot}
                  className={`w-full text-white text-xs px-3 py-2 rounded transition-colors ${
                    isCurrentPlayerBot
                      ? 'bg-purple-600 hover:bg-purple-500'
                      : 'bg-slate-700'
                  } disabled:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50`}
                  title={isCurrentPlayerBot ? 'Force current bot to make a move (random)' : 'Current player is not a bot'}
                >
                  🤖 Force Bot Move
                </button>
              </div>
            )}
          </>
        )}

        {/* Force Steal/Pick/Skip Buttons - Always visible */}
        {lastGameState && lastGameState.phase === 'ACTIVE' && (
          <div className={minimalMode ? 'space-y-2' : 'mb-4 space-y-2'}>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={handleForceBotSteal}
                disabled={!isSocketReady || !isCurrentPlayerBot}
                className={`text-white text-xs px-2 py-2 rounded transition-colors ${
                  isCurrentPlayerBot
                    ? 'bg-red-600 hover:bg-red-500'
                    : 'bg-slate-700'
                } disabled:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50`}
                title={isCurrentPlayerBot ? 'Force bot to steal a gift' : 'Current player is not a bot'}
              >
                🎯 Force Steal
              </button>
              <button
                onClick={handleForceBotPick}
                disabled={!isSocketReady || !isCurrentPlayerBot}
                className={`text-white text-xs px-2 py-2 rounded transition-colors ${
                  isCurrentPlayerBot
                    ? 'bg-blue-600 hover:bg-blue-500'
                    : 'bg-slate-700'
                } disabled:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50`}
                title={isCurrentPlayerBot ? 'Force bot to pick a wrapped gift' : 'Current player is not a bot'}
              >
                🎁 Force Pick
              </button>
              <button
                onClick={handleForceBotSkip}
                disabled={!isSocketReady || !isCurrentPlayerBot}
                className={`text-white text-xs px-2 py-2 rounded transition-colors ${
                  isCurrentPlayerBot
                    ? 'bg-purple-600 hover:bg-purple-500'
                    : 'bg-slate-700'
                } disabled:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50`}
                title={isCurrentPlayerBot ? 'Force bot to skip their turn' : 'Current player is not a bot'}
              >
                ⏭️ Force Skip
              </button>
            </div>
            {!isCurrentPlayerBot && lastGameState.currentPlayerId && !minimalMode && (
              <div className="mt-1 text-[10px] text-slate-500 text-center">
                {lastGameState.currentPlayerId.startsWith('bot_') 
                  ? 'Waiting for bot turn...' 
                  : 'Not a bot\'s turn'}
              </div>
            )}
          </div>
        )}

        {!minimalMode && (
          <>
            {/* Reset Button */}
            <button
              onClick={handleResetGame}
              disabled={!isSocketReady}
              className="text-slate-500 hover:text-white disabled:text-slate-700 disabled:cursor-not-allowed text-xs mt-4 underline transition-colors w-full text-left"
            >
              Reset Game
            </button>

            {/* Connection Status Indicator */}
            {!isSocketReady && (
              <div className="text-red-400 text-xs mt-2">
                ⚠️ Socket not connected
              </div>
            )}

            {/* Audit Trail Section */}
            {(gameState || party?.status === 'ENDED') && (
          <>
            <div className="border-t border-red-500/20 my-3"></div>
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => setShowAuditTrail(!showAuditTrail)}
                className="flex items-center justify-between flex-1 text-left text-red-400 font-mono text-xs uppercase tracking-wider hover:text-red-300 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span>📋 Audit Trail</span>
                  {auditLog && auditLog.length > 0 && (
                    <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                      {auditLog.length}
                    </span>
                  )}
                </div>
                {showAuditTrail ? (
                  <ChevronDownIcon className="w-4 h-4" />
                ) : (
                  <ChevronUpIcon className="w-4 h-4" />
                )}
              </button>
              <div className="flex items-center gap-2">
                {auditLog && auditLog.length > 0 && (
                  <button
                    onClick={() => {
                      try {
                        if (!auditLog || !Array.isArray(auditLog)) {
                          setFeedbackMessage({ type: 'error', text: 'Audit log not available' });
                          return;
                        }
                        const logText = auditLog
                          .map((entry) => {
                            if (!entry) return '';
                            const timestamp = entry.timestamp ? formatTimestamp(entry.timestamp) : 'N/A';
                            const typeLabel = entry.type === 'SNAPSHOT' ? 'SNAPSHOT' : (entry.eventType || entry.type || 'UNKNOWN');
                            let line = `[${typeLabel}] ${timestamp} - ${entry.message || 'No message'}`;
                            if (entry.type === 'SNAPSHOT' && entry.snapshot) {
                              line += `\n\n--- SNAPSHOT DATA ---\n`;
                              line += `Description: ${entry.snapshot.userDescription || 'N/A'}\n`;
                              if (entry.snapshot.browserInfo) {
                                line += `Browser: ${entry.snapshot.browserInfo.userAgent || 'N/A'}\n`;
                                line += `URL: ${entry.snapshot.browserInfo.url || 'N/A'}\n`;
                                if (entry.snapshot.browserInfo.viewport) {
                                  line += `Viewport: ${entry.snapshot.browserInfo.viewport.width || 'N/A'}x${entry.snapshot.browserInfo.viewport.height || 'N/A'}\n`;
                                }
                              }
                              try {
                                line += `\nGame State:\n${JSON.stringify(entry.snapshot.gameState || {}, null, 2)}\n`;
                              } catch (e) {
                                line += `\nGame State: [Error serializing]\n`;
                              }
                              if (entry.snapshot.auditLogContext && Array.isArray(entry.snapshot.auditLogContext) && entry.snapshot.auditLogContext.length > 0) {
                                line += `\nRecent Audit Context (${entry.snapshot.auditLogContext.length} entries):\n`;
                                entry.snapshot.auditLogContext.forEach((ctxEntry) => {
                                  if (!ctxEntry) return;
                                  const ctxTimestamp = ctxEntry.timestamp ? formatTimestamp(ctxEntry.timestamp) : 'N/A';
                                  const ctxTypeLabel = ctxEntry.type === 'SNAPSHOT' ? 'SNAPSHOT' : (ctxEntry.eventType || ctxEntry.type || 'UNKNOWN');
                                  line += `  [${ctxTypeLabel}] ${ctxTimestamp} - ${ctxEntry.message || 'No message'}\n`;
                                });
                              }
                              line += `\n--- END SNAPSHOT ---\n`;
                            }
                            return line;
                          })
                          .filter(Boolean)
                          .join('\n');
                        navigator.clipboard.writeText(logText).then(() => {
                          setFeedbackMessage({ type: 'success', text: 'Audit trail copied to clipboard!' });
                        }).catch((err) => {
                          console.error('Failed to copy:', err);
                          setFeedbackMessage({ type: 'error', text: 'Failed to copy to clipboard' });
                        });
                      } catch (error) {
                        console.error('Error copying audit log:', error);
                        setFeedbackMessage({ type: 'error', text: `Error: ${error.message}` });
                      }
                    }}
                    className="text-slate-400 hover:text-white text-xs px-2 py-1 border border-slate-600 hover:border-slate-500 rounded transition-colors"
                    title="Copy audit trail to clipboard"
                  >
                    📋 Copy
                  </button>
                )}
                <button
                  onClick={() => setShowReportModal(true)}
                  className="text-amber-400 hover:text-amber-300 text-xs px-2 py-1 border border-amber-600 hover:border-amber-500 rounded transition-colors"
                  title="Report an issue with full state snapshot"
                >
                  📝 Report
                </button>
              </div>
            </div>

            {showAuditTrail && (
              <div 
                ref={auditLogContainerRef}
                className="mt-2 overflow-y-auto max-h-[400px] space-y-1 pr-1"
                style={{ scrollbarWidth: 'thin' }}
              >
                {!auditLog || auditLog.length === 0 ? (
                  <div className="text-slate-500 text-xs text-center py-4">
                    No events yet. Waiting for game activity...
                  </div>
                ) : (
                  auditLog.map((entry, index) => {
                    if (!entry) return null;
                    const eventType = entry.type === 'SNAPSHOT' ? 'SNAPSHOT' : (entry.eventType || entry.type || 'UNKNOWN');
                    const borderColor = entry.type === 'SNAPSHOT'
                      ? 'border-purple-500 bg-purple-500/10 border-dashed'
                      : eventType === 'ERROR'
                      ? 'border-red-500 bg-red-500/10'
                      : eventType === 'WARNING'
                      ? 'border-orange-500 bg-orange-500/10'
                      : eventType === 'STEAL'
                      ? 'border-yellow-500 bg-yellow-500/10'
                      : eventType === 'SKIP'
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-green-500 bg-green-500/10';
                    
                    return (
                      <div
                        key={entry.id || `entry-${index}`}
                        className={`p-2 rounded border-l-2 text-xs ${borderColor}`}
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-sm flex-shrink-0">{getEntryIcon(entry)}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className={`font-bold ${getEntryColor(entry)}`}>
                                [{eventType}]
                              </span>
                              <span className="text-slate-400 text-[10px]">
                                {entry.timestamp ? formatTimestamp(entry.timestamp) : 'N/A'}
                              </span>
                            </div>
                            <div className="text-slate-200 break-words text-[11px]">{entry.message || 'No message'}</div>
                            
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
                                    {(() => {
                                      try {
                                        return JSON.stringify(entry.snapshot.gameState || {}, null, 2);
                                      } catch (e) {
                                        return '[Error serializing game state]';
                                      }
                                    })()}
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
                                        if (!ctxEntry) return null;
                                        const ctxEventType = ctxEntry.type === 'SNAPSHOT' ? 'SNAPSHOT' : (ctxEntry.eventType || ctxEntry.type || 'UNKNOWN');
                                        return (
                                          <div key={idx} className="p-1.5 bg-black/30 rounded text-[10px] text-slate-400">
                                            <span className="text-purple-400">[{ctxEventType}]</span> {ctxEntry.timestamp ? formatTimestamp(ctxEntry.timestamp) : 'N/A'} - {ctxEntry.message || 'No message'}
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
                  })
                )}
              </div>
            )}
          </>
        )}
          </>
        )}
      </div>

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[10000]">
          <div className="bg-slate-900 border border-red-500/30 rounded-lg p-6 max-w-2xl w-full mx-4 shadow-2xl">
            <h3 className="text-red-400 font-bold text-lg mb-4">📝 Report Issue</h3>
            <p className="text-slate-300 text-sm mb-4">
              Describe the issue you encountered. A full game state snapshot will be captured along with your description.
            </p>
            <textarea
              value={reportDescription}
              onChange={(e) => setReportDescription(e.target.value)}
              placeholder="What issue did you encounter? (e.g., 'Player was skipped', 'Game froze', 'Unexpected behavior')"
              className="w-full bg-black border border-slate-700 text-white rounded px-3 py-2 text-sm mb-4 min-h-[120px] focus:outline-none focus:border-red-500/50"
              autoFocus
            />
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={handleReportCancel}
                className="text-slate-400 hover:text-white text-sm px-4 py-2 border border-slate-600 hover:border-slate-500 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReportSubmit}
                className="bg-amber-600 hover:bg-amber-500 text-white text-sm px-4 py-2 rounded transition-colors font-semibold"
              >
                Submit Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
  } catch (error) {
    console.error('❌ Error in SimulationControls:', error);
    return (
      <div className="fixed bottom-4 left-4 z-[9999] bg-red-900/90 border border-red-500 rounded-lg p-4 text-red-200 text-xs">
        <div className="font-bold mb-2">⚠️ Simulation Controls Error</div>
        <div>{error.message}</div>
        <button 
          onClick={() => window.location.reload()} 
          className="mt-2 text-white underline"
        >
          Reload Page
        </button>
      </div>
    );
  }
}

