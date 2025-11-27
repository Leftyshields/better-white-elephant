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
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 relative overflow-hidden">
        {/* Subtle Snowflakes Animation */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          {[...Array(15)].map((_, i) => {
            const size = Math.random() * 12 + 8;
            const opacity = Math.random() * 0.2 + 0.1;
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
                  animationDuration: `${10 + Math.random() * 8}s`,
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
              <div className="text-8xl md:text-9xl mb-6">🎁</div>
              <h1 className="text-3xl md:text-4xl font-semibold text-gray-700 mb-6">
                A Better White Elephant Gift Exchange
              </h1>
              <p className="text-lg md:text-xl text-gray-600 mb-6 max-w-3xl mx-auto leading-relaxed">
                The modern way to host White Elephant gift exchanges. Real-time gameplay, 
                automatic gift tracking, and seamless party management.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4 mb-8 text-sm text-gray-500">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Free to use</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span>Secure & private</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  <a 
                    href="https://github.com/Leftyshields/better-white-elephant" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-gray-600 hover:text-gray-900 font-medium"
                  >
                    Open source
                  </a>
                </div>
              </div>
              
              {/* Auth Card */}
              <div className="max-w-md mx-auto bg-white rounded-xl shadow-lg p-8 border border-gray-200">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Get Started</h2>
                <p className="text-gray-600 mb-6 text-sm">
                  Sign in to create or join a White Elephant gift exchange party
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
            <div className="grid md:grid-cols-3 gap-6 mt-16">
              <div className="text-center p-6 bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-all">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Real-Time Gameplay</h3>
                <p className="text-sm text-gray-600">Watch the action unfold live as players steal and unwrap gifts in real-time</p>
              </div>
              <div className="text-center p-6 bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-all">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Easy Gift Submission</h3>
                <p className="text-sm text-gray-600">Paste a URL and we'll automatically extract the gift details and images</p>
              </div>
              <div className="text-center p-6 bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-all">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Invite Friends</h3>
                <p className="text-sm text-gray-600">Share a link or send email invites. Everyone can join instantly</p>
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
      {/* Subtle Snowflakes Animation */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        {[...Array(15)].map((_, i) => {
          const size = Math.random() * 12 + 8;
          const opacity = Math.random() * 0.2 + 0.1;
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
                animationDuration: `${10 + Math.random() * 8}s`,
              }}
            >
              ❄
            </div>
          );
        })}
      </div>
      
      {/* Hero Section */}
      <div className="relative bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          {[...Array(8)].map((_, i) => {
            const size = Math.random() * 20 + 15;
            return (
              <div
                key={i}
                className="absolute text-white animate-float"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  fontSize: `${size}px`,
                  animationDelay: `${Math.random() * 5}s`,
                  animationDuration: `${10 + Math.random() * 8}s`,
                }}
              >
                ❄
              </div>
            );
          })}
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center mb-12">
            <div className="text-8xl md:text-9xl mb-6">🎁</div>
            <h1 className="text-3xl md:text-4xl font-semibold mb-4 text-white">
              Welcome Back
            </h1>
            <p className="text-lg md:text-xl text-white/90 max-w-2xl mx-auto mb-6">
              A Better White Elephant Gift Exchange. Create a new party or manage your existing ones.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 mb-6 text-sm text-white/80">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Free to use</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>Secure</span>
              </div>
              <a 
                href="https://github.com/Leftyshields/better-white-elephant" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-white/80 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
                <span>Open source</span>
              </a>
            </div>
          </div>

          {/* Create Party Card */}
          <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg p-8 border border-gray-200 relative z-10">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center mx-auto mb-4 shadow-md">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Create a New Party</h2>
              <p className="text-gray-600">Set up your gift exchange in seconds</p>
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder:text-gray-400"
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
              </div>
              <Button 
                onClick={handleCreateParty} 
                className="w-full py-3 text-base font-semibold shadow-md hover:shadow-lg transition-all mt-6"
                disabled={!partyDate}
              >
                Create Party
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* My Parties Section */}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 z-10">
        <div className="mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">My Parties</h2>
          <p className="text-gray-600">Manage your gift exchanges and join ongoing games</p>
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
          <div className="text-center py-16 bg-white rounded-lg border-2 border-dashed border-gray-300">
            <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No parties yet</h3>
            <p className="text-gray-600">Create your first White Elephant gift exchange above</p>
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
                    <div className="text-sm text-gray-500">
                      {party.isAdmin ? (
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                          </svg>
                          You're the host
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          Participant
                        </span>
                      )}
                    </div>
                    <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
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

