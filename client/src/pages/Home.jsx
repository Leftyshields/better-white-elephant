/**
 * Home Page
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';
import { Footer } from '../components/Footer.jsx';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { collection, addDoc, doc, setDoc, query, where, onSnapshot, orderBy, collectionGroup, getDocs, deleteDoc, updateDoc } from 'firebase/firestore';
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
  const [shippingAddress, setShippingAddress] = useState({
    name: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    country: '',
  });
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

  const handleDeleteParty = async (partyId, e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!confirm('Are you sure you want to delete this party? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'parties', partyId));
      // Party will be removed from the list automatically via the real-time listener
    } catch (error) {
      console.error('Error deleting party:', error);
      alert('Failed to delete party: ' + error.message);
    }
  };

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
        // If signup, save shipping address to user profile
        if (isSignUp && result.user) {
          try {
            await setDoc(doc(db, 'users', result.user.uid), {
              displayName: displayName || result.user.email || '',
              email: result.user.email || '',
              shippingAddress: shippingAddress,
              createdAt: new Date(),
              updatedAt: new Date(),
            }, { merge: true });
          } catch (error) {
            console.error('Error saving user profile:', error);
            // Don't block signup if profile save fails
          }
        }
        
        // Success - user state will update automatically
        setEmail('');
        setPassword('');
        setDisplayName('');
        setShippingAddress({
          name: '',
          street: '',
          city: '',
          state: '',
          zip: '',
          country: '',
        });
        setShowEmailAuth(false);
        // Redirect will be handled by useEffect watching user state
      }
    } catch (error) {
      setAuthError(error.message || 'An error occurred');
    }
  };

  // Live story state engine for hero section
  const [gameState, setGameState] = useState(0);
  const gameEvents = [
    {
      text: "Brian unwrapped the Vintage Vinyl! 🎸",
      action: "reveal"
    },
    {
      text: "Sarah snagged the Espresso Machine! ☕️",
      action: "steal"
    },
    {
      text: "The Gaming Pass is now FROZEN! ❄️🔒",
      action: "lock"
    }
  ];

  useEffect(() => {
    if (!user) {
      const interval = setInterval(() => {
        setGameState((prev) => (prev + 1) % gameEvents.length);
      }, 3500);
      return () => clearInterval(interval);
    }
  }, [user]);

  const scrollToFeatures = () => {
    const featuresSection = document.getElementById('features-section');
    if (featuresSection) {
      featuresSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  if (!user) {
    return (
      <>
      <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900 via-slate-900 to-black relative overflow-hidden">
        {/* Hero Section */}
        <div className="relative overflow-hidden">
          {/* Snow Animation Layers */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
            {/* Layer 1: Fastest, most visible */}
            {[...Array(30)].map((_, i) => (
              <div
                key={`snow-1-${i}`}
                className="absolute text-white animate-snow-fall"
                style={{
                  left: `${(i * 3.33) % 100}%`,
                  top: `${-Math.random() * 20}%`,
                  fontSize: `${Math.random() * 8 + 10}px`,
                  opacity: 0.6,
                  animationDelay: `${Math.random() * 5}s`,
                  animationDuration: `${15 + Math.random() * 10}s`,
                }}
              >
                ❄
              </div>
            ))}
            {/* Layer 2: Medium speed */}
            {[...Array(25)].map((_, i) => (
              <div
                key={`snow-2-${i}`}
                className="absolute text-white animate-snow-fall"
                style={{
                  left: `${(i * 4) % 100}%`,
                  top: `${-Math.random() * 20}%`,
                  fontSize: `${Math.random() * 6 + 8}px`,
                  opacity: 0.4,
                  animationDelay: `${Math.random() * 5}s`,
                  animationDuration: `${20 + Math.random() * 10}s`,
                }}
              >
                ❄
              </div>
            ))}
            {/* Layer 3: Slowest, most subtle */}
            {[...Array(20)].map((_, i) => (
              <div
                key={`snow-3-${i}`}
                className="absolute text-white animate-snow-fall"
                style={{
                  left: `${(i * 5) % 100}%`,
                  top: `${-Math.random() * 20}%`,
                  fontSize: `${Math.random() * 4 + 6}px`,
                  opacity: 0.2,
                  animationDelay: `${Math.random() * 5}s`,
                  animationDuration: `${25 + Math.random() * 10}s`,
                }}
              >
                ❄
              </div>
            ))}
          </div>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-16">
            <div className="text-center">
              <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 tracking-tight">
                The Most Fun Your Remote Team Will Have This Holiday.
              </h1>
              <p className="text-lg md:text-xl text-gray-100 mb-8 max-w-3xl mx-auto leading-relaxed">
                Ditch the spreadsheets. Host a seamless, real-time White Elephant exchange that syncs perfectly with Zoom. No logistics, just laughter.
              </p>
              
              {/* CTAs */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
                <Button 
                  onClick={signInWithGoogle} 
                  className="px-8 py-4 text-lg font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-lg hover:shadow-xl transition-all"
                >
                  Start a Party for Free
                </Button>
                <button
                  onClick={scrollToFeatures}
                  className="px-8 py-4 text-lg font-semibold bg-white/10 backdrop-blur-md text-gray-100 border border-white/25 rounded-lg hover:bg-white/10 transition-all"
                >
                  See How It Works
                </button>
              </div>

              {/* Tilted UI Mockup Placeholder */}
              <div className="max-w-4xl mx-auto mt-16 relative">
                <div 
                  className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-8 shadow-[0_0_40px_-10px_rgba(168,85,247,0.4)]"
                  style={{
                    transform: 'perspective(1000px) rotateX(5deg) rotateY(-5deg)',
                    transformStyle: 'preserve-3d',
                    boxShadow: '0 0 40px -10px rgba(168,85,247,0.4), inset 0 0 20px rgba(168,85,247,0.1)'
                  }}
                >
                  <div className="bg-gradient-to-br from-purple-500/20 to-indigo-500/20 rounded-lg p-6">
                    {/* Game Board Grid - 3x2 */}
                    <div className="grid grid-cols-3 gap-4">
                      {/* Revealed Card #1 - Espresso Machine (Dynamic Owner) */}
                      <div className="bg-white/10 border border-white/10 backdrop-blur-sm rounded-lg p-4 flex flex-col justify-between aspect-square hover:bg-white/20 transition-all duration-500 relative">
                        <div className="flex flex-col items-center flex-1 justify-center">
                          <div className="text-5xl mb-3">☕</div>
                          <p className="text-base font-semibold text-white text-center">Espresso Machine</p>
                        </div>
                        <div className="bg-black/20 w-full p-2 rounded-b-lg flex items-center gap-2">
                          {gameState === 1 ? (
                            <>
                              <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold">S</div>
                              <span className="text-indigo-300 text-xs font-semibold animate-pulse">Held by: Sarah</span>
                            </>
                          ) : (
                            <>
                              <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">T</div>
                              <span className="text-white/80 text-xs">Held by: Tom</span>
                            </>
                          )}
                        </div>
                      </div>
                      
                      {/* Card #2 - Wrapped or Revealed (Vintage Vinyl) */}
                      {gameState === 0 ? (
                        <div className="bg-white/10 border border-white/10 backdrop-blur-sm rounded-lg p-4 flex flex-col justify-between aspect-square hover:bg-white/20 transition-all duration-500 relative">
                          <div className="flex flex-col items-center flex-1 justify-center">
                            <div className="text-5xl mb-3">🎸</div>
                            <p className="text-base font-semibold text-white text-center">Vintage Vinyl</p>
                          </div>
                          <div className="bg-black/20 w-full p-2 rounded-b-lg flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center text-white text-xs font-bold">B</div>
                            <span className="text-white/80 text-xs">Held by: Brian</span>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-indigo-900/40 border border-white/10 backdrop-blur-sm rounded-lg p-4 flex flex-col justify-between items-center aspect-square hover:bg-indigo-900/50 transition-all duration-500">
                          <div className="flex flex-col items-center flex-1 justify-center">
                            <div className="text-5xl mb-3">🎁</div>
                            <p className="text-lg font-bold text-white">Gift #2</p>
                          </div>
                          <span className="text-xs uppercase tracking-wide text-white/70">WRAPPED</span>
                        </div>
                      )}
                      
                      {/* Revealed Card #3 - Craft Beer Set */}
                      <div className="bg-white/10 border border-white/10 backdrop-blur-sm rounded-lg p-4 flex flex-col justify-between aspect-square hover:bg-white/20 transition-all duration-500 relative">
                        <div className="flex flex-col items-center flex-1 justify-center">
                          <div className="text-5xl mb-3">🍺</div>
                          <p className="text-base font-semibold text-white text-center">Craft Beer Set</p>
                        </div>
                        <div className="bg-black/20 w-full p-2 rounded-b-lg flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center text-white text-xs font-bold">B</div>
                          <span className="text-white/80 text-xs">Held by: Brian</span>
                        </div>
                      </div>
                      
                      {/* Wrapped Gift #4 */}
                      <div className="bg-indigo-900/40 border border-white/10 backdrop-blur-sm rounded-lg p-4 flex flex-col justify-between items-center aspect-square hover:bg-indigo-900/50 transition-all duration-500">
                        <div className="flex flex-col items-center flex-1 justify-center">
                          <div className="text-5xl mb-3">🎁</div>
                          <p className="text-lg font-bold text-white">Gift #4</p>
                        </div>
                        <span className="text-xs uppercase tracking-wide text-white/70">WRAPPED</span>
                      </div>
                      
                      {/* Revealed Card #5 - Gaming Pass (Dynamic Lock State) */}
                      <div className={`bg-white/10 backdrop-blur-sm rounded-lg p-4 flex flex-col justify-between aspect-square hover:bg-white/20 transition-all duration-500 relative ${gameState === 2 ? 'border-cyan-400 border-2 shadow-[0_0_15px_rgba(34,211,238,0.4)]' : 'border border-white/10'}`}>
                        {gameState === 2 ? (
                          <div className="absolute top-2 right-2 bg-cyan-500 rounded-full px-2 py-1">
                            <span className="text-xs font-semibold text-black">LOCKED 🔒</span>
                          </div>
                        ) : (
                          <div className="absolute top-2 right-2 bg-red-500/80 rounded-full px-2 py-1">
                            <span className="text-xs font-semibold text-white">2 Steals</span>
                          </div>
                        )}
                        <div className="flex flex-col items-center flex-1 justify-center">
                          <div className="text-5xl mb-3">🎮</div>
                          <p className="text-base font-semibold text-white text-center">Gaming Pass</p>
                        </div>
                        <div className="bg-black/20 w-full p-2 rounded-b-lg flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-white text-xs font-bold">A</div>
                          <span className="text-white/80 text-xs">Held by: Alex</span>
                        </div>
                      </div>
                      
                      {/* Wrapped Gift #6 */}
                      <div className="bg-indigo-900/40 border border-white/10 backdrop-blur-sm rounded-lg p-4 flex flex-col justify-between items-center aspect-square hover:bg-indigo-900/50 transition-all duration-500">
                        <div className="flex flex-col items-center flex-1 justify-center">
                          <div className="text-5xl mb-3">🎁</div>
                          <p className="text-lg font-bold text-white">Gift #6</p>
                        </div>
                        <span className="text-xs uppercase tracking-wide text-white/70">WRAPPED</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Live Toast - Positioned relative to game board */}
                <div className="absolute -bottom-8 -right-8 z-50">
                  <div className="bg-slate-800/80 backdrop-blur-md border border-white/20 rounded-lg px-6 py-4 shadow-lg animate-pulse-border">
                    <p className="text-white font-medium">
                      {gameEvents[gameState].text.includes('🎁') ? (
                        <>
                          {gameEvents[gameState].text.split('🎁')[0]}
                          <span className="inline-block animate-pulse-glow">🎁</span>
                          {gameEvents[gameState].text.split('🎁')[1]}
                        </>
                      ) : (
                        gameEvents[gameState].text
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Features Section */}
          <div id="features-section" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
            <div className="grid md:grid-cols-3 gap-6 mt-16">
              <div className="text-center p-8 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 shadow-lg hover:shadow-xl transition-all">
                <div 
                  className="text-4xl mb-4"
                  style={{ 
                    textShadow: '0 0 20px rgba(234, 179, 8, 0.6)',
                    filter: 'drop-shadow(0 0 8px rgba(250, 204, 21, 0.5))'
                  }}
                >
                  ⚡
                </div>
                <h3 className="text-xl font-bold text-white mb-3 tracking-tight">Live Reactions & Rivalries</h3>
                <p className="text-sm text-gray-100">Watch the action unfold instantly. Send live emoji reactions and taunts without unmuting your mic.</p>
              </div>
              <div className="text-center p-8 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 shadow-lg hover:shadow-xl transition-all">
                <div 
                  className="text-4xl mb-4"
                  style={{ 
                    textShadow: '0 0 20px rgba(147, 197, 253, 0.6)',
                    filter: 'drop-shadow(0 0 8px rgba(147, 197, 253, 0.5))'
                  }}
                >
                  ✨
                </div>
                <h3 className="text-xl font-bold text-white mb-3 tracking-tight">Zero-Hassle Setup</h3>
                <p className="text-sm text-gray-100">Guests simply paste a link from Amazon or Etsy. We auto-magically create a beautiful gift card. No manual entry.</p>
              </div>
              <div className="text-center p-8 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 shadow-lg hover:shadow-xl transition-all">
                <div 
                  className="text-4xl mb-4"
                  style={{ 
                    textShadow: '0 0 20px rgba(59, 130, 246, 0.6)',
                    filter: 'drop-shadow(0 0 8px rgba(59, 130, 246, 0.5))'
                  }}
                >
                  ✈️
                </div>
                <h3 className="text-xl font-bold text-white mb-3 tracking-tight">Auto-Pilot Logistics</h3>
                <p className="text-sm text-gray-100">We track the turn order, the rules, and the shipping. When the game ends, we privately swap addresses so prizes get where they need to go.</p>
              </div>
            </div>
          </div>

          {/* Remote Team Focused Section */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl md:text-4xl font-bold text-white mb-6 tracking-tight">
                  The Cure for 'You're on Mute'
                </h2>
                <ul className="space-y-4">
                  <li className="flex items-start gap-3">
                    <span className="text-2xl">✅</span>
                    <p className="text-gray-100 text-lg">Works alongside Zoom, Teams, or Meet.</p>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-2xl">🌍</span>
                    <p className="text-gray-100 text-lg">Inclusive for distributed teams in any time zone.</p>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-2xl">🛡️</span>
                    <p className="text-gray-100 text-lg">HR-Friendly: You set the rules and price limits, we enforce them.</p>
                  </li>
                </ul>
              </div>
              <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 p-12 shadow-xl relative overflow-hidden">
                {/* Zoom Grid - 2x2 */}
                <div className="grid grid-cols-2 gap-4 aspect-video relative z-10">
                  {/* Video Call Square 1 - Active Speaker */}
                  <div className="bg-slate-800 border-2 border-green-500 rounded-lg relative overflow-hidden flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-pink-500 to-orange-400 flex items-center justify-center text-white text-xl font-bold">
                      S
                    </div>
                  </div>
                  
                  {/* Video Call Square 2 */}
                  <div className="bg-slate-800 border border-slate-700 rounded-lg relative overflow-hidden flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-blue-500 to-cyan-400 flex items-center justify-center text-white text-xl font-bold">
                      M
                    </div>
                    <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm rounded px-2 py-1 flex items-center gap-1">
                      <svg className="w-3 h-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6" />
                      </svg>
                    </div>
                  </div>
                  
                  {/* Video Call Square 3 */}
                  <div className="bg-slate-800 border border-slate-700 rounded-lg relative overflow-hidden flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-purple-500 to-pink-400 flex items-center justify-center text-white text-xl font-bold">
                      J
                    </div>
                    <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm rounded px-2 py-1 flex items-center gap-1">
                      <svg className="w-3 h-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6" />
                      </svg>
                    </div>
                  </div>
                  
                  {/* Video Call Square 4 */}
                  <div className="bg-slate-800 border border-slate-700 rounded-lg relative overflow-hidden flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-yellow-500 to-orange-400 flex items-center justify-center text-white text-xl font-bold">
                      A
                    </div>
                    <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm rounded px-2 py-1 flex items-center gap-1">
                      <svg className="w-3 h-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6" />
                      </svg>
                    </div>
                  </div>
                </div>
                
                {/* Floating Reactions */}
                <div className="absolute top-8 right-8 text-3xl animate-float-reaction-1 z-20">😂</div>
                <div className="absolute top-16 left-8 text-2xl animate-float-reaction-2 z-20">🔥</div>
                <div className="absolute bottom-12 right-12 text-2xl animate-float-reaction-3 z-20">🎁</div>
                <div className="absolute bottom-8 left-12 text-xl animate-float-reaction-4 z-20">🎉</div>
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
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900 via-slate-900 to-black relative overflow-hidden">
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
          <div className="max-w-2xl mx-auto bg-white/10 backdrop-blur-md rounded-xl shadow-lg p-8 border border-white/20 relative z-10">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center mx-auto mb-4 shadow-md">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">Create a New Party</h2>
              <p className="text-gray-300">Set up your gift exchange in seconds</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-200 mb-2">
                  Party Title <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g., Family Christmas Exchange 2025"
                  value={partyTitle}
                  onChange={(e) => setPartyTitle(e.target.value)}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-white placeholder:text-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-200 mb-2">
                  Party Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={partyDate}
                  onChange={(e) => setPartyDate(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-white"
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
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">My Parties</h2>
          <p className="text-gray-300">Manage your gift exchanges and join ongoing games</p>
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
          <div className="text-center py-16 bg-white/10 backdrop-blur-sm rounded-lg border-2 border-dashed border-white/20">
            <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <h3 className="text-lg font-semibold text-white mb-2">No parties yet</h3>
            <p className="text-gray-600">Create your first White Elephant gift exchange above</p>
          </div>
        )}

        {myParties.length > 0 && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {myParties.map((party) => {
              const canDelete = (party.status === 'ENDED' || party.status === 'CANCELLED') && party.isAdmin;
              
              return (
                <div
                  key={party.id}
                  className="group block bg-white/10 backdrop-blur-sm rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden border-2 border-white/20 hover:border-red-400 relative"
                >
                  {party.status === 'LOBBY' && (
                    <div className="absolute top-2 right-2 text-2xl animate-bounce z-10">🎄</div>
                  )}
                  <Link
                    to={`/party/${party.id}`}
                    className="block"
                  >
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          {party.title ? (
                            <h3 className="text-xl font-bold text-white mb-2 group-hover:text-red-400 transition-colors">
                              {party.title}
                            </h3>
                          ) : (
                            <h3 className="text-xl font-bold text-gray-300 mb-2">Untitled Party</h3>
                          )}
                          <div className="flex items-center gap-2 text-sm text-gray-300 mb-3">
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
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span
                            className={`px-3 py-1 text-xs font-bold rounded-full ${
                              party.status === 'LOBBY'
                                ? 'bg-yellow-500/20 text-yellow-300 border-2 border-yellow-500/50'
                                : party.status === 'ACTIVE'
                                ? 'bg-green-500/20 text-green-300 border-2 border-green-500/50'
                                : 'bg-gray-500/20 text-gray-300 border-2 border-gray-500/50'
                            }`}
                          >
                            {party.status}
                          </span>
                          {canDelete && (
                            <button
                              onClick={(e) => handleDeleteParty(party.id, e)}
                              className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg transition-all hover:scale-110"
                              title="Delete party"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between pt-4 border-t border-white/10">
                        <div className="text-sm text-gray-300">
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
                </div>
              );
            })}
          </div>
        )}
      </div>
      <Footer />
      </div>
    </>
  );
}

