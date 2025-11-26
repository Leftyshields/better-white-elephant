/**
 * Party Lobby Component
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { useParty } from '../hooks/useParty.js';
import { Button } from './ui/Button.jsx';
import { Input } from './ui/Input.jsx';
import { Modal } from './ui/Modal.jsx';
import { scrapeGiftUrl, apiRequest } from '../utils/api.js';
import { PartyManagement } from './PartyManagement.jsx';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  addDoc,
  getDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../utils/firebase.js';

export function PartyLobby({ partyId, onStartGame }) {
  const { user } = useAuth();
  const { party, participants, pendingInvites, gifts, loading } = useParty(partyId);
  const [giftUrl, setGiftUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [userNames, setUserNames] = useState({});
  const [userEmails, setUserEmails] = useState({});

  const isAdmin = party?.adminId === user?.uid;
  const currentParticipant = participants.find((p) => p.id === user?.uid);
  const userGift = gifts.find((g) => g.submitterId === user?.uid);
  const [adminShippingAddress, setAdminShippingAddress] = useState(null);
  const [loadingAdminAddress, setLoadingAdminAddress] = useState(false);
  const [userShippingAddress, setUserShippingAddress] = useState(null);
  const [loadingUserAddress, setLoadingUserAddress] = useState(false);

  // Fetch user names and emails for participants
  useEffect(() => {
    const fetchUserInfo = async () => {
      if (participants.length === 0) {
        setUserNames({});
        setUserEmails({});
        return;
      }

      try {
        const userIds = participants.map(p => p.id);
        const response = await apiRequest('/api/users/batch', {
          method: 'POST',
          body: JSON.stringify({ userIds }),
        });
        
        if (response.users) {
          setUserNames(response.users);
        }
        if (response.emails) {
          setUserEmails(response.emails);
        }
      } catch (error) {
        console.error('Error fetching user info:', error);
        // Fallback: use participant IDs
        const names = {};
        participants.forEach(p => {
          names[p.id] = `User ${p.id.slice(0, 8)}`;
        });
        setUserNames(names);
      }
    };

    fetchUserInfo();
  }, [participants]);

  // Fetch admin shipping address
  useEffect(() => {
    const fetchAdminAddress = async () => {
      if (!isAdmin || !user?.uid) {
        setAdminShippingAddress(null);
        return;
      }

      setLoadingAdminAddress(true);
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setAdminShippingAddress(userData.shippingAddress || null);
        } else {
          setAdminShippingAddress(null);
        }
      } catch (error) {
        console.error('Error fetching admin address:', error);
        setAdminShippingAddress(null);
      } finally {
        setLoadingAdminAddress(false);
      }
    };

    fetchAdminAddress();
  }, [isAdmin, user?.uid]);

  // Fetch user shipping address (for non-admin users)
  useEffect(() => {
    const fetchUserAddress = async () => {
      if (isAdmin || !user?.uid) {
        setUserShippingAddress(null);
        return;
      }

      setLoadingUserAddress(true);
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setUserShippingAddress(userData.shippingAddress || null);
        } else {
          setUserShippingAddress(null);
        }
      } catch (error) {
        console.error('Error fetching user address:', error);
        setUserShippingAddress(null);
      } finally {
        setLoadingUserAddress(false);
      }
    };

    fetchUserAddress();
  }, [isAdmin, user?.uid]);

  const handleSubmitGift = async () => {
    if (!giftUrl.trim()) {
      alert('Please enter a gift URL');
      return;
    }

    // Validate URL format
    try {
      new URL(giftUrl.startsWith('http') ? giftUrl : `https://${giftUrl}`);
    } catch (e) {
      alert('Please enter a valid URL');
      return;
    }

    setScraping(true);
    try {
      const { title, image } = await scrapeGiftUrl(giftUrl);

      // Normalize URL (ensure it has protocol)
      const normalizedUrl = giftUrl.startsWith('http') ? giftUrl : `https://${giftUrl}`;

      // Create or update gift
      const giftData = {
        partyId,
        submitterId: user.uid,
        url: normalizedUrl,
        title,
        image,
        isFrozen: false,
        winnerId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      if (userGift) {
        // Update existing gift
        await updateDoc(doc(db, 'gifts', userGift.id), giftData);
      } else {
        // Create new gift
        await addDoc(collection(db, 'gifts'), giftData);
      }

      // Create or update participant status to GOING
      const participantRef = doc(db, 'parties', partyId, 'participants', user.uid);
      const participantDoc = await getDoc(participantRef);
      if (participantDoc.exists()) {
        await updateDoc(participantRef, {
          status: 'GOING',
          updatedAt: new Date(),
        });
      } else {
        await setDoc(participantRef, {
          status: 'GOING',
          turnNumber: null,
          ready: false,
          joinedAt: new Date(),
          updatedAt: new Date(),
        });
      }

      setGiftUrl('');
      alert('Gift submitted successfully!');
    } catch (error) {
      console.error('Error submitting gift:', error);
      alert('Failed to submit gift: ' + error.message);
    } finally {
      setScraping(false);
    }
  };

  const handleToggleReady = async () => {
    if (!user || !currentParticipant) return;

    // Validate shipping address before allowing user to mark as ready
    if (!currentParticipant.ready) {
      // Only check when marking as ready (not when unmarking)
      if (!userShippingAddress || !userShippingAddress.street || !userShippingAddress.city) {
        alert('Please add your shipping address to your profile before marking yourself as ready. You can update it in your Profile page.');
        return;
      }
    }

    try {
      const participantRef = doc(db, 'parties', partyId, 'participants', user.uid);
      const newReadyState = !currentParticipant.ready;
      
      await updateDoc(participantRef, {
        ready: newReadyState,
        updatedAt: new Date(),
      });
    } catch (error) {
      console.error('Error toggling ready state:', error);
      alert('Failed to update ready state: ' + error.message);
    }
  };

  const handleStartGame = async () => {
    if (!partyId) return;

    // Validate admin has shipping address
    if (!adminShippingAddress || !adminShippingAddress.street || !adminShippingAddress.city) {
      alert('Please add your shipping address to your profile before starting the game. You can update it in your Profile page.');
      return;
    }

    // Validate admin has submitted a gift
    if (!userGift) {
      alert('Please submit your gift before starting the game!');
      return;
    }

    // Check if all participants (except admin) are ready
    const goingParticipants = participants.filter((p) => p.status === 'GOING' && p.id !== party?.adminId);
    const allReady = goingParticipants.length > 0 && goingParticipants.every((p) => p.ready === true);
    
    if (!allReady) {
      alert('All participants must be ready before starting the game!');
      return;
    }

    try {
      const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
      const response = await fetch(`${serverUrl}/api/game/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ partyId }),
      });

      const data = await response.json();
      if (data.success) {
        onStartGame();
      } else {
        alert('Failed to start game: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error starting game:', error);
      alert('Failed to start game: ' + error.message);
    }
  };

  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) {
      alert('Please enter an email address');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteEmail.trim())) {
      alert('Please enter a valid email address');
      return;
    }

    try {
      // Get the Firebase Function URL
      const functionUrl = import.meta.env.VITE_FUNCTIONS_URL || 
        'https://us-central1-better-white-elephant.cloudfunctions.net/sendPartyInvite';
      
      // Get host name from user
      const hostName = user?.displayName || user?.email?.split('@')[0] || 'Someone';

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          partyId,
          hostName,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alert('Invite sent successfully!');
        setShowInviteModal(false);
        setInviteEmail('');
      } else {
        // Show more helpful error messages
        let errorMsg = data.error || 'Unknown error';
        if (data.message) {
          errorMsg += ': ' + data.message;
        } else if (data.details?.message) {
          errorMsg += ': ' + data.details.message;
        }
        alert('Failed to send invite: ' + errorMsg);
      }
    } catch (error) {
      console.error('Error sending invite:', error);
      alert('Failed to send invite. Make sure Firebase Functions are running or deployed. Error: ' + error.message);
    }
  };

  if (loading) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  if (!party) {
    return <div className="p-8 text-center">Party not found</div>;
  }

  // Calculate setup progress
  const setupSteps = isAdmin ? [
    { id: 'gift', label: 'Submit your gift', completed: !!userGift },
    { id: 'address', label: 'Add shipping address', completed: adminShippingAddress?.street && adminShippingAddress?.city },
    { id: 'participants', label: 'Invite at least 2 participants', completed: participants.filter(p => p.status === 'GOING').length >= 2 },
    { id: 'ready', label: 'All participants ready', completed: (() => {
      const nonAdminParticipants = participants.filter((p) => p.status === 'GOING' && p.id !== party?.adminId);
      return nonAdminParticipants.length > 0 && nonAdminParticipants.every((p) => p.ready === true);
    })() },
  ] : [
    { id: 'gift', label: 'Submit your gift', completed: !!userGift },
    { id: 'address', label: 'Add shipping address', completed: userShippingAddress?.street && userShippingAddress?.city },
    { id: 'ready', label: 'Mark yourself as ready', completed: currentParticipant?.ready === true },
  ];

  const completedSteps = setupSteps.filter(s => s.completed).length;
  const totalSteps = setupSteps.length;
  const progressPercentage = (completedSteps / totalSteps) * 100;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl shadow-lg p-8 text-white">
        <div className="flex justify-between items-start">
          <div>
            {party.title && (
              <h1 className="text-4xl font-bold mb-2">{party.title}</h1>
            )}
            <p className="text-blue-100 text-lg">
              {party.date?.toDate?.().toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              }) || 'No date set'}
            </p>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <PartyManagement party={party} participants={participants} pendingInvites={pendingInvites} />
              <Button onClick={() => setShowShareModal(true)} variant="secondary" className="bg-white/20 hover:bg-white/30 text-white border-white/30">
                Share Link
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Setup Progress */}
      <div className="bg-white rounded-xl shadow-md p-6">
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Setup Progress</h2>
          <div className="flex items-center gap-4">
            <div className="flex-1 bg-gray-200 rounded-full h-3 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-blue-500 to-green-500 h-full transition-all duration-500 rounded-full"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            <span className="text-sm font-semibold text-gray-700">
              {completedSteps} of {totalSteps} complete
            </span>
          </div>
        </div>
        
        <div className="space-y-3">
          {setupSteps.map((step, index) => (
            <div key={step.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                step.completed 
                  ? 'bg-green-500 text-white' 
                  : 'bg-gray-300 text-gray-600'
              }`}>
                {step.completed ? '✓' : index + 1}
              </div>
              <span className={`flex-1 ${step.completed ? 'text-gray-600 line-through' : 'text-gray-900 font-medium'}`}>
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Step 1: Submit Gift */}
      <div className="bg-white rounded-xl shadow-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
            userGift 
              ? 'bg-green-500 text-white' 
              : 'bg-blue-500 text-white'
          }`}>
            {userGift ? '✓' : '1'}
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Submit Your Gift</h2>
        </div>

        {!userGift ? (
          <div className="space-y-4">
            <p className="text-gray-600">
              Enter a URL to your gift. We'll automatically extract the title and image from the page.
            </p>
            <div className="flex gap-4">
              <div className="flex-1">
                <input
                  type="url"
                  placeholder="https://example.com/gift"
                  value={giftUrl}
                  onChange={(e) => setGiftUrl(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !scraping && giftUrl.trim()) {
                      handleSubmitGift();
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <Button onClick={handleSubmitGift} disabled={scraping || !giftUrl.trim()} className="px-6">
                {scraping ? 'Processing...' : 'Submit Gift'}
              </Button>
            </div>
            <p className="text-sm text-gray-500">
              💡 Tip: Use any product page URL from Amazon, Etsy, or other online stores
            </p>
          </div>
        ) : (
          <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4 flex-1">
                {userGift.image && (
                  <img
                    src={userGift.image}
                    alt={userGift.title || 'Gift image'}
                    className="w-24 h-24 object-cover rounded-lg border-2 border-green-300"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                    loading="lazy"
                  />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-green-700 font-semibold">✓ Gift Submitted</span>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">{userGift.title || 'Untitled Gift'}</h3>
                  {userGift.url && (() => {
                    const url = String(userGift.url).trim();
                    let fullUrl;
                    try {
                      if (url.includes(' ') || url.includes('Uncaught') || url.includes('Error:')) {
                        return (
                          <p className="text-red-600 text-sm">
                            Invalid URL saved. Please delete and re-submit.
                          </p>
                        );
                      }
                      fullUrl = url.startsWith('http://') || url.startsWith('https://') 
                        ? url 
                        : `https://${url}`;
                      new URL(fullUrl);
                    } catch (e) {
                      return (
                        <p className="text-red-600 text-sm">
                          Invalid URL format. Please delete and re-submit.
                        </p>
                      );
                    }
                    return (
                      <a
                        href={fullUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 text-sm hover:underline"
                        onClick={(e) => {
                          e.preventDefault();
                          try {
                            window.open(fullUrl, '_blank', 'noopener,noreferrer');
                          } catch (err) {
                            alert('Invalid URL. Please delete and re-submit your gift.');
                          }
                        }}
                      >
                        View Gift →
                      </a>
                    );
                  })()}
                </div>
              </div>
              <Button
                variant="danger"
                onClick={async () => {
                  if (confirm('Are you sure you want to delete your gift? You can submit a new one.')) {
                    try {
                      await deleteDoc(doc(db, 'gifts', userGift.id));
                      const participantRef = doc(db, 'parties', partyId, 'participants', user.uid);
                      await updateDoc(participantRef, {
                        status: 'PENDING',
                        updatedAt: new Date(),
                      });
                    } catch (error) {
                      console.error('Error deleting gift:', error);
                      alert('Failed to delete gift: ' + error.message);
                    }
                  }
                }}
                className="ml-4"
              >
                Change
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Your Gift */}
      {userGift && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Your Gift</h2>
            <Button
              variant="danger"
              onClick={async () => {
                if (confirm('Are you sure you want to delete your gift? You can submit a new one.')) {
                  try {
                    await deleteDoc(doc(db, 'gifts', userGift.id));
                    // Also update participant status back to PENDING
                    const participantRef = doc(db, 'parties', partyId, 'participants', user.uid);
                    await updateDoc(participantRef, {
                      status: 'PENDING',
                      updatedAt: new Date(),
                    });
                  } catch (error) {
                    console.error('Error deleting gift:', error);
                    alert('Failed to delete gift: ' + error.message);
                  }
                }
              }}
            >
              Delete Gift
            </Button>
          </div>
          <div className="flex items-center gap-4">
            {userGift.image && (
              <img
                src={userGift.image}
                alt={userGift.title || 'Gift image'}
                className="w-32 h-32 object-cover rounded border border-gray-200"
                onError={(e) => {
                  // Hide image if it fails to load
                  e.target.style.display = 'none';
                }}
                loading="lazy"
              />
            )}
            <div>
              <h3 className="font-semibold">{userGift.title}</h3>
              {userGift.url && (() => {
                const url = String(userGift.url).trim();
                
                // Validate URL - must be a proper URL, not error text
                let fullUrl;
                try {
                  // Check if it looks like a valid URL
                  if (url.includes(' ') || url.includes('Uncaught') || url.includes('Error:') || url.includes('Uncaught (in promise)') || url.includes('13:18:') || url.includes('message channel')) {
                    // This is corrupted data - don't show link
                    return (
                      <p className="text-red-600 text-sm">
                        Invalid URL saved. Please delete and re-submit your gift.
                      </p>
                    );
                  }
                  
                  fullUrl = url.startsWith('http://') || url.startsWith('https://') 
                    ? url 
                    : `https://${url}`;
                  
                  // Validate with URL constructor
                  new URL(fullUrl);
                } catch (e) {
                  // Invalid URL
                  return (
                    <p className="text-red-600 text-sm">
                      Invalid URL format. Please delete and re-submit your gift.
                    </p>
                  );
                }
                
                return (
                  <a
                    href={fullUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 text-sm hover:underline"
                    onClick={(e) => {
                      e.preventDefault();
                      try {
                        window.open(fullUrl, '_blank', 'noopener,noreferrer');
                      } catch (err) {
                        console.error('Failed to open URL:', err);
                        alert('Invalid URL. Please delete and re-submit your gift.');
                      }
                    }}
                  >
                    View Gift
                  </a>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Add Shipping Address */}
      {(() => {
        const hasAddress = isAdmin 
          ? (adminShippingAddress?.street && adminShippingAddress?.city)
          : (userShippingAddress?.street && userShippingAddress?.city);
        const stepNumber = userGift ? '2' : '1';
        
        return (
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                hasAddress 
                  ? 'bg-green-500 text-white' 
                  : 'bg-blue-500 text-white'
              }`}>
                {hasAddress ? '✓' : stepNumber}
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Shipping Address</h2>
            </div>
            
            {hasAddress ? (
              <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-green-700 font-semibold">✓ Address Added</span>
                </div>
                <p className="text-sm text-gray-600">
                  Your shipping address is on file. Winners will need this to receive their gifts.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-gray-600">
                  Add your shipping address so winners can receive their gifts.
                </p>
                <Button 
                  onClick={() => window.location.href = '/profile'}
                  className="w-full sm:w-auto"
                >
                  Add Shipping Address →
                </Button>
                <p className="text-sm text-gray-500">
                  {isAdmin 
                    ? 'As the host, you need an address on file before starting the game.'
                    : 'You need an address before marking yourself as ready.'}
                </p>
              </div>
            )}
          </div>
        );
      })()}

      {/* Step 3: Participants (Admin only) */}
      {isAdmin && (
        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
              participants.filter(p => p.status === 'GOING').length >= 2
                ? 'bg-green-500 text-white' 
                : 'bg-blue-500 text-white'
            }`}>
              {participants.filter(p => p.status === 'GOING').length >= 2 ? '✓' : '3'}
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Participants</h2>
          </div>
          
          <div className="mb-4">
            <p className="text-gray-600 mb-4">
              {participants.filter(p => p.status === 'GOING').length >= 2
                ? `Great! You have ${participants.filter(p => p.status === 'GOING').length} participants.`
                : `You need at least 2 participants to start. Currently: ${participants.filter(p => p.status === 'GOING').length}`}
            </p>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {participants.map((participant) => {
              const isYou = participant.id === user?.uid;
              const displayName = isYou 
                ? 'You (Host)' 
                : (userNames[participant.id] && userNames[participant.id] !== participant.id 
                    ? userNames[participant.id] 
                    : null);
              const email = userEmails[participant.id] || null;
              
              return (
                <div
                  key={participant.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <span className="text-gray-900 font-medium">
                        {displayName || email || `User ${participant.id.slice(0, 8)}`}
                      </span>
                      {email && displayName && !isYou && (
                        <span className="text-xs text-gray-500 ml-1">({email})</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {participant.status === 'GOING' && (
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        participant.ready === true
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {participant.ready === true ? '✓ Ready' : 'Waiting...'}
                      </span>
                    )}
                    {participant.status === 'PENDING' && (
                      <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        Pending
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {pendingInvites
              .filter(inv => inv.status === 'GOING' || inv.status !== 'ACCEPTED')
              .map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      {invite.name && (
                        <span className="text-gray-900 font-medium">{invite.name}</span>
                      )}
                      {invite.email && (
                        <span className={`${invite.name ? 'text-xs text-gray-500 ml-1' : 'text-gray-900 font-medium'}`}>
                          {invite.name ? `(${invite.email})` : invite.email}
                        </span>
                      )}
                    </div>
                    {invite.emailFailed && (
                      <span className="text-xs text-orange-600 ml-2">Email failed</span>
                    )}
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    invite.status === 'GOING' 
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {invite.status}
                  </span>
                </div>
              ))}
          </div>
          
          {participants.length === 0 && pendingInvites.filter(inv => inv.status !== 'ACCEPTED').length === 0 && (
            <p className="text-gray-500 text-center py-4">No participants yet. Use the Share Link button above to invite people!</p>
          )}
        </div>
      )}

      {/* Participants List (Non-admin) */}
      {!isAdmin && (
        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Participants</h2>
          <div className="space-y-2">
            {participants.map((participant) => {
              const isYou = participant.id === user?.uid;
              const displayName = isYou 
                ? 'You' 
                : (userNames[participant.id] && userNames[participant.id] !== participant.id 
                    ? userNames[participant.id] 
                    : null);
              const email = userEmails[participant.id] || null;
              
              return (
                <div
                  key={participant.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <span className="text-gray-900 font-medium">
                    {displayName || email || `User ${participant.id.slice(0, 8)}`}
                  </span>
                  {participant.status === 'GOING' && (
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      participant.ready === true
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {participant.ready === true ? '✓ Ready' : 'Not Ready'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action Section */}
      {party.status === 'LOBBY' && (
        <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl shadow-lg p-8 border-2 border-blue-200">
          {isAdmin ? (
            <>
              {(() => {
                const nonAdminParticipants = participants.filter((p) => p.status === 'GOING' && p.id !== party?.adminId);
                const allReady = nonAdminParticipants.length > 0 && nonAdminParticipants.every((p) => p.ready === true);
                const readyCount = nonAdminParticipants.filter((p) => p.ready === true).length;
                const totalCount = nonAdminParticipants.length;
                const totalGoingParticipants = participants.filter((p) => p.status === 'GOING').length;
                
                const hasShippingAddress = adminShippingAddress && adminShippingAddress.street && adminShippingAddress.city;
                const hasGift = !!userGift;
                const canStart = allReady && totalGoingParticipants >= 2 && hasShippingAddress && hasGift;
                
                return (
                  <div className="text-center space-y-4">
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">Ready to Start?</h3>
                    
                    {!canStart && (
                      <div className="bg-white rounded-lg p-4 mb-4 space-y-2 text-left">
                        <p className="font-semibold text-gray-900 mb-2">Complete these steps to start:</p>
                        <ul className="space-y-1 text-sm text-gray-600">
                          {!hasGift && (
                            <li className="flex items-center gap-2">
                              <span className="text-red-500">✗</span>
                              <span>Submit your gift</span>
                            </li>
                          )}
                          {!hasShippingAddress && (
                            <li className="flex items-center gap-2">
                              <span className="text-red-500">✗</span>
                              <span>Add your shipping address</span>
                            </li>
                          )}
                          {totalGoingParticipants < 2 && (
                            <li className="flex items-center gap-2">
                              <span className="text-red-500">✗</span>
                              <span>Invite at least 2 participants (currently: {totalGoingParticipants})</span>
                            </li>
                          )}
                          {totalGoingParticipants >= 2 && !allReady && totalCount > 0 && (
                            <li className="flex items-center gap-2">
                              <span className="text-yellow-500">⏳</span>
                              <span>Wait for all participants to be ready ({readyCount} of {totalCount} ready)</span>
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                    
                    {canStart && (
                      <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4 mb-4">
                        <p className="text-green-800 font-semibold mb-1">🎉 All set! You're ready to start the game!</p>
                        <p className="text-sm text-green-700">All participants are ready and all requirements are met.</p>
                      </div>
                    )}
                    
                    <Button
                      onClick={handleStartGame}
                      disabled={!canStart}
                      className="px-12 py-4 text-xl font-bold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {canStart ? '🎮 Start Game' : 'Waiting...'}
                    </Button>
                    
                    {canStart && (
                      <p className="text-sm text-gray-600 mt-3">
                        Once you start, the game will begin and participants can start selecting gifts!
                      </p>
                    )}
                  </div>
                );
              })()}
            </>
          ) : (
            currentParticipant && currentParticipant.status === 'GOING' && (
              <>
                {(() => {
                  const hasShippingAddress = userShippingAddress && userShippingAddress.street && userShippingAddress.city;
                  const canBeReady = userGift && hasShippingAddress;
                  
                  return (
                    <div className="text-center space-y-4">
                      <h3 className="text-2xl font-bold text-gray-900 mb-2">
                        {currentParticipant.ready ? "You're Ready!" : "Mark Yourself Ready"}
                      </h3>
                      
                      {!canBeReady && (
                        <div className="bg-white rounded-lg p-4 mb-4 space-y-2 text-left">
                          <p className="font-semibold text-gray-900 mb-2">Complete these steps first:</p>
                          <ul className="space-y-1 text-sm text-gray-600">
                            {!userGift && (
                              <li className="flex items-center gap-2">
                                <span className="text-red-500">✗</span>
                                <span>Submit your gift</span>
                              </li>
                            )}
                            {!hasShippingAddress && (
                              <li className="flex items-center gap-2">
                                <span className="text-red-500">✗</span>
                                <span>Add your shipping address</span>
                              </li>
                            )}
                          </ul>
                        </div>
                      )}
                      
                      {canBeReady && currentParticipant.ready && (
                        <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4 mb-4">
                          <p className="text-green-800 font-semibold">✓ You're all set! Waiting for the host to start the game.</p>
                        </div>
                      )}
                      
                      <Button
                        onClick={handleToggleReady}
                        variant={currentParticipant.ready === true ? "secondary" : "primary"}
                        className="px-12 py-4 text-xl font-bold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!canBeReady}
                      >
                        {currentParticipant.ready === true ? "✓ I'm Ready!" : "🎉 Let's Party!"}
                      </Button>
                      
                      {canBeReady && !currentParticipant.ready && (
                        <p className="text-sm text-gray-600 mt-3">
                          Click the button above when you're ready for the game to start!
                        </p>
                      )}
                    </div>
                  );
                })()}
              </>
            )
          )}
        </div>
      )}

      {/* Share Link Modal */}
      <Modal
        isOpen={showShareModal}
        onClose={() => {
          setShowShareModal(false);
          setLinkCopied(false);
        }}
        title="Share Party Link"
      >
        <div className="space-y-4">
          <p className="text-gray-600">
            Share this link with friends to let them join your party. Anyone with the link can join!
          </p>
          <div className="flex gap-2">
            <Input
              type="text"
              value={`${window.location.origin}/party/${partyId}`}
              readOnly
              className="flex-1 font-mono text-sm"
            />
            <Button
              onClick={async () => {
                const link = `${window.location.origin}/party/${partyId}`;
                try {
                  await navigator.clipboard.writeText(link);
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 2000);
                } catch (error) {
                  // Fallback for older browsers
                  const input = document.createElement('input');
                  input.value = link;
                  document.body.appendChild(input);
                  input.select();
                  document.execCommand('copy');
                  document.body.removeChild(input);
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 2000);
                }
              }}
              variant={linkCopied ? 'secondary' : 'primary'}
            >
              {linkCopied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
          <div className="pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setShowShareModal(false);
                setLinkCopied(false);
              }}
              className="w-full"
            >
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Email Invite Modal */}
      <Modal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        title="Send Invite"
      >
        <Input
          type="email"
          label="Email Address"
          placeholder="friend@example.com"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          required
        />
        <div className="flex gap-3 justify-end mt-4">
          <Button variant="secondary" onClick={() => setShowInviteModal(false)}>
            Cancel
          </Button>
          <Button onClick={handleSendInvite}>Send Invite</Button>
        </div>
      </Modal>
    </div>
  );
}

