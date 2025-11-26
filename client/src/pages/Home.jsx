/**
 * Home Page
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';
import { Footer } from '../components/Footer.jsx';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { collection, addDoc, doc, setDoc, query, where, onSnapshot, orderBy, collectionGroup, getDocs } from 'firebase/firestore';
import { db } from '../utils/firebase.js';

export function Home() {
  const { user, signInWithGoogle, signInWithEmailAndPassword, signUpWithEmailAndPassword } = useAuth();
  const [partyDate, setPartyDate] = useState('');
  const [partyTitle, setPartyTitle] = useState('');
  const [myParties, setMyParties] = useState([]);
  const [loadingParties, setLoadingParties] = useState(false);
  const [partiesError, setPartiesError] = useState(null);
  const [showEmailAuth, setShowEmailAuth] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  // Check for redirect after authentication
  useEffect(() => {
    if (user) {
      const redirectPath = window.sessionStorage.getItem('redirectAfterAuth');
      if (redirectPath) {
        window.sessionStorage.removeItem('redirectAfterAuth');
        navigate(redirectPath);
      }
    }
  }, [user, navigate]);

  // Subscribe to parties where user is admin OR participant
  useEffect(() => {
    if (!user) {
      setMyParties([]);
      setLoadingParties(false);
      return;
    }

    setLoadingParties(true);
    setPartiesError(null);

    const partyMap = new Map();
    const partyUnsubscribes = new Map(); // Track individual party listeners

    // Function to update parties state
    const updateParties = () => {
      const allParties = Array.from(partyMap.values());
      // Sort manually by createdAt if it exists
      allParties.sort((a, b) => {
        try {
          const aTime = a.createdAt?.toDate?.() || (a.createdAt ? new Date(a.createdAt) : new Date(0));
          const bTime = b.createdAt?.toDate?.() || (b.createdAt ? new Date(b.createdAt) : new Date(0));
          const aTimestamp = aTime instanceof Date ? aTime.getTime() : 0;
          const bTimestamp = bTime instanceof Date ? bTime.getTime() : 0;
          return bTimestamp - aTimestamp; // Descending
        } catch (e) {
          return 0;
        }
      });
      setMyParties(allParties);
      setLoadingParties(false);
      setPartiesError(null);
    };

    // Subscribe to parties where user is admin
    const adminQuery = query(
      collection(db, 'parties'),
      where('adminId', '==', user.uid)
    );

    const unsubscribeAdmin = onSnapshot(
      adminQuery,
      (snapshot) => {
        snapshot.docs.forEach((doc) => {
          partyMap.set(doc.id, {
            id: doc.id,
            ...doc.data(),
            isAdmin: true,
          });
        });
        updateParties();
      },
      (error) => {
        console.error('Error fetching admin parties:', error);
        setPartiesError(error.message || 'Failed to load parties');
        setLoadingParties(false);
      }
    );

    // Subscribe to participants subcollections to find parties where user is participant
    const participantsQuery = collectionGroup(db, 'participants');
    const unsubscribeParticipants = onSnapshot(
      participantsQuery,
      (snapshot) => {
        // Filter to only participants with this user's ID as the document ID
        const userParticipantDocs = snapshot.docs.filter(doc => doc.id === user.uid);
        const partyIds = new Set();
        
        userParticipantDocs.forEach(doc => {
          // Get party ID from the document path: parties/{partyId}/participants/{userId}
          const partyId = doc.ref.parent.parent.id;
          partyIds.add(partyId);
        });

        // Add/update listeners for each party where user is a participant
        partyIds.forEach(partyId => {
          if (!partyUnsubscribes.has(partyId)) {
            const partyRef = doc(db, 'parties', partyId);
            const unsubscribe = onSnapshot(partyRef, (partySnap) => {
              if (partySnap.exists()) {
                partyMap.set(partySnap.id, {
                  id: partySnap.id,
                  ...partySnap.data(),
                  isAdmin: partySnap.data().adminId === user.uid,
                });
                updateParties();
              } else {
                // Party was deleted, remove it
                partyMap.delete(partySnap.id);
                partyUnsubscribes.delete(partySnap.id);
                updateParties();
              }
            }, (error) => {
              console.error(`Error listening to party ${partyId}:`, error);
            });
            partyUnsubscribes.set(partyId, unsubscribe);
          }
        });

        // Remove listeners for parties user is no longer participating in
        partyUnsubscribes.forEach((unsubscribe, partyId) => {
          if (!partyIds.has(partyId) && partyMap.get(partyId)?.isAdmin !== true) {
            unsubscribe();
            partyUnsubscribes.delete(partyId);
            partyMap.delete(partyId);
            updateParties();
          }
        });

        updateParties();
      },
      (error) => {
        console.error('Error fetching participant parties:', error);
      }
    );

    return () => {
      unsubscribeAdmin();
      unsubscribeParticipants();
      // Clean up all party listeners
      partyUnsubscribes.forEach(unsubscribe => unsubscribe());
      partyUnsubscribes.clear();
    };
  }, [user]);

  const handleCreateParty = async () => {
    if (!user) {
      alert('Please sign in first');
      return;
    }

    try {
      const partyRef = await addDoc(collection(db, 'parties'), {
        adminId: user.uid,
        title: partyTitle.trim() || null,
        date: new Date(partyDate),
        status: 'LOBBY',
        config: {
          maxSteals: 3,
          returnToStart: false,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create participant entry for admin (if not exists)
      const participantRef = doc(db, 'parties', partyRef.id, 'participants', user.uid);
      await setDoc(participantRef, {
        status: 'PENDING',
        turnNumber: null,
        ready: false,
        joinedAt: new Date(),
        updatedAt: new Date(),
      });

      navigate(`/party/${partyRef.id}`);
    } catch (error) {
      console.error('Error creating party:', error);
      alert('Failed to create party: ' + error.message);
    }
  };

  const handleEmailAuth = async (e) => {
    e?.preventDefault();
    setAuthError('');

    if (!email || !password) {
      setAuthError('Please enter both email and password');
      return;
    }

    try {
      let result;
      if (isSignUp) {
        result = await signUpWithEmailAndPassword(email, password, displayName || null);
      } else {
        result = await signInWithEmailAndPassword(email, password);
      }

      if (!result.success) {
        setAuthError(result.error || 'Authentication failed');
      } else {
        // Success - user state will update automatically
        setEmail('');
        setPassword('');
        setDisplayName('');
        setShowEmailAuth(false);
        // Redirect will be handled by useEffect watching user state
      }
    } catch (error) {
      setAuthError(error.message || 'An error occurred');
    }
  };

  if (!user) {
    return (
      <>
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-green-50 to-blue-50 relative overflow-hidden">
        {/* Snowflakes Animation */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          {[...Array(50)].map((_, i) => {
            const size = Math.random() * 20 + 10; // Random size between 10-30px
            const opacity = Math.random() * 0.5 + 0.3; // Random opacity between 0.3-0.8
            return (
              <div
                key={i}
                className="absolute animate-float"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${-Math.random() * 20}%`,
                  fontSize: `${size}px`,
                  opacity: opacity,
                  animationDelay: `${Math.random() * 5}s`,
                  animationDuration: `${8 + Math.random() * 7}s`,
                }}
              >
                ❄️
              </div>
            );
          })}
          {/* Additional smaller snowflakes */}
          {[...Array(30)].map((_, i) => {
            const size = Math.random() * 15 + 8;
            const opacity = Math.random() * 0.4 + 0.2;
            return (
              <div
                key={`small-${i}`}
                className="absolute animate-float"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${-Math.random() * 20}%`,
                  fontSize: `${size}px`,
                  opacity: opacity,
                  animationDelay: `${Math.random() * 5}s`,
                  animationDuration: `${6 + Math.random() * 6}s`,
                }}
              >
                ❄
              </div>
            );
          })}
        </div>
        
        {/* Hero Section */}
        <div className="relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
            <div className="text-center">
              <div className="mb-4 text-6xl">🎄🎁</div>
              <h1 className="text-5xl md:text-6xl font-extrabold text-gray-900 mb-4">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-600 via-green-600 to-red-600">
                  StealOrReveal.com
                </span>
              </h1>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-6">
                A Better White Elephant Gift Exchange
              </h2>
              <p className="text-xl md:text-2xl text-gray-700 mb-4 max-w-3xl mx-auto font-medium">
                🎅 The modern way to host unforgettable White Elephant gift exchanges! 
                Real-time gameplay, automatic gift tracking, and endless holiday fun! 🎉
              </p>
              <p className="text-lg text-gray-600 mb-4 max-w-2xl mx-auto">
                Open source and free forever. View the source code on{' '}
                <a 
                  href="https://github.com/Leftyshields/better-white-elephant" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 font-semibold underline"
                >
                  GitHub
                </a>
                .
              </p>
              <div className="inline-flex items-center gap-2 bg-green-100 border-2 border-green-300 rounded-full px-6 py-2 mb-8">
                <span className="text-2xl">🎁</span>
                <span className="text-lg font-bold text-green-800">100% Free - No Credit Card Required!</span>
                <span className="text-2xl">✨</span>
              </div>
              
              {/* Auth Card */}
              <div className="max-w-md mx-auto bg-white rounded-2xl shadow-2xl p-8 border-4 border-red-200 relative">
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 text-4xl">🎁</div>
                <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-4">Get Started</h2>
                <p className="text-gray-600 mb-6">
                  Sign in to create or join a White Elephant gift exchange party 🎄
                </p>
                
                {!showEmailAuth ? (
                  <div className="space-y-3">
                    <Button 
                      onClick={signInWithGoogle} 
                      className="w-full py-3 text-lg font-semibold shadow-lg hover:shadow-xl transition-all"
                    >
                      <svg className="w-5 h-5 inline-block mr-2" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      Sign in with Google
                    </Button>
                    <Button 
                      variant="secondary" 
                      onClick={() => setShowEmailAuth(true)} 
                      className="w-full py-3 text-lg font-semibold"
                    >
                      Sign in with Email
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleEmailAuth} className="space-y-4">
                    {isSignUp && (
                      <Input
                        type="text"
                        label="Display Name (optional)"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Your name"
                      />
                    )}
                    <Input
                      type="email"
                      label="Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your.email@example.com"
                      required
                    />
                    <Input
                      type="password"
                      label="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={isSignUp ? "At least 6 characters" : "Your password"}
                      required
                    />
                    {authError && (
                      <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{authError}</p>
                    )}
                    <Button type="submit" className="w-full py-3 text-lg font-semibold">
                      {isSignUp ? 'Sign Up' : 'Sign In'}
                    </Button>
                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setIsSignUp(!isSignUp);
                          setAuthError('');
                        }}
                        className="text-sm text-blue-600 hover:underline font-medium"
                      >
                        {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                      </button>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setShowEmailAuth(false);
                        setAuthError('');
                        setEmail('');
                        setPassword('');
                        setDisplayName('');
                      }}
                      className="w-full"
                    >
                      Back
                    </Button>
                  </form>
                )}
              </div>
            </div>
          </div>

          {/* Features Section */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
            <div className="grid md:grid-cols-3 gap-8 mt-16">
              <div className="text-center p-6 bg-white/80 backdrop-blur-sm rounded-xl border-2 border-red-200 shadow-lg hover:shadow-xl transition-all">
                <div className="text-5xl mb-4">⚡</div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Real-Time Gameplay</h3>
                <p className="text-gray-600">Watch the action unfold live as players steal and unwrap gifts in real-time! 🎮</p>
              </div>
              <div className="text-center p-6 bg-white/80 backdrop-blur-sm rounded-xl border-2 border-green-200 shadow-lg hover:shadow-xl transition-all">
                <div className="text-5xl mb-4">🎁</div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Easy Gift Submission</h3>
                <p className="text-gray-600">Just paste a URL - we'll automatically extract the gift details and images! ✨</p>
              </div>
              <div className="text-center p-6 bg-white/80 backdrop-blur-sm rounded-xl border-2 border-red-200 shadow-lg hover:shadow-xl transition-all">
                <div className="text-5xl mb-4">👥</div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Invite Friends</h3>
                <p className="text-gray-600">Share a link or send email invites. Everyone can join the fun instantly! 🎉</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
      </>
    );
  }

  return (
    <>
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-green-50 to-blue-50 relative overflow-hidden">
      {/* Snowflakes Animation */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        {[...Array(50)].map((_, i) => {
          const size = Math.random() * 20 + 10;
          const opacity = Math.random() * 0.5 + 0.3;
          return (
            <div
              key={i}
              className="absolute animate-float"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${-Math.random() * 20}%`,
                fontSize: `${size}px`,
                opacity: opacity,
                animationDelay: `${Math.random() * 5}s`,
                animationDuration: `${8 + Math.random() * 7}s`,
              }}
            >
              ❄️
            </div>
          );
        })}
        {/* Additional smaller snowflakes */}
        {[...Array(30)].map((_, i) => {
          const size = Math.random() * 15 + 8;
          const opacity = Math.random() * 0.4 + 0.2;
          return (
            <div
              key={`small-${i}`}
              className="absolute animate-float"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${-Math.random() * 20}%`,
                fontSize: `${size}px`,
                opacity: opacity,
                animationDelay: `${Math.random() * 5}s`,
                animationDuration: `${6 + Math.random() * 6}s`,
              }}
            >
              ❄
            </div>
          );
        })}
      </div>
      
      {/* Hero Section */}
      <div className="relative bg-gradient-to-r from-red-600 via-green-600 to-red-600 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          {[...Array(25)].map((_, i) => {
            const size = Math.random() * 30 + 20;
            return (
              <div
                key={i}
                className="absolute text-white animate-float"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  fontSize: `${size}px`,
                  animationDelay: `${Math.random() * 5}s`,
                  animationDuration: `${8 + Math.random() * 7}s`,
                }}
              >
                ❄️
              </div>
            );
          })}
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center mb-12">
            <div className="text-7xl mb-6 animate-bounce">🎄🎁🎅</div>
            <h1 className="text-5xl md:text-6xl font-extrabold mb-3">
              Welcome Back! 🎉
            </h1>
            <h2 className="text-3xl md:text-4xl font-bold text-white/95 mb-4">
              StealOrReveal.com
            </h2>
            <p className="text-xl md:text-2xl text-white/90 max-w-3xl mx-auto font-medium mb-6">
              A Better White Elephant Gift Exchange - Create a new party or manage your existing ones! 🎄✨
            </p>
            <div className="inline-flex items-center gap-2 bg-white/25 backdrop-blur-sm border-2 border-white/40 rounded-full px-8 py-3 shadow-lg mb-4">
              <span className="text-2xl">🎁</span>
              <span className="text-lg font-bold text-white">Completely Free - No Hidden Costs!</span>
              <span className="text-2xl">✨</span>
            </div>
            <p className="text-sm text-white/80 max-w-2xl mx-auto">
              Open source and free forever. View the source code on{' '}
              <a 
                href="https://github.com/Leftyshields/better-white-elephant" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-white font-semibold underline hover:text-yellow-200 transition-colors"
              >
                GitHub
              </a>
              .
            </p>
          </div>

          {/* Create Party Card */}
          <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-2xl p-8 border-4 border-red-300 relative z-10">
            <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 text-6xl animate-bounce">🎁</div>
            <div className="text-center mb-6 mt-6">
              <div className="w-24 h-24 bg-gradient-to-br from-red-500 to-green-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-xl animate-pulse">
                <span className="text-5xl">🎄</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">Create a New Party</h2>
              <p className="text-lg text-gray-600 font-medium">Set up your gift exchange in seconds! 🎅✨</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Party Title <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g., Family Christmas Exchange 2025"
                  value={partyTitle}
                  onChange={(e) => setPartyTitle(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Party Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={partyDate}
                  onChange={(e) => setPartyDate(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <Button 
                onClick={handleCreateParty} 
                className="w-full py-4 text-lg font-semibold shadow-lg hover:shadow-xl transition-all mt-6 bg-gradient-to-r from-red-600 to-green-600 hover:from-red-700 hover:to-green-700"
                disabled={!partyDate}
              >
                <span className="flex items-center justify-center gap-2">
                  <span className="text-xl">🎄</span>
                  Create Party
                  <span className="text-xl">🎁</span>
                </span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* My Parties Section */}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 z-10">
        <div className="mb-8 text-center">
          <div className="text-5xl mb-3 animate-bounce">🎅</div>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">My Parties</h2>
          <p className="text-lg text-gray-600 font-medium">Manage your gift exchanges and join ongoing games! 🎄</p>
        </div>

        {loadingParties && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Loading your parties...</p>
          </div>
        )}

        {partiesError && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 rounded-lg p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-800">
                  <strong>Note:</strong> {partiesError}
                  {partiesError.includes('index') && (
                    <span className="block mt-2">
                      The Firestore index is being created. This may take a few minutes. 
                      You can deploy it manually with: <code className="bg-yellow-100 px-2 py-1 rounded text-xs">firebase deploy --only firestore:indexes</code>
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {myParties.length === 0 && !loadingParties && !partiesError && (
          <div className="text-center py-16 bg-white rounded-2xl shadow-lg border-4 border-dashed border-red-300">
            <div className="text-6xl mb-4">🎁</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No parties yet</h3>
            <p className="text-gray-600 mb-6 font-medium">Create your first White Elephant gift exchange above! 🎄✨</p>
          </div>
        )}

        {myParties.length > 0 && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {myParties.map((party) => (
              <Link
                key={party.id}
                to={`/party/${party.id}`}
                className="group block bg-white rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden border-2 border-gray-200 hover:border-red-400 relative"
              >
                {party.status === 'LOBBY' && (
                  <div className="absolute top-2 right-2 text-2xl animate-bounce">🎄</div>
                )}
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      {party.title ? (
                        <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-red-600 transition-colors">
                          {party.title}
                        </h3>
                      ) : (
                        <h3 className="text-xl font-bold text-gray-400 mb-2">Untitled Party</h3>
                      )}
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                        <span className="text-lg">📅</span>
                        <span>
                          {party.date?.toDate 
                            ? party.date.toDate().toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric', 
                                year: 'numeric' 
                              })
                            : 'No date set'}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`px-3 py-1 text-xs font-bold rounded-full flex-shrink-0 ${
                        party.status === 'LOBBY'
                          ? 'bg-yellow-100 text-yellow-800 border-2 border-yellow-300'
                          : party.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-800 border-2 border-green-300'
                          : 'bg-gray-100 text-gray-800 border-2 border-gray-300'
                      }`}
                    >
                      {party.status}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                    <div className="text-sm text-gray-500 font-medium">
                      {party.isAdmin ? (
                        <span className="flex items-center gap-1">
                          <span className="text-lg">⭐</span>
                          You're the host
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <span className="text-lg">👤</span>
                          Participant
                        </span>
                      )}
                    </div>
                    <span className="text-xl group-hover:translate-x-1 transition-all">🎁</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <Footer />
      </div>
    </>
  );
}

