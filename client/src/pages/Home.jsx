/**
 * Home Page
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
          <p className="text-gray-600 text-center mb-6">
            Sign in to create or join a White Elephant gift exchange party
          </p>
          
          {!showEmailAuth ? (
            <>
              <Button onClick={signInWithGoogle} className="w-full mb-3">
                Sign in with Google
              </Button>
              <Button 
                variant="secondary" 
                onClick={() => setShowEmailAuth(true)} 
                className="w-full"
              >
                Sign in with Email
              </Button>
            </>
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
                <p className="text-sm text-red-600">{authError}</p>
              )}
              <Button type="submit" className="w-full">
                {isSignUp ? 'Sign Up' : 'Sign In'}
              </Button>
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(!isSignUp);
                    setAuthError('');
                  }}
                  className="text-sm text-blue-600 hover:underline"
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
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Create Party Section */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-center mb-6">Create a Party</h1>
          <div className="space-y-4">
            <Input
              type="text"
              label="Party Title (optional)"
              placeholder="e.g., Family Christmas Exchange 2025"
              value={partyTitle}
              onChange={(e) => setPartyTitle(e.target.value)}
            />
            <Input
              type="datetime-local"
              label="Party Date"
              value={partyDate}
              onChange={(e) => setPartyDate(e.target.value)}
              required
            />
          </div>
          <Button onClick={handleCreateParty} className="w-full mt-4">
            Create Party
          </Button>
        </div>

        {/* My Parties Section */}
        {(myParties.length > 0 || loadingParties || partiesError) && (
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-bold mb-4">My Parties</h2>
            {loadingParties && (
              <p className="text-gray-500">Loading parties...</p>
            )}
            {partiesError && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4">
                <p className="text-sm text-yellow-800">
                  <strong>Note:</strong> {partiesError}
                  {partiesError.includes('index') && (
                    <span className="block mt-1">
                      The Firestore index is being created. This may take a few minutes. 
                      You can deploy it manually with: <code className="bg-yellow-100 px-1 rounded">firebase deploy --only firestore:indexes</code>
                    </span>
                  )}
                </p>
              </div>
            )}
            {myParties.length === 0 && !loadingParties && !partiesError && (
              <p className="text-gray-500">You don't have any parties yet. Create one above!</p>
            )}
            {myParties.length > 0 && (
              <div className="space-y-3">
                {myParties.map((party) => (
                <Link
                  key={party.id}
                  to={`/party/${party.id}`}
                  className="block p-4 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-blue-500 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-start gap-3 mb-2">
                        <div className="flex-1">
                          {party.title && (
                            <h3 className="text-lg font-semibold text-gray-900 mb-1">
                              {party.title}
                            </h3>
                          )}
                          <p className="text-sm text-gray-600">
                            {party.date?.toDate ? party.date.toDate().toLocaleDateString() : 'No date set'}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded flex-shrink-0 ${
                            party.status === 'LOBBY'
                              ? 'bg-yellow-100 text-yellow-800'
                              : party.status === 'ACTIVE'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {party.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">
                        Created {party.createdAt?.toDate ? party.createdAt.toDate().toLocaleDateString() : ''}
                        {party.isAdmin === false && (
                          <span className="ml-2 text-blue-600">• You're a participant</span>
                        )}
                      </p>
                    </div>
                    <svg
                      className="w-5 h-5 text-gray-400"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

