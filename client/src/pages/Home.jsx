/**
 * Home Page
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';
import { Modal } from '../components/ui/Modal.jsx';
import { Menu } from '@headlessui/react';
import { GiftIcon, EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { collection, addDoc, doc, setDoc, query, where, onSnapshot, orderBy, collectionGroup, getDocs, deleteDoc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../utils/firebase.js';
import { trackCreateParty, trackSignUp, trackLogin, trackButtonClick, trackGameAbandoned, trackError } from '../utils/analytics.js';
import { usePartyModal } from '../contexts/PartyModalContext.jsx';
import { Footer } from '../components/Footer.jsx';
import { SEO } from '../components/SEO.jsx';

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
  const { showModal: showCreatePartyModal, setShowModal: setShowCreatePartyModal } = usePartyModal();
  const [participantCounts, setParticipantCounts] = useState({});
  const [isMobile, setIsMobile] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Track mobile breakpoint for 3D transform
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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

    // NOTE: CollectionGroup queries for participants are disabled due to Firestore security rule complexity
    // Users will see parties they're admin of. Participant parties will appear once they visit them.
    // This is a temporary solution - a better approach would be to store party IDs in user documents
    // or use a server-side Cloud Function to query participants.

    return () => {
      unsubscribeAdmin();
      // Clean up all party listeners
      partyUnsubscribes.forEach(unsubscribe => unsubscribe());
      partyUnsubscribes.clear();
    };
  }, [user]);

  // Subscribe to participant counts for each party
  useEffect(() => {
    if (!user || myParties.length === 0) {
      setParticipantCounts({});
      return;
    }

    const unsubscribes = [];
    const counts = {};

    myParties.forEach(party => {
      const participantsQuery = query(collection(db, 'parties', party.id, 'participants'));
      const unsubscribe = onSnapshot(participantsQuery, (snapshot) => {
        counts[party.id] = snapshot.size;
        setParticipantCounts({ ...counts });
      }, (error) => {
        console.error(`Error fetching participants for party ${party.id}:`, error);
      });
      unsubscribes.push(unsubscribe);
    });

    return () => {
      unsubscribes.forEach(unsubscribe => unsubscribe());
    };
  }, [user, myParties]);

  const handleDeleteParty = async (partyId, e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!confirm('Are you sure you want to delete this party? This action cannot be undone.')) {
      return;
    }

    try {
      // Get party data before deletion to track abandonment
      const partyDoc = await getDoc(doc(db, 'parties', partyId));
      const partyData = partyDoc.data();
      
      await deleteDoc(doc(db, 'parties', partyId));
      
      // Track game abandonment if party was in progress
      if (partyData?.status === 'ACTIVE' || partyData?.status === 'LOBBY') {
        const participantCount = partyData?.participantCount || 0;
        const phase = partyData?.status === 'ACTIVE' ? 'in_progress' : 'lobby';
        trackGameAbandoned(partyId, phase, participantCount);
      }
      
      // Party will be removed from the list automatically via the real-time listener
    } catch (error) {
      console.error('Error deleting party:', error);
      trackError('delete_party_failed', error.message, 'Home');
      alert('Failed to delete party: ' + error.message);
    }
  };

  const handleCreateParty = async () => {
    if (!user) {
      alert('Please sign in first');
      return;
    }

    if (!partyDate) {
      alert('Please select a party date');
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

      // Track party creation
      trackCreateParty({
        title: partyTitle,
        date: partyDate,
      });

      // Reset form and close modal
      setPartyTitle('');
      setPartyDate('');
      setShowCreatePartyModal(false);

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
        // Track authentication
        if (isSignUp) {
          trackSignUp('email');
        } else {
          trackLogin('email');
        }

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
      <SEO 
        title="Virtual White Elephant for Remote Teams"
        description="Host seamless, real-time White Elephant gift exchanges for remote teams. Works with Zoom, Teams, or Meet. Zero-hassle setup, auto-pilot logistics."
        url="/"
      />
      {/* Snow Animation Layers - Fixed to viewport, starts from navbar */}
      <div className="fixed inset-0 overflow-visible pointer-events-none z-[5]">
        {/* Layer 1: Fastest, most visible */}
        {[...Array(50)].map((_, i) => {
          const randomDelay = Math.random() * 1; // Reduced to 1s max delay
          const randomTop = Math.random() * 120 - 20; // Start some snowflakes already visible (can be negative or positive)
          const baseOpacity = 0.6 + Math.random() * 0.2;
          return (
            <div
              key={`snow-1-${i}`}
              className="absolute animate-snow-fall snowflake-mobile"
              style={{
                left: `${(i * 2) % 100}%`,
                top: `${randomTop}%`,
                fontSize: `${Math.random() * 8 + 10}px`,
                opacity: baseOpacity,
                animationDelay: `${randomDelay}s`,
                animationDuration: `${15 + Math.random() * 10}s`,
                color: '#ffffff',
                textShadow: '0 0 4px rgba(255, 255, 255, 0.8), 0 0 8px rgba(255, 255, 255, 0.4)',
                filter: 'brightness(1.5) drop-shadow(0 0 2px rgba(255, 255, 255, 0.8))',
              }}
            >
              ❄
            </div>
          );
        })}
        {/* Layer 2: Medium speed */}
        {[...Array(40)].map((_, i) => {
          const randomDelay = Math.random() * 1; // Reduced to 1s max delay
          const randomTop = Math.random() * 120 - 20; // Start some snowflakes already visible
          const baseOpacity = 0.4 + Math.random() * 0.2;
          return (
            <div
              key={`snow-2-${i}`}
              className="absolute animate-snow-fall snowflake-mobile"
              style={{
                left: `${(i * 2.5) % 100}%`,
                top: `${randomTop}%`,
                fontSize: `${Math.random() * 6 + 8}px`,
                opacity: baseOpacity,
                animationDelay: `${randomDelay}s`,
                animationDuration: `${20 + Math.random() * 10}s`,
                color: '#ffffff',
                textShadow: '0 0 4px rgba(255, 255, 255, 0.6), 0 0 8px rgba(255, 255, 255, 0.3)',
                filter: 'brightness(1.5) drop-shadow(0 0 2px rgba(255, 255, 255, 0.6))',
              }}
            >
              ❄
            </div>
          );
        })}
        {/* Layer 3: Slowest, most subtle */}
        {[...Array(30)].map((_, i) => {
          const randomDelay = Math.random() * 1; // Reduced to 1s max delay
          const randomTop = Math.random() * 120 - 20; // Start some snowflakes already visible
          const baseOpacity = 0.2 + Math.random() * 0.2;
          return (
            <div
              key={`snow-3-${i}`}
              className="absolute animate-snow-fall snowflake-mobile"
              style={{
                left: `${(i * 3.33) % 100}%`,
                top: `${randomTop}%`,
                fontSize: `${Math.random() * 4 + 6}px`,
                opacity: baseOpacity,
                animationDelay: `${randomDelay}s`,
                animationDuration: `${25 + Math.random() * 10}s`,
                color: '#ffffff',
                textShadow: '0 0 4px rgba(255, 255, 255, 0.4), 0 0 8px rgba(255, 255, 255, 0.2)',
                filter: 'brightness(1.5) drop-shadow(0 0 2px rgba(255, 255, 255, 0.4))',
              }}
            >
              ❄
            </div>
          );
        })}
      </div>
      <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900 via-slate-900 to-black relative overflow-hidden">
        {/* Hero Section */}
        <div className="relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 md:pt-32 pb-16 relative z-10">
            <div className="text-center">
              <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 tracking-tight">
                The Most Fun Your Remote Team Will Have This Holiday.
              </h1>
              <p className="text-lg md:text-xl text-gray-100 mb-8 max-w-3xl mx-auto leading-relaxed">
                Ditch the spreadsheets. Host a seamless, real-time White Elephant exchange that syncs perfectly with Zoom. No logistics, just laughter.
              </p>
              
              {/* CTAs */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
                <button
                  onClick={() => {
                    trackButtonClick('See How It Works', 'hero');
                    scrollToFeatures();
                  }}
                  className="px-8 py-4 text-lg font-semibold bg-white/10 backdrop-blur-md text-gray-100 border border-white/25 rounded-lg hover:bg-white/10 transition-all"
                >
                  See How It Works
                </button>
              </div>

              {/* Tilted UI Mockup Placeholder */}
              <div className="max-w-4xl mx-auto mt-16 relative">
                <div 
                  className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 md:p-8 shadow-[0_0_40px_-10px_rgba(168,85,247,0.4)]"
                  style={{
                    ...(!isMobile ? {
                      transform: 'perspective(1000px) rotateX(5deg) rotateY(-5deg)',
                      transformStyle: 'preserve-3d',
                    } : {}),
                    boxShadow: '0 0 40px -10px rgba(168,85,247,0.4), inset 0 0 20px rgba(168,85,247,0.1)'
                  }}
                >
                  <div className="bg-gradient-to-br from-purple-500/20 to-indigo-500/20 rounded-lg p-3 md:p-6 relative overflow-hidden">
                    {/* Fade effect at bottom - only visible on mobile */}
                    <div className="md:hidden absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black via-slate-900/50 to-transparent pointer-events-none z-10"></div>
                    {/* Game Board Grid - 2 columns on mobile, 3 on desktop */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-4">
                      {/* Revealed Card #1 - Espresso Machine (Dynamic Owner) */}
                      <div className="bg-white/10 border border-white/10 backdrop-blur-sm rounded-lg p-2 md:p-4 flex flex-col justify-between aspect-square hover:bg-white/20 transition-all duration-500 relative">
                        <div className="flex flex-col items-center flex-1 justify-center">
                          <div className="text-3xl md:text-5xl mb-1 md:mb-3">☕</div>
                          <p className="text-xs md:text-base font-semibold text-white text-center truncate w-full px-1">Espresso Machine</p>
                        </div>
                        <div className="bg-black/20 w-full p-1 md:p-2 rounded-b-lg flex items-center gap-1 md:gap-2">
                          {gameState === 1 ? (
                            <>
                              <div className="w-4 h-4 md:w-6 md:h-6 rounded-full bg-indigo-500 flex items-center justify-center text-white text-[10px] md:text-xs font-bold">S</div>
                              <span className="text-indigo-300 text-[10px] md:text-xs font-semibold animate-pulse truncate">Held by: Sarah</span>
                            </>
                          ) : (
                            <>
                              <div className="w-4 h-4 md:w-6 md:h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] md:text-xs font-bold">T</div>
                              <span className="text-white/80 text-[10px] md:text-xs truncate">Held by: Tom</span>
                            </>
                          )}
                        </div>
                      </div>
                      
                      {/* Card #2 - Wrapped or Revealed (Vintage Vinyl) */}
                      {gameState === 0 ? (
                        <div className="bg-white/10 border border-white/10 backdrop-blur-sm rounded-lg p-2 md:p-4 flex flex-col justify-between aspect-square hover:bg-white/20 transition-all duration-500 relative">
                          <div className="flex flex-col items-center flex-1 justify-center">
                            <div className="text-3xl md:text-5xl mb-1 md:mb-3">🎸</div>
                            <p className="text-xs md:text-base font-semibold text-white text-center truncate w-full px-1">Vintage Vinyl</p>
                          </div>
                          <div className="bg-black/20 w-full p-1 md:p-2 rounded-b-lg flex items-center gap-1 md:gap-2">
                            <div className="w-4 h-4 md:w-6 md:h-6 rounded-full bg-purple-500 flex items-center justify-center text-white text-[10px] md:text-xs font-bold">B</div>
                            <span className="text-white/80 text-[10px] md:text-xs truncate">Held by: Brian</span>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-indigo-900/40 border border-white/10 backdrop-blur-sm rounded-lg p-2 md:p-4 flex flex-col justify-between items-center aspect-square hover:bg-indigo-900/50 transition-all duration-500">
                          <div className="flex flex-col items-center flex-1 justify-center">
                            <div className="text-3xl md:text-5xl mb-1 md:mb-3">🎁</div>
                            <p className="text-sm md:text-lg font-bold text-white">Gift #2</p>
                          </div>
                          <span className="text-[10px] md:text-xs uppercase tracking-wide text-white/70">WRAPPED</span>
                        </div>
                      )}
                      
                      {/* Revealed Card #3 - Craft Beer Set */}
                      <div className="bg-white/10 border border-white/10 backdrop-blur-sm rounded-lg p-2 md:p-4 flex flex-col justify-between aspect-square hover:bg-white/20 transition-all duration-500 relative">
                        <div className="flex flex-col items-center flex-1 justify-center">
                          <div className="text-3xl md:text-5xl mb-1 md:mb-3">🍺</div>
                          <p className="text-xs md:text-base font-semibold text-white text-center truncate w-full px-1">Craft Beer Set</p>
                        </div>
                        <div className="bg-black/20 w-full p-1 md:p-2 rounded-b-lg flex items-center gap-1 md:gap-2">
                          <div className="w-4 h-4 md:w-6 md:h-6 rounded-full bg-purple-500 flex items-center justify-center text-white text-[10px] md:text-xs font-bold">B</div>
                          <span className="text-white/80 text-[10px] md:text-xs truncate">Held by: Brian</span>
                        </div>
                      </div>
                      
                      {/* Wrapped Gift #4 */}
                      <div className="bg-indigo-900/40 border border-white/10 backdrop-blur-sm rounded-lg p-2 md:p-4 flex flex-col justify-between items-center aspect-square hover:bg-indigo-900/50 transition-all duration-500">
                        <div className="flex flex-col items-center flex-1 justify-center">
                          <div className="text-3xl md:text-5xl mb-1 md:mb-3">🎁</div>
                          <p className="text-sm md:text-lg font-bold text-white">Gift #4</p>
                        </div>
                        <span className="text-[10px] md:text-xs uppercase tracking-wide text-white/70">WRAPPED</span>
                      </div>
                      
                      {/* Revealed Card #5 - Gaming Pass (Dynamic Lock State) */}
                      <div className={`bg-white/10 backdrop-blur-sm rounded-lg p-2 md:p-4 flex flex-col justify-between aspect-square hover:bg-white/20 transition-all duration-500 relative ${gameState === 2 ? 'border-cyan-400 border-2 shadow-[0_0_15px_rgba(34,211,238,0.4)]' : 'border border-white/10'}`}>
                        {gameState === 2 ? (
                          <div className="absolute top-1 right-1 md:top-2 md:right-2 bg-cyan-500 rounded-full px-1 py-0.5 md:px-2 md:py-1">
                            <span className="text-[10px] md:text-xs font-semibold text-black">LOCKED 🔒</span>
                          </div>
                        ) : (
                          <div className="absolute top-1 right-1 md:top-2 md:right-2 bg-red-500/80 rounded-full px-1 py-0.5 md:px-2 md:py-1">
                            <span className="text-[10px] md:text-xs font-semibold text-white">2 Steals</span>
                          </div>
                        )}
                        <div className="flex flex-col items-center flex-1 justify-center">
                          <div className="text-3xl md:text-5xl mb-1 md:mb-3">🎮</div>
                          <p className="text-xs md:text-base font-semibold text-white text-center truncate w-full px-1">Gaming Pass</p>
                        </div>
                        <div className="bg-black/20 w-full p-1 md:p-2 rounded-b-lg flex items-center gap-1 md:gap-2">
                          <div className="w-4 h-4 md:w-6 md:h-6 rounded-full bg-green-500 flex items-center justify-center text-white text-[10px] md:text-xs font-bold">A</div>
                          <span className="text-white/80 text-[10px] md:text-xs truncate">Held by: Alex</span>
                        </div>
                      </div>
                      
                      {/* Wrapped Gift #6 */}
                      <div className="bg-indigo-900/40 border border-white/10 backdrop-blur-sm rounded-lg p-2 md:p-4 flex flex-col justify-between items-center aspect-square hover:bg-indigo-900/50 transition-all duration-500">
                        <div className="flex flex-col items-center flex-1 justify-center">
                          <div className="text-3xl md:text-5xl mb-1 md:mb-3">🎁</div>
                          <p className="text-sm md:text-lg font-bold text-white">Gift #6</p>
                        </div>
                        <span className="text-[10px] md:text-xs uppercase tracking-wide text-white/70">WRAPPED</span>
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
            {/* Mobile: Compact List Layout */}
            <div className="flex flex-col md:hidden mt-16">
              <div className="flex flex-row items-center gap-4 py-4 border-b border-white/5">
                <div 
                  className="text-3xl w-12 h-12 flex items-center justify-center flex-shrink-0"
                  style={{ 
                    textShadow: '0 0 20px rgba(234, 179, 8, 0.6)',
                    filter: 'drop-shadow(0 0 8px rgba(250, 204, 21, 0.5))'
                  }}
                >
                  ⚡
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-white mb-1 tracking-tight">Live Reactions & Rivalries</h3>
                  <p className="text-xs text-gray-100">Watch the action unfold instantly. Send live emoji reactions and taunts without unmuting your mic.</p>
                </div>
              </div>
              <div className="flex flex-row items-center gap-4 py-4 border-b border-white/5">
                <div 
                  className="text-3xl w-12 h-12 flex items-center justify-center flex-shrink-0"
                  style={{ 
                    textShadow: '0 0 20px rgba(147, 197, 253, 0.6)',
                    filter: 'drop-shadow(0 0 8px rgba(147, 197, 253, 0.5))'
                  }}
                >
                  ✨
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-white mb-1 tracking-tight">Zero-Hassle Setup</h3>
                  <p className="text-xs text-gray-100">Guests simply paste a link from Amazon or Etsy. We'll try to auto-create a beautiful gift card, with manual entry as a fallback if scraping fails.</p>
                </div>
              </div>
              <div className="flex flex-row items-center gap-4 py-4 border-b border-white/5">
                <div 
                  className="text-3xl w-12 h-12 flex items-center justify-center flex-shrink-0"
                  style={{ 
                    textShadow: '0 0 20px rgba(59, 130, 246, 0.6)',
                    filter: 'drop-shadow(0 0 8px rgba(59, 130, 246, 0.5))'
                  }}
                >
                  ✈️
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-white mb-1 tracking-tight">Auto-Pilot Logistics</h3>
                  <p className="text-xs text-gray-100">We track the turn order, the rules, and the shipping. When the game ends, we privately swap addresses so prizes get where they need to go.</p>
                </div>
              </div>
            </div>
            
            {/* Desktop: Card Grid Layout */}
            <div className="hidden md:grid md:grid-cols-3 gap-6 mt-16">
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
                <p className="text-sm text-gray-100">Guests simply paste a link from Amazon or Etsy. We'll try to auto-create a beautiful gift card, with manual entry as a fallback if scraping fails.</p>
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
        
        {/* Marketing Footer */}
        <Footer />
      </div>
      </>
    );
  }

  return (
    <>
    <SEO 
      title="Virtual White Elephant for Remote Teams"
      description="Host seamless, real-time White Elephant gift exchanges for remote teams. Works with Zoom, Teams, or Meet. Zero-hassle setup, auto-pilot logistics."
      url="/"
    />
    {/* Subtle Snowflakes Animation - Fixed to viewport, starts from navbar */}
    <div className="fixed inset-0 overflow-visible pointer-events-none z-[5]">
      {[...Array(40)].map((_, i) => {
        const size = Math.random() * 12 + 8;
        const opacity = Math.random() * 0.3 + 0.2;
        const randomDelay = Math.random() * 1; // Reduced to 1s max delay
        const randomTop = Math.random() * 120 - 20; // Start some snowflakes already visible
        return (
          <div
            key={i}
            className="absolute animate-float snowflake-mobile"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${randomTop}%`,
              fontSize: `${size}px`,
              opacity: opacity,
              animationDelay: `${randomDelay}s`,
              animationDuration: `${10 + Math.random() * 8}s`,
              color: '#ffffff',
              textShadow: '0 0 4px rgba(255, 255, 255, 0.6), 0 0 8px rgba(255, 255, 255, 0.3)',
              filter: 'brightness(1.5) drop-shadow(0 0 2px rgba(255, 255, 255, 0.6))',
            }}
          >
            ❄
          </div>
        );
      })}
    </div>
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900 via-slate-900 to-black relative flex flex-col">
      {/* My Parties Section */}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 z-10 pt-4">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">My Parties</h2>
            <p className="text-slate-400">Manage your gift exchanges and join ongoing games</p>
          </div>
          {user && (
            <button
              onClick={() => setShowCreatePartyModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl"
            >
              Host New Party
            </button>
          )}
        </div>

        {loadingParties && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
            <p className="mt-4 text-slate-400">Loading your parties...</p>
          </div>
        )}

        {partiesError && (
          <div className="bg-yellow-500/10 border-l-4 border-yellow-500/50 rounded-lg p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-300">
                  <strong>Note:</strong> {partiesError}
                  {partiesError.includes('index') && (
                    <span className="block mt-2 text-slate-300">
                      The Firestore index is being created. This may take a few minutes. 
                      You can deploy it manually with: <code className="bg-slate-800/50 px-2 py-1 rounded text-xs">firebase deploy --only firestore:indexes</code>
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {myParties.length === 0 && !loadingParties && !partiesError && (
          <div 
            onClick={() => setShowCreatePartyModal(true)}
            className="text-center py-16 bg-white/5 backdrop-blur-sm rounded-xl border-2 border-dashed border-white/10 hover:border-white/20 cursor-pointer transition-all max-w-2xl mx-auto"
          >
            <GiftIcon className="w-12 h-12 text-white/20 mb-4 mx-auto" />
            <h3 className="text-white font-medium mb-2">Create Your First Party</h3>
            <p className="text-slate-400">Click here to host a White Elephant gift exchange</p>
          </div>
        )}

        {myParties.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {myParties.map((party) => {
              const canDelete = (party.status === 'ENDED' || party.status === 'CANCELLED') && party.isAdmin;
              const participantCount = participantCounts[party.id] || 0;
              
              return (
                <div
                  key={party.id}
                  className="group bg-white/5 border border-white/10 backdrop-blur-md rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden relative"
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        {party.title ? (
                          <h3 className="text-xl font-bold text-white mb-2">
                            {party.title}
                          </h3>
                        ) : (
                          <h3 className="text-xl font-bold text-white mb-2">Untitled Party</h3>
                        )}
                        <div className="flex items-center gap-2 text-sm text-indigo-200 mb-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
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
                        <div className="flex items-center gap-2 text-sm text-indigo-200">
                          <span className="text-base">👥</span>
                          <span>{participantCount} Joined</span>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 flex-shrink-0">
                        <span
                          className={`px-2 py-1 text-xs uppercase tracking-wide rounded-full ${
                            party.status === 'LOBBY'
                              ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                              : party.status === 'ACTIVE'
                              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                              : 'bg-slate-700/40 text-slate-400 border border-slate-600/50'
                          }`}
                        >
                          {party.status}
                        </span>
                        {canDelete && (
                          <Menu as="div" className="relative">
                            <Menu.Button
                              onClick={(e) => e.stopPropagation()}
                              className="p-1.5 text-slate-600 hover:text-white rounded-lg transition-all"
                              title="Party options"
                            >
                              <EllipsisVerticalIcon className="w-5 h-5" />
                            </Menu.Button>
                            <Menu.Items className="absolute right-0 mt-2 w-48 bg-slate-900/95 backdrop-blur-md border border-white/20 rounded-lg shadow-lg z-50">
                              <div className="py-1">
                                <Menu.Item>
                                  {({ active }) => (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm('Are you sure you want to delete this party? This action cannot be undone.')) {
                                          handleDeleteParty(party.id, e);
                                        }
                                      }}
                                      className={`${
                                        active ? 'bg-red-500/20' : ''
                                      } block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/20 transition-colors`}
                                    >
                                      Delete Party
                                    </button>
                                  )}
                                </Menu.Item>
                              </div>
                            </Menu.Items>
                          </Menu>
                        )}
                      </div>
                    </div>
                    
                    <div className="pt-4 border-t border-white/10">
                      <Link
                        to={`/party/${party.id}`}
                        className="block w-full px-4 py-2 text-sm font-medium bg-transparent border border-white/20 text-white hover:bg-purple-500/20 hover:border-purple-400/50 rounded-lg transition-all duration-200 text-center"
                      >
                        Enter Lobby
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Create Party Modal */}
        <Modal
          isOpen={showCreatePartyModal}
          onClose={() => {
            setShowCreatePartyModal(false);
            setPartyTitle('');
            setPartyDate('');
          }}
          title="Host New Party"
          className="max-w-lg"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Party Title <span className="text-slate-500 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g., Family Christmas Exchange 2025"
                value={partyTitle}
                onChange={(e) => setPartyTitle(e.target.value)}
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 text-white placeholder:text-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Party Date <span className="text-red-400">*</span>
              </label>
              <input
                type="datetime-local"
                value={partyDate}
                onChange={(e) => setPartyDate(e.target.value)}
                required
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
            <div className="flex gap-3 justify-end pt-4">
              <button
                onClick={() => {
                  setShowCreatePartyModal(false);
                  setPartyTitle('');
                  setPartyDate('');
                }}
                className="px-4 py-2 text-sm font-medium text-slate-300 border border-slate-700 rounded-lg hover:bg-slate-800/50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateParty}
                disabled={!partyDate}
                className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Party
              </button>
            </div>
          </div>
        </Modal>
      </div>
      
      {/* Micro Footer */}
      <div className="text-slate-600 text-xs py-8 border-t border-white/5 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between">
          <span>© 2024 StealOrReveal</span>
          <span>Privacy • Support</span>
        </div>
      </div>
      </div>
    </>
  );
}

