/**
 * Header Component - App-wide navigation with title and user menu
 */
import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation, useParams } from 'react-router-dom';
import { SpeakerWaveIcon, SpeakerXMarkIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../hooks/useAuth.js';
import { usePartyModal } from '../contexts/PartyModalContext.jsx';
import { useSound } from '../contexts/SoundContext.jsx';
import { useParty } from '../hooks/useParty.js';

export function Header() {
  const { user, signOut, signInWithGoogle } = useAuth();
  const { setShowModal } = usePartyModal();
  const { isMuted, toggleMute } = useSound();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const partyId = params.partyId;
  const { party } = useParty(partyId || '');
  const isAdmin = party?.adminId === user?.uid;
  const isPartyPage = location.pathname.startsWith('/party/');

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };

    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showUserMenu]);

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/');
      setShowUserMenu(false);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleEndGame = async () => {
    if (!partyId || !isAdmin) return;
    
    if (!confirm('Are you sure you want to end the game? All current ownership will be final.')) {
      return;
    }

    try {
      const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
      const token = await user.getIdToken();
      const response = await fetch(`${serverUrl}/api/game/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ partyId }),
      });

      const data = await response.json();
      if (data.success) {
        console.log('Game ended successfully');
      } else {
        alert('Failed to end game: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error ending game:', error);
      alert('Failed to end game. Please try again.');
    }
  };

  return (
    <header className="absolute top-0 left-0 right-0 z-50 bg-white/10 backdrop-blur-md border-b border-white/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Title/Logo */}
          <Link to="/" className="flex items-center gap-2">
            <span className="text-3xl">🎄</span>
            <div>
              <h1 className="text-xl font-bold text-white">StealOrReveal.com</h1>
              <p className="text-xs text-gray-200">A Better White Elephant Gift Exchange</p>
            </div>
          </Link>

          {/* Right Side Actions */}
          <div className="flex items-center gap-3">
            {/* Rules Link */}
            <Link
              to="/rules"
              className="hidden sm:block px-4 py-2 text-slate-300 hover:text-white font-medium transition-colors"
            >
              How to Play
            </Link>
            
            {/* Host Party Button - only show on home page when logged in */}
            {user && location.pathname === '/' && (
              <button
                onClick={() => setShowModal(true)}
                className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl"
              >
                Host New Party
              </button>
            )}
            
            {/* Mute Toggle Button */}
            <button
              onClick={toggleMute}
              className="p-2 rounded-full hover:bg-white/20 transition-colors"
              aria-label={isMuted ? 'Unmute sounds' : 'Mute sounds'}
              title={isMuted ? 'Unmute sounds' : 'Mute sounds'}
            >
              {isMuted ? (
                <SpeakerXMarkIcon className="w-5 h-5 text-gray-200" />
              ) : (
                <SpeakerWaveIcon className="w-5 h-5 text-gray-200" />
              )}
            </button>

            {/* Admin Manage Button - Only show on party pages when user is admin */}
            {isPartyPage && isAdmin && (
              <button
                onClick={handleEndGame}
                className="p-2 rounded-full hover:bg-white/20 transition-colors text-slate-400 hover:text-white"
                aria-label="Manage game"
                title="End Game Manually"
              >
                <Cog6ToothIcon className="w-5 h-5" />
              </button>
            )}
            
            {/* User Menu */}
            <div className="relative" ref={menuRef}>
              {user ? (
                <>
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center gap-2 p-2 rounded-full hover:bg-white/20 transition-colors"
                    aria-label="User menu"
                  >
                  <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold">
                    {user.displayName?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || 'U'}
                  </div>
                  {user.displayName && (
                    <span className="hidden sm:block text-white font-medium">
                      {user.displayName}
                    </span>
                  )}
                  <svg
                    className={`w-4 h-4 text-gray-200 transition-transform ${
                      showUserMenu ? 'transform rotate-180' : ''
                    }`}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Dropdown Menu */}
                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-slate-900/95 backdrop-blur-md rounded-md shadow-lg ring-1 ring-white/20 z-50">
                    <div className="py-1">
                      <div className="px-4 py-2 border-b border-white/20">
                        <p className="text-sm font-medium text-white">
                          {user.displayName || 'User'}
                        </p>
                        <p className="text-sm text-gray-300 truncate">{user.email}</p>
                      </div>
                      <Link
                        to="/profile"
                        onClick={() => setShowUserMenu(false)}
                        className="block px-4 py-2 text-sm text-gray-200 hover:bg-white/10 transition-colors"
                      >
                        Profile
                      </Link>
                      <button
                        onClick={handleSignOut}
                        className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-white/10 transition-colors"
                      >
                        Sign out
                      </button>
                    </div>
                  </div>
                )}
              </>
              ) : (
                <button
                  onClick={signInWithGoogle}
                  className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-md text-white border border-white/20 rounded-md hover:bg-white/20 transition-colors"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span>Sign in</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

