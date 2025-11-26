/**
 * Header Component - App-wide navigation with title and user menu
 */
import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

export function Header() {
  const { user, signOut, signInWithGoogle } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

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

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Title/Logo */}
          <Link to="/" className="flex items-center gap-2">
            <span className="text-2xl">🎄</span>
            <div>
              <h1 className="text-xl font-bold text-gray-900">StealOrReveal.com</h1>
              <p className="text-xs text-gray-500">Better White Elephant</p>
            </div>
          </Link>

          {/* User Menu */}
          <div className="relative" ref={menuRef}>
            {user ? (
              <>
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 p-2 rounded-full hover:bg-gray-100 transition-colors"
                  aria-label="User menu"
                >
                  <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                    {user.displayName?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || 'U'}
                  </div>
                  {user.displayName && (
                    <span className="hidden sm:block text-gray-700 font-medium">
                      {user.displayName}
                    </span>
                  )}
                  <svg
                    className={`w-4 h-4 text-gray-500 transition-transform ${
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
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-50">
                    <div className="py-1">
                      <div className="px-4 py-2 border-b border-gray-200">
                        <p className="text-sm font-medium text-gray-900">
                          {user.displayName || 'User'}
                        </p>
                        <p className="text-sm text-gray-500 truncate">{user.email}</p>
                      </div>
                      <Link
                        to="/profile"
                        onClick={() => setShowUserMenu(false)}
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        Profile
                      </Link>
                      <button
                        onClick={handleSignOut}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
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
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
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
    </header>
  );
}

