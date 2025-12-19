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
import { GiftCard } from './GiftCard.jsx';
import { trackSubmitGift, trackStartGame, trackInviteSent, trackParticipantJoin, trackError, trackGameAbandoned } from '../utils/analytics.js';
import { SimulationControls } from './dev/SimulationControls.jsx';
import { useGameSocket } from '../hooks/useGameSocket.js';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  addDoc,
  getDoc,
  deleteDoc,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { db } from '../utils/firebase.js';

export function PartyLobby({ partyId, onStartGame }) {
  const { user } = useAuth();
  const { party, participants, pendingInvites, gifts, loading } = useParty(partyId);
  const { socket } = useGameSocket(partyId); // Get socket for simulation controls
  const [giftUrl, setGiftUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualImageUrl, setManualImageUrl] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [pastedImage, setPastedImage] = useState(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [userNames, setUserNames] = useState({});
  const [userEmails, setUserEmails] = useState({});
  const [userIsBot, setUserIsBot] = useState({});
  const [newPersonName, setNewPersonName] = useState('');
  const [newPersonEmail, setNewPersonEmail] = useState('');
  const [addingPerson, setAddingPerson] = useState(false);
  const [showAddPeople, setShowAddPeople] = useState(false);
  const [maxSteals, setMaxSteals] = useState(party?.config?.maxSteals ?? '');
  const [returnToStart, setReturnToStart] = useState(party?.config?.returnToStart ?? false);
  const [priceLimit, setPriceLimit] = useState(party?.config?.priceLimit ?? '');
  const [editingRules, setEditingRules] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [openStep, setOpenStep] = useState(null); // Track which step is open

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
        if (response.bots) {
          setUserIsBot(response.bots);
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

  // Update local state when party config changes
  useEffect(() => {
    if (party?.config) {
      setMaxSteals(party.config.maxSteals ?? '');
      setReturnToStart(party.config.returnToStart ?? false);
      setPriceLimit(party.config.priceLimit ?? '');
    }
  }, [party]);

  // Compress image to reduce size for Firestore (max ~700KB to stay under 1MB limit)
  const compressImage = (file, callback) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Resize if too large (max 600px on longest side for better compression)
        const maxDimension = 600;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height / width) * maxDimension);
            width = maxDimension;
          } else {
            width = Math.round((width / height) * maxDimension);
            height = maxDimension;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Try different quality levels until we get under 700KB
        const tryCompress = (quality) => {
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          // More accurate base64 size calculation
          const base64Length = dataUrl.length - (dataUrl.indexOf(',') + 1);
          const sizeInBytes = (base64Length * 3) / 4;
          
          if (sizeInBytes > 700000 && quality > 0.3) {
            // Try lower quality
            return tryCompress(quality - 0.1);
          }
          return dataUrl;
        };
        
        const compressedDataUrl = tryCompress(0.7);
        callback(compressedDataUrl);
      };
      img.onerror = () => {
        // If image fails to load, show error
        alert('Failed to load image. Please try a different image.');
      };
      img.src = event.target?.result;
    };
    reader.readAsDataURL(file);
  };

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
      // Normalize URL (ensure it has protocol) before sending to API
      const normalizedUrl = giftUrl.startsWith('http') ? giftUrl : `https://${giftUrl}`;
      const { title, image, price, error } = await scrapeGiftUrl(normalizedUrl);

      // Check if scraping returned meaningful data
      if (error || !title || title === 'Gift' || title === 'Untitled Gift' || !image) {
        // Show manual entry form instead of just confirming
        setShowManualEntry(true);
        setManualTitle(title && title !== 'Gift' && title !== 'Untitled Gift' ? title : '');
        setManualImageUrl(image || '');
        setManualPrice(price || '');
        setPastedImage(null);
        setScraping(false);
        return;
      }

      // Check price limit if set
      const partyPriceLimit = party?.config?.priceLimit;
      if (partyPriceLimit && price) {
        // Extract numeric value from price string (handles formats like "$25.99", "25.99", etc.)
        const priceMatch = price.match(/[\d.]+/);
        if (priceMatch) {
          const giftPrice = parseFloat(priceMatch[0]);
          const limit = parseFloat(partyPriceLimit);
          if (giftPrice > limit) {
            const proceed = confirm(
              `Warning: This gift's price (${price}) exceeds the party's price limit of $${limit.toFixed(2)}. Do you want to submit it anyway?`
            );
            if (!proceed) {
              setScraping(false);
              return;
            }
          }
        }
      }

      // Ensure user is a participant BEFORE creating/updating gift
      // This prevents permission errors
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

      // Create or update gift
      const giftData = {
        partyId,
        submitterId: user.uid,
        url: normalizedUrl,
        title,
        image,
        price,
        isFrozen: false,
        winnerId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      if (userGift) {
        // Update existing gift
        await updateDoc(doc(db, 'gifts', userGift.id), giftData);
        console.log('Gift updated successfully');
      } else {
        // Create new gift
        const giftRef = await addDoc(collection(db, 'gifts'), giftData);
        console.log('Gift created successfully with ID:', giftRef.id);
      }

      // Track gift submission
      trackSubmitGift(partyId);

      // Clear the form
      setGiftUrl('');
      
      // Auto-advance to next step
      const currentIndex = setupSteps.findIndex(s => s.id === 'gift');
      if (currentIndex < setupSteps.length - 1) {
        setTimeout(() => {
          setOpenStep(setupSteps[currentIndex + 1].id);
        }, 500);
      } else {
        setOpenStep(null);
      }
      
      // Show success message (the UI will update via the real-time listener)
      // Give it a moment for the listener to pick up the change
      setTimeout(() => {
        // Check if gift appears in the list
        const updatedGift = gifts.find((g) => g.submitterId === user.uid);
        if (!updatedGift) {
          console.warn('Gift created but not yet visible in UI - this is normal, it should appear shortly');
        }
      }, 500);
    } catch (error) {
      console.error('Error submitting gift:', error);
      console.error('Error details:', {
        code: error.code,
        message: error.message,
        stack: error.stack
      });
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
      
      // If marking as ready, close the step
      if (newReadyState && !isAdmin) {
        setOpenStep(null);
      }
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
      // Use centralized config for server URL
      const isProd = typeof window !== 'undefined' && (window.location.hostname === 'stealorreveal.com' || window.location.hostname === 'www.stealorreveal.com');
      const serverUrl = import.meta.env.VITE_SERVER_URL || (isProd ? `https://api.${window.location.hostname.replace('www.', '')}` : 'http://localhost:3001');
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
        // Track game start with participant count
        const participantCount = goingParticipants.length;
        trackStartGame(partyId, participantCount);
        onStartGame();
      } else {
        const errorMsg = data.error || 'Unknown error';
        trackError('start_game_failed', errorMsg, 'PartyLobby');
        alert('Failed to start game: ' + errorMsg);
      }
    } catch (error) {
      console.error('Error starting game:', error);
      trackError('start_game_exception', error.message, 'PartyLobby');
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
        
        // Special handling for Resend testing mode
        if (data.message?.includes('testing mode') || data.message?.includes('verified email')) {
          errorMsg = `Email service is in testing mode. Only verified emails (like ${user?.email}) can receive invites. The recipient can still join using the share link.`;
        }
        
        alert('Failed to send invite: ' + errorMsg);
      }
    } catch (error) {
      console.error('Error sending invite:', error);
      alert('Failed to send invite. Make sure Firebase Functions are running or deployed. Error: ' + error.message);
    }
  };

  const handleAddPerson = async () => {
    if (!newPersonEmail.trim() || !newPersonEmail.includes('@')) {
      alert('Please enter a valid email address');
      return;
    }

    setAddingPerson(true);
    const emailLower = newPersonEmail.trim().toLowerCase();
    const inviteId = emailLower.replace(/[^a-z0-9]/g, '_');
    const name = newPersonName.trim() || null;

    try {
      // Add/update them directly as GOING status
      await setDoc(
        doc(db, 'parties', partyId, 'pendingInvites', inviteId),
        {
          email: emailLower,
          name: name,
          status: 'GOING',
          addedAt: new Date(),
          updatedAt: new Date(),
        },
        { merge: true }
      );

      // Try to send email and provide feedback
      try {
        const functionUrl =
          import.meta.env.VITE_FUNCTIONS_URL ||
          'https://us-central1-better-white-elephant.cloudfunctions.net/sendPartyInvite';

        const hostName = user?.displayName || user?.email?.split('@')[0] || 'Someone';

        const emailResponse = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: emailLower,
            partyId,
            hostName,
          }),
        });

        if (emailResponse.ok) {
          // Update invite status to show email was sent
          await updateDoc(
            doc(db, 'parties', partyId, 'pendingInvites', inviteId),
            {
              status: 'SENT',
              sentAt: new Date(),
              updatedAt: new Date(),
            }
          );
          console.log(`✅ Invite email sent to ${emailLower}`);
        } else {
          // Mark that email failed but person was added
          await updateDoc(
            doc(db, 'parties', partyId, 'pendingInvites', inviteId),
            {
              emailFailed: true,
              updatedAt: new Date(),
            }
          );
          console.warn(`⚠️ Email sending failed for ${emailLower}, but person was added`);
        }
      } catch (emailError) {
        // Mark email as failed but person was still added
        try {
          await updateDoc(
            doc(db, 'parties', partyId, 'pendingInvites', inviteId),
            {
              emailFailed: true,
              updatedAt: new Date(),
            }
          );
        } catch (updateError) {
          console.error('Failed to update invite status:', updateError);
        }
        console.warn('Email sending failed, but person added:', emailError);
      }

      setNewPersonName('');
      setNewPersonEmail('');
      setShowAddPeople(false);
      
      // Auto-advance to next step if participants requirement is met
      // Note: The participant count will update via real-time listener
      setTimeout(() => {
        const displayedInvites = pendingInvites.filter(inv => inv.status === 'GOING' || inv.status !== 'ACCEPTED');
        const totalCount = participants.length + displayedInvites.length;
        if (totalCount >= 2 && isAdmin) {
          const currentIndex = setupSteps.findIndex(s => s.id === 'participants');
          if (currentIndex < setupSteps.length - 1) {
            setOpenStep(setupSteps[currentIndex + 1].id);
          }
        }
      }, 500);
    } catch (error) {
      console.error('Error adding person:', error);
      alert('Failed to add person: ' + error.message);
    } finally {
      setAddingPerson(false);
    }
  };

  const handleRemoveParticipant = async (participantId) => {
    // Prevent admin from removing themselves
    if (participantId === party?.adminId) {
      alert('You cannot remove yourself as the host.');
      return;
    }

    if (!confirm('Are you sure you want to remove this participant?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'parties', partyId, 'participants', participantId));
      // Also delete their gift if they have one
      const giftsSnapshot = await getDocs(
        query(
          collection(db, 'gifts'),
          where('partyId', '==', partyId),
          where('submitterId', '==', participantId)
        )
      );
      
      for (const giftDoc of giftsSnapshot.docs) {
        await deleteDoc(doc(db, 'gifts', giftDoc.id));
      }
    } catch (error) {
      console.error('Error removing participant:', error);
      alert('Failed to remove participant: ' + error.message);
    }
  };

  const handleRemovePendingInvite = async (inviteId) => {
    if (!confirm('Remove this person from the invite list?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'parties', partyId, 'pendingInvites', inviteId));
    } catch (error) {
      console.error('Error removing invite:', error);
      alert('Failed to remove: ' + error.message);
    }
  };

  const handleUpdateRules = async () => {
    // Validate maxSteals is required
    if (!maxSteals || parseInt(maxSteals) < 1) {
      alert('Max Steals is required and must be at least 1');
      return;
    }
    
    setSavingRules(true);
    try {
      await updateDoc(doc(db, 'parties', partyId), {
        config: {
          maxSteals: parseInt(maxSteals),
          returnToStart: returnToStart,
          priceLimit: priceLimit ? parseFloat(priceLimit) : null,
        },
        updatedAt: new Date(),
      });
      setEditingRules(false);
      // Auto-advance to next step
      const currentIndex = setupSteps.findIndex(s => s.id === 'rules');
      if (currentIndex < setupSteps.length - 1) {
        setOpenStep(setupSteps[currentIndex + 1].id);
      } else {
        setOpenStep(null);
      }
    } catch (error) {
      console.error('Error updating rules:', error);
      alert('Failed to update game rules: ' + error.message);
    } finally {
      setSavingRules(false);
    }
  };

  // Calculate setup progress (must be before early returns to maintain hook order)
  const setupSteps = isAdmin ? [
    { id: 'rules', label: 'Set game rules', completed: (() => {
      // Rules are complete if maxSteals is set (required field)
      return !!(party?.config?.maxSteals);
    })() },
    { id: 'participants', label: 'Add participants', completed: (() => {
      const displayedInvites = pendingInvites.filter(inv => inv.status === 'GOING' || inv.status !== 'ACCEPTED');
      return participants.length + displayedInvites.length >= 2;
    })() },
    { id: 'gift', label: 'Submit your gift', completed: !!userGift },
    { id: 'ready', label: 'All participants ready', completed: (() => {
      const nonAdminParticipants = participants.filter((p) => p.status === 'GOING' && p.id !== party?.adminId);
      return nonAdminParticipants.length > 0 && nonAdminParticipants.every((p) => p.ready === true);
    })() },
  ] : [
    { id: 'gift', label: 'Submit your gift', completed: !!userGift },
    { id: 'ready', label: 'Mark yourself as ready', completed: currentParticipant?.ready === true },
  ];

  const completedSteps = setupSteps.filter(s => s.completed).length;
  const totalSteps = setupSteps.length;
  const progressPercentage = (completedSteps / totalSteps) * 100;

  // Auto-open first incomplete step, or keep current open step
  useEffect(() => {
    if (openStep === null) {
      const firstIncomplete = setupSteps.findIndex(s => !s.completed);
      if (firstIncomplete !== -1) {
        setOpenStep(setupSteps[firstIncomplete].id);
      }
    }
  }, [setupSteps, openStep]);

  // Debug logging
  console.log('PartyLobby render:', {
    partyId,
    hasParty: !!party,
    partyStatus: party?.status,
    loading,
    hasUser: !!user,
    participantsCount: participants?.length,
    giftsCount: gifts?.length
  });

  if (loading) {
    console.log('PartyLobby: Still loading');
    return <div className="p-8 text-center text-white">Loading party lobby...</div>;
  }

  if (!party) {
    console.log('PartyLobby: No party found');
    return <div className="p-8 text-center text-white">Party not found</div>;
  }

  console.log('PartyLobby: Rendering content');
  return (
    <div className="max-w-5xl mx-auto p-6 pt-24 space-y-6">
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

      {/* Gift Pile Hero Section */}
      <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl p-8 text-center">
        <div className="flex justify-center items-center flex-wrap gap-2 mb-4">
          {gifts.length > 0 ? (
            gifts.map((gift, index) => (
              <span
                key={gift.id}
                className="text-6xl -ml-4 first:ml-0 drop-shadow-lg transition-all hover:-translate-y-2"
                style={{ zIndex: gifts.length - index }}
              >
                🎁
              </span>
            ))
          ) : (
            <div className="text-slate-500 text-lg py-8">
              Waiting for gifts...
            </div>
          )}
        </div>
        <div className="text-2xl font-bold text-white">
          {gifts.length} Gift{gifts.length !== 1 ? 's' : ''} in the Pot
        </div>
      </div>

      {/* Setup Progress - Collapsible Accordion */}
      <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-white/5">
          <h2 className="text-2xl font-bold text-white mb-2">Setup Progress</h2>
          <div className="flex items-center gap-4">
            <div className="flex-1 bg-slate-800/50 rounded-full h-3 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-blue-500 to-green-500 h-full transition-all duration-500 rounded-full"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            <span className="text-sm font-semibold text-slate-300">
              {completedSteps} of {totalSteps} complete
            </span>
          </div>
        </div>
        
        <div className="divide-y divide-white/5">
          {setupSteps.map((step, index) => {
            const isOpen = openStep === step.id;
            const stepContent = (() => {
              switch (step.id) {
                case 'rules':
                  if (!isAdmin) return null;
                  return (
                    <div className="p-6">
                      {editingRules ? (
                        <div className="space-y-4">
                          <Input
                            type="number"
                            label="Max Steals *"
                            value={maxSteals}
                            onChange={(e) => setMaxSteals(e.target.value)}
                            min="1"
                            placeholder="e.g., 3"
                          />
                          <Input
                            type="number"
                            label="Price Limit (optional)"
                            placeholder="e.g., 25.00"
                            value={priceLimit}
                            onChange={(e) => setPriceLimit(e.target.value)}
                            min="0"
                            step="0.01"
                          />
                          <p className="text-xs text-slate-400">
                            Set a maximum price for gifts. Participants will see a warning if their gift exceeds this limit.
                          </p>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="returnToStart"
                              checked={returnToStart}
                              onChange={(e) => setReturnToStart(e.target.checked)}
                              className="w-4 h-4 text-purple-500 border-slate-600 rounded focus:ring-purple-500 bg-slate-800"
                            />
                            <label htmlFor="returnToStart" className="text-sm text-slate-300">
                              Enable Boomerang Rule (reverse turn order after last player)
                            </label>
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              onClick={handleUpdateRules} 
                              disabled={savingRules}
                            >
                              {savingRules ? 'Saving...' : 'Save Rules'}
                            </Button>
                            <Button 
                              variant="secondary" 
                              onClick={() => {
                                setEditingRules(false);
                                setMaxSteals(party?.config?.maxSteals ?? '');
                                setReturnToStart(party?.config?.returnToStart ?? false);
                                setPriceLimit(party?.config?.priceLimit ?? '');
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                            <span className="text-slate-300 font-medium">Max Steals:</span>
                            <span className="text-white font-semibold">
                              {party?.config?.maxSteals ? party.config.maxSteals : 'Not set'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                            <span className="text-slate-300 font-medium">Price Limit:</span>
                            <span className="text-white font-semibold">
                              {party?.config?.priceLimit ? `$${parseFloat(party.config.priceLimit).toFixed(2)}` : 'Not set'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                            <span className="text-slate-300 font-medium">Boomerang Rule:</span>
                            <span className={`font-semibold ${party?.config?.returnToStart ? 'text-green-400' : 'text-slate-400'}`}>
                              {party?.config?.returnToStart ? 'Enabled' : 'Disabled'}
                            </span>
                          </div>
                          {step.completed && (
                            <Button
                              variant="secondary"
                              onClick={() => {
                                setEditingRules(true);
                                setOpenStep(step.id);
                              }}
                              className="w-full sm:w-auto"
                            >
                              Edit Rules
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                case 'participants':
                  if (!isAdmin) return null;
                  return (
                    <div className="p-6">
                      <div className="mb-4">
                        <p className="text-slate-300 mb-4">
                          {(() => {
                            const displayedInvites = pendingInvites.filter(inv => inv.status === 'GOING' || inv.status !== 'ACCEPTED');
                            const totalCount = participants.length + displayedInvites.length;
                            return totalCount >= 2
                              ? `Great! You have ${totalCount} participants.`
                              : `You need at least 2 participants to start. Currently: ${totalCount}`;
                          })()}
                        </p>
                      </div>

                      <div className="mb-4">
                        {!showAddPeople ? (
                          <Button
                            variant="secondary"
                            onClick={() => setShowAddPeople(true)}
                            className="w-full sm:w-auto"
                          >
                            Add Person
                          </Button>
                        ) : (
                          <div className="space-y-3">
            <Input
                              type="text"
                              label="Name (optional)"
                              placeholder="John Doe"
                              value={newPersonName}
                              onChange={(e) => setNewPersonName(e.target.value)}
                            />
                            <div className="flex gap-2">
                              <Input
                                type="email"
                                label="Email"
                                placeholder="friend@example.com"
                                value={newPersonEmail}
                                onChange={(e) => setNewPersonEmail(e.target.value)}
                                className="flex-1"
                              />
                              <div className="flex items-end gap-2">
                                <Button
                                  onClick={handleAddPerson}
                                  disabled={!newPersonEmail.trim() || !newPersonEmail.includes('@') || addingPerson}
                                >
                                  {addingPerson ? 'Adding...' : 'Add'}
                                </Button>
                                <Button
                                  variant="secondary"
                                  onClick={() => {
                                    setShowAddPeople(false);
                                    setNewPersonName('');
                                    setNewPersonEmail('');
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                            <p className="text-xs text-slate-400">
                              An email invite will be sent automatically, or they can use the share link.
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {participants.map((participant) => {
                          const isYou = participant.id === user?.uid;
                          const isAdminParticipant = participant.id === party?.adminId;
                          const isBot = userIsBot[participant.id] || participant.id.startsWith('bot_');
                          const displayName = isYou 
                            ? 'You (Host)' 
                            : (userNames[participant.id] && userNames[participant.id] !== participant.id 
                                ? userNames[participant.id] 
                                : null);
                          const email = userEmails[participant.id] || null;
                          
                          return (
                            <div
                              key={participant.id}
                              className={`flex items-center justify-between p-3 rounded-lg ${
                                isBot ? 'bg-purple-900/30 border border-purple-500/30' : 'bg-slate-800/50'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div>
                                  <span className="text-white font-medium flex items-center gap-2">
                                    {displayName || email || `User ${participant.id.slice(0, 8)}`}
                                    {isBot && (
                                      <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded border border-purple-500/30">
                                        🤖 Bot
                                  </span>
                                    )}
                                  </span>
                                  {email && displayName && !isYou && !isBot && (
                                    <span className="text-xs text-slate-400 ml-1">({email})</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {!isAdminParticipant && (
                                  <Button
                                    variant="danger"
                                    onClick={() => handleRemoveParticipant(participant.id)}
                                    className="text-xs px-2 py-1"
                                  >
                                    Remove
                                  </Button>
                                )}
                                {isAdminParticipant && (
                                  <span className="text-xs text-slate-400">Cannot remove host</span>
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
                              className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg"
                            >
                              <div className="flex items-center gap-3">
                                <div>
                                  {invite.name && (
                                    <span className="text-white font-medium">{invite.name}</span>
                                  )}
                                  {invite.email && (
                                    <span className={`${invite.name ? 'text-xs text-slate-400 ml-1' : 'text-white font-medium'}`}>
                                      {invite.name ? `(${invite.email})` : invite.email}
                                    </span>
                                  )}
                                </div>
                                {invite.emailFailed && (
                                  <span className="text-xs text-orange-600 ml-2">Email failed</span>
                                )}
                                {invite.status === 'SENT' && !invite.emailFailed && (
                                  <span className="text-xs text-green-500 ml-2">✓ Email sent</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {(invite.emailFailed || !invite.sentAt) && (
                                  <Button
                                    variant="secondary"
                                    onClick={async () => {
                                      try {
                                        const functionUrl =
                                          import.meta.env.VITE_FUNCTIONS_URL ||
                                          'https://us-central1-better-white-elephant.cloudfunctions.net/sendPartyInvite';
                                        const hostName = user?.displayName || user?.email?.split('@')[0] || 'Someone';
                                        const response = await fetch(functionUrl, {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({
                                            email: invite.email,
                                            partyId,
                                            hostName,
                                          }),
                                        });
                                        
                                        const data = await response.json();
                                        
                                        if (response.ok) {
                                          await updateDoc(
                                            doc(db, 'parties', partyId, 'pendingInvites', invite.id),
                                            { status: 'SENT', sentAt: new Date(), emailFailed: false, updatedAt: new Date() }
                                          );
                                          alert('Invite sent successfully!');
                                        } else {
                                          // Show detailed error message
                                          let errorMsg = data.message || data.error || 'Failed to send invite';
                                          
                                          // Check if it's a Resend testing mode limitation
                                          if (data.message?.includes('testing mode') || data.message?.includes('verified email')) {
                                            errorMsg = `Email service is in testing mode. Only verified emails can receive invites. ${invite.email} can still join using the share link.`;
                                          }
                                          
                                          alert(errorMsg);
                                          
                                          // Mark as failed if it's a real error (not just testing mode)
                                          if (response.status !== 403) {
                                            await updateDoc(
                                              doc(db, 'parties', partyId, 'pendingInvites', invite.id),
                                              { emailFailed: true, updatedAt: new Date() }
                                            );
                                          }
                                        }
                                      } catch (error) {
                                        console.error('Error resending invite:', error);
                                        alert(`Failed to send invite: ${error.message}. They can still use the share link.`);
                                        try {
                                          await updateDoc(
                                            doc(db, 'parties', partyId, 'pendingInvites', invite.id),
                                            { emailFailed: true, updatedAt: new Date() }
                                          );
                                        } catch (updateError) {
                                          console.error('Failed to update invite status:', updateError);
                                        }
                                      }
                                    }}
                                    className="text-xs px-2 py-1"
                                  >
                                    Resend Email
                                  </Button>
                                )}
                                <Button
                                  variant="danger"
                                  onClick={() => handleRemovePendingInvite(invite.id)}
                                  className="text-xs px-2 py-1"
                                >
                                  Remove
                                </Button>
                              </div>
                            </div>
                          ))}
                      </div>
                      
                      {participants.length === 0 && pendingInvites.filter(inv => inv.status !== 'ACCEPTED').length === 0 && (
                        <p className="text-slate-400 text-center py-4">No participants yet. Add someone above or use the Share Link button to invite people!</p>
                      )}
                    </div>
                  );
                case 'gift':
                  return (
                    <div className="p-6">
                      {!userGift ? (
                        <div className="space-y-4">
                          {!showManualEntry ? (
                            <>
                              <p className="text-slate-300">
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
                                    className="w-full px-3 py-2 bg-slate-950/50 border border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 text-white placeholder:text-slate-500"
            />
                                </div>
                                <Button onClick={handleSubmitGift} disabled={scraping || !giftUrl.trim()} className="px-6">
              {scraping ? 'Processing...' : 'Submit Gift'}
            </Button>
          </div>
                              <div className="flex items-center gap-2">
                                <p className="text-sm text-slate-400">
                                  💡 Tip: Use any product page URL from Amazon, Etsy, or other online stores
                                </p>
                                <span className="text-slate-500">•</span>
                                <button
                                  type="button"
                                  onClick={() => setShowManualEntry(true)}
                                  className="text-sm text-purple-400 hover:text-purple-300 hover:underline"
                                >
                                  Or enter details manually
                                </button>
                              </div>
                            </>
                          ) : (
                            <div 
                              className="space-y-4"
                              onPaste={(e) => {
                                const items = e.clipboardData?.items;
                                if (items) {
                                  for (let i = 0; i < items.length; i++) {
                                    if (items[i].type.indexOf('image') !== -1) {
                                      const blob = items[i].getAsFile();
                                      compressImage(blob, (compressedDataUrl) => {
                                        setPastedImage(compressedDataUrl);
                                        setManualImageUrl('');
                                      });
                                      e.preventDefault();
                                      break;
                                    }
                                  }
                                }
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <p className="text-slate-300">
                                  Enter your gift details manually. Some sites block automatic extraction.
                                </p>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowManualEntry(false);
                                    setManualTitle('');
                                    setManualImageUrl('');
                                    setManualPrice('');
                                    setPastedImage(null);
                                  }}
                                  className="text-sm text-purple-400 hover:text-purple-300 hover:underline"
                                >
                                  Try URL again
                                </button>
                              </div>
                              <Input
                                type="url"
                                label="Gift URL"
                                placeholder="https://example.com/gift"
                                value={giftUrl}
                                onChange={(e) => setGiftUrl(e.target.value)}
                                required
                                className="bg-slate-950/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-purple-500"
                              />
                              <div className="grid grid-cols-2 gap-4">
                                <Input
                                  type="text"
                                  label="Gift Title"
                                  placeholder="e.g., Wireless Headphones"
                                  value={manualTitle}
                                  onChange={(e) => setManualTitle(e.target.value)}
                                  required
                                  className="bg-slate-950/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-purple-500"
                                />
                                <Input
                                  type="text"
                                  label="Price (optional)"
                                  placeholder="e.g., $25.99"
                                  value={manualPrice}
                                  onChange={(e) => setManualPrice(e.target.value)}
                                  className="bg-slate-950/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-purple-500"
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="block text-sm font-medium text-slate-300">
                                  Image (optional)
                                </label>
                                <div className="flex gap-2">
                                  <Input
                                    type="url"
                                    placeholder="https://example.com/image.jpg"
                                    value={manualImageUrl}
                                    onChange={(e) => {
                                      setManualImageUrl(e.target.value);
                                      setPastedImage(null);
                                    }}
                                    className="flex-1 bg-slate-950/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-purple-500"
                                  />
                                  <span className="text-slate-500 self-center">or</span>
                                  <label className="px-4 py-2 border border-slate-700 rounded-md cursor-pointer hover:bg-slate-800/50 text-sm text-slate-300 whitespace-nowrap">
                                    📋 Paste Image
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          compressImage(file, (compressedDataUrl) => {
                                            setPastedImage(compressedDataUrl);
                                            setManualImageUrl('');
                                          });
                                        }
                                      }}
                                    />
                                  </label>
                                </div>
                                {pastedImage && (
                                  <div className="relative">
                                    <img
                                      src={pastedImage}
                                      alt="Pasted gift image"
                                      className="w-32 h-32 object-cover rounded-lg border border-slate-700"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setPastedImage(null)}
                                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                                    >
                                      ×
                                    </button>
        </div>
      )}
                                <p className="text-xs text-slate-400">
                                  Paste an image from your clipboard or enter an image URL
                                </p>
                              </div>
                              <div className="flex gap-2">
            <Button
              onClick={async () => {
                                    if (!giftUrl.trim() || !manualTitle.trim()) {
                                      alert('Please enter a URL and title');
                                      return;
                                    }
                                    
                                    setScraping(true);
                                    try {
                                      const normalizedUrl = giftUrl.startsWith('http') ? giftUrl : `https://${giftUrl}`;
                                      
                                      // Check price limit if set
                                      const partyPriceLimit = party?.config?.priceLimit;
                                      if (partyPriceLimit && manualPrice) {
                                        const priceMatch = manualPrice.match(/[\d.]+/);
                                        if (priceMatch) {
                                          const giftPrice = parseFloat(priceMatch[0]);
                                          const limit = parseFloat(partyPriceLimit);
                                          if (giftPrice > limit) {
                                            const proceed = confirm(
                                              `Warning: This gift's price (${manualPrice}) exceeds the party's price limit of $${limit.toFixed(2)}. Do you want to submit it anyway?`
                                            );
                                            if (!proceed) {
                                              setScraping(false);
                                              return;
                                            }
                                          }
                                        }
                                      }

                                      // Ensure user is a participant BEFORE creating/updating gift
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

                                      const giftData = {
                                        partyId,
                                        submitterId: user.uid,
                                        url: normalizedUrl,
                                        title: manualTitle.trim(),
                                        image: pastedImage || manualImageUrl.trim() || null,
                                        price: manualPrice.trim() || null,
                                        isFrozen: false,
                                        winnerId: null,
                                        createdAt: new Date(),
                                        updatedAt: new Date(),
                                      };

                                      if (userGift) {
                                        await updateDoc(doc(db, 'gifts', userGift.id), giftData);
                                      } else {
                                        await addDoc(collection(db, 'gifts'), giftData);
                                      }

                                      // Clear the form
                                      setGiftUrl('');
                                      setManualTitle('');
                                      setManualImageUrl('');
                                      setManualPrice('');
                                      setPastedImage(null);
                                      setShowManualEntry(false);
                                      
                                      // Auto-advance to next step
                                      const currentIndex = setupSteps.findIndex(s => s.id === 'gift');
                                      if (currentIndex < setupSteps.length - 1) {
                                        setTimeout(() => {
                                          setOpenStep(setupSteps[currentIndex + 1].id);
                                        }, 500);
                                      } else {
                                        setOpenStep(null);
                                      }
                                    } catch (error) {
                                      console.error('Error submitting gift (manual entry):', error);
                                      alert('Failed to submit gift: ' + error.message);
                                    } finally {
                                      setScraping(false);
                }
              }}
                                  disabled={scraping || !giftUrl.trim() || !manualTitle.trim()}
                                  className="px-6"
                                >
                                  {scraping ? 'Submitting...' : 'Submit Gift'}
                                </Button>
                                <Button
                                  variant="secondary"
                                  onClick={() => {
                                    setShowManualEntry(false);
                                    setManualTitle('');
                                    setManualImageUrl('');
                                    setManualPrice('');
                                  }}
                                >
                                  Cancel
            </Button>
          </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 mb-4">
                            <span className="text-green-400 font-semibold">✓ Gift Submitted</span>
                          </div>
                          <div className="max-w-md">
                            <GiftCard
                              gift={userGift}
                              isWrapped={false}
                              ownerId={user.uid}
                              ownerName="You"
                              darkMode={true}
                            />
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
                                  setOpenStep(step.id);
                                } catch (error) {
                                  console.error('Error deleting gift:', error);
                                  alert('Failed to delete gift: ' + error.message);
                                }
                              }
                            }}
                            className="w-full sm:w-auto"
                          >
                            Change Gift
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                case 'ready':
                  if (isAdmin) {
                    const nonAdminParticipants = participants.filter((p) => p.status === 'GOING' && p.id !== party?.adminId);
                    const allReady = nonAdminParticipants.length > 0 && nonAdminParticipants.every((p) => p.ready === true);
                    const readyCount = nonAdminParticipants.filter((p) => p.ready === true).length;
                    const totalCount = nonAdminParticipants.length;
                    
                    return (
                      <div className="p-6">
                        {allReady ? (
                          <div className="bg-green-500/10 border-2 border-green-500/30 rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-green-400 font-semibold">✓ All Participants Ready</span>
          </div>
                            <p className="text-sm text-slate-300">
                              All {totalCount} participant{totalCount !== 1 ? 's are' : ' is'} ready. You can start the game!
                            </p>
        </div>
                        ) : totalCount === 0 ? (
                          <div className="space-y-3">
                            <p className="text-slate-300">
                              Waiting for participants to join and mark themselves as ready.
                            </p>
                            <Button
                              onClick={() => setShowShareModal(true)}
                              className="w-full sm:w-auto"
                            >
                              📤 Share Party Link
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <p className="text-slate-300">
                              {readyCount} of {totalCount} participant{totalCount !== 1 ? 's are' : ' is'} ready.
                            </p>
                            <div className="space-y-2">
                              {participants
                                .filter((p) => p.status === 'GOING' && p.id !== party?.adminId)
                                .map((participant) => {
                                  const isBot = userIsBot[participant.id] || participant.id.startsWith('bot_');
                                  const displayName = userNames[participant.id] && userNames[participant.id] !== participant.id 
                  ? userNames[participant.id] 
                                    : (userEmails[participant.id] || `User ${participant.id.slice(0, 8)}`);
            
            return (
                                    <div
                key={participant.id}
                                      className={`flex items-center justify-between p-3 rounded-lg ${
                                        isBot ? 'bg-purple-900/30 border border-purple-500/30' : 'bg-slate-800/50'
                                      }`}
                                    >
                                      <span className="text-white font-medium flex items-center gap-2">
                                        {displayName}
                                        {isBot && (
                                          <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded border border-purple-500/30">
                                            🤖 Bot
                                          </span>
                                        )}
                                      </span>
                                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        participant.ready === true
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                      }`}>
                                        {participant.ready === true ? '✓ Ready' : 'Waiting...'}
                    </span>
                  </div>
            );
          })}
                            </div>
                            <Button
                              onClick={() => setShowShareModal(true)}
                              variant="secondary"
                              className="w-full sm:w-auto"
                            >
                              📤 Share Party Link
                            </Button>
                  </div>
                  )}
                </div>
                    );
                  } else {
                    return (
                      <div className="p-6">
                        {currentParticipant?.ready === true ? (
                          <div className="bg-green-500/10 border-2 border-green-500/30 rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-green-400 font-semibold">✓ You're Ready!</span>
                            </div>
                            <p className="text-sm text-slate-300 mb-4">
                              You've marked yourself as ready. Waiting for other participants and the host to start the game.
                            </p>
                            <Button
                              variant="secondary"
                              onClick={handleToggleReady}
                              className="w-full sm:w-auto"
                            >
                              Mark as Not Ready
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <p className="text-slate-300">
                              Once you've submitted your gift, mark yourself as ready to let the host know you're prepared for the game.
                            </p>
                            <Button
                              onClick={handleToggleReady}
                              disabled={!userGift}
                              className="w-full sm:w-auto"
                            >
                              I'm Ready!
                            </Button>
                            {!userGift && (
                              <p className="text-sm text-slate-400">
                                Please submit your gift first before marking yourself as ready.
                              </p>
                    )}
                  </div>
                  )}
                </div>
                    );
                  }
                default:
                  return null;
              }
            })();
            
            if (!stepContent && step.id === 'rules' && !isAdmin) return null;
            
            return (
              <div key={step.id} className="transition-all duration-300">
                <button
                  type="button"
                  onClick={() => {
                    if (isOpen) {
                      setOpenStep(null);
                    } else {
                      setOpenStep(step.id);
                      if (step.id === 'rules' && !editingRules) {
                        setEditingRules(false);
                      }
                    }
                  }}
                  className="w-full flex items-center gap-3 p-4 hover:bg-slate-800/50 transition-colors"
                >
                  <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg transition-colors ${
                    step.completed 
                      ? 'bg-green-500 text-white' 
                      : isOpen
                        ? 'bg-green-500 text-white'
                        : 'bg-slate-800 text-slate-400'
                  }`}>
                    {step.completed ? '✓' : index + 1}
                  </div>
                  <span className={`flex-1 text-left font-medium ${
                    step.completed ? 'text-slate-300' : 'text-white'
                  }`}>
                    {step.label}
                </span>
                  <svg
                    className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ease-in-out ${
                    isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
                  }`}
                >
                  {stepContent}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Section */}
      {party.status === 'LOBBY' && (
        <div key="action-section" className="bg-slate-900/80 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl p-8">
          {isAdmin ? (
            <>
              {(() => {
                const nonAdminParticipants = participants.filter((p) => p.status === 'GOING' && p.id !== party?.adminId);
                const allReady = nonAdminParticipants.length > 0 && nonAdminParticipants.every((p) => p.ready === true);
                const readyCount = nonAdminParticipants.filter((p) => p.ready === true).length;
                const totalCount = nonAdminParticipants.length;
                const displayedInvites = pendingInvites.filter(inv => inv.status === 'GOING' || inv.status !== 'ACCEPTED');
                const totalParticipants = participants.length + displayedInvites.length;
                
                const hasShippingAddress = adminShippingAddress && adminShippingAddress.street && adminShippingAddress.city;
                const hasGift = !!userGift;
                const canStart = allReady && totalParticipants >= 2 && hasShippingAddress && hasGift;
                
                return (
                  <div className="text-center space-y-4">
                    <h3 className="text-2xl font-bold text-white mb-2">Ready to Start?</h3>
                    
                    {!canStart && (
                      <div className="bg-slate-950/50 rounded-lg p-4 mb-4 space-y-2 text-left">
                        <p className="font-semibold text-white mb-2">Complete these steps to start:</p>
                        <ul className="space-y-1 text-sm text-slate-300">
                          <li className="flex items-center gap-2">
                            {hasGift ? (
                              <span className="text-green-400">✓</span>
                            ) : (
                              <span className="text-slate-500">○</span>
                            )}
                            <span className={hasGift ? 'text-slate-300' : ''}>Submit your gift</span>
                          </li>
                          <li className="flex items-center gap-2">
                            {hasShippingAddress ? (
                              <span className="text-green-400">✓</span>
                            ) : (
                              <span className="text-slate-500">○</span>
                            )}
                            <span className={hasShippingAddress ? 'text-slate-300' : ''}>Add your shipping address</span>
                          </li>
                          <li className="flex items-center gap-2">
                            {totalParticipants >= 2 ? (
                              <span className="text-green-400">✓</span>
                            ) : (
                              <span className="text-slate-500">○</span>
                            )}
                            <span className={totalParticipants >= 2 ? 'text-slate-300' : ''}>
                              Invite at least 2 participants {totalParticipants < 2 && `(currently: ${totalParticipants})`}
                            </span>
                          </li>
                          {totalParticipants >= 2 && !allReady && totalCount > 0 && (
                            <li className="flex items-center gap-2">
                              <span className="text-amber-400">⏳</span>
                              <span>Wait for all participants to be ready ({readyCount} of {totalCount} ready)</span>
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                    
                    {canStart && (
                      <div className="bg-green-500/10 border-2 border-green-500/30 rounded-lg p-4 mb-4">
                        <p className="text-green-400 font-semibold mb-1">🎉 All set! You're ready to start the game!</p>
                        <p className="text-sm text-slate-300">All participants are ready and all requirements are met.</p>
                      </div>
                    )}
                    
                    {/* Mobile: Sticky Footer | Desktop: Inline Button */}
                    <div className="md:inline-block w-full md:w-auto">
                      {/* Mobile Sticky Footer */}
                      <div className="md:hidden fixed bottom-6 left-4 right-4 z-50 backdrop-blur-xl bg-slate-900/80 p-4 rounded-2xl border border-white/10 shadow-2xl">
                        <Button
                          onClick={handleStartGame}
                          disabled={!canStart}
                          className={`w-full px-12 py-4 text-xl font-bold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                            canStart ? 'shadow-[0_0_20px_rgba(168,85,247,0.5)]' : ''
                          } ${allReady && canStart ? 'animate-pulse' : ''}`}
                        >
                          {canStart ? '🎮 Start Game' : 'Waiting...'}
                        </Button>
                        {canStart && (
                          <p className="text-sm text-slate-300 text-center mt-3">
                            Once you start, the game will begin and participants can start selecting gifts!
                          </p>
                        )}
                      </div>
                      {/* Desktop Inline Button */}
                      <div className="hidden md:block text-center">
                        <Button
                          onClick={handleStartGame}
                          disabled={!canStart}
                          className={`px-12 py-4 text-xl font-bold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                            canStart ? 'shadow-[0_0_20px_rgba(168,85,247,0.5)]' : ''
                          } ${allReady && canStart ? 'animate-pulse' : ''}`}
                        >
                          {canStart ? '🎮 Start Game' : 'Waiting...'}
                        </Button>
                        {canStart && (
                          <p className="text-sm text-slate-300 mt-3">
                            Once you start, the game will begin and participants can start selecting gifts!
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {canStart && (
                      <p className="text-sm text-slate-300 mt-3">
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
                      <h3 className="text-2xl font-bold text-white mb-2">
                        {currentParticipant.ready ? "You're Ready!" : "Mark Yourself Ready"}
                      </h3>
                      
                      {!canBeReady && (
                        <div className="bg-slate-950/50 rounded-lg p-4 mb-4 space-y-2 text-left">
                          <p className="font-semibold text-white mb-2">Complete these steps first:</p>
                          <ul className="space-y-1 text-sm text-slate-300">
                            <li className="flex items-center gap-2">
                              {userGift ? (
                                <span className="text-green-400">✓</span>
                              ) : (
                                <span className="text-slate-500">○</span>
                              )}
                              <span className={userGift ? 'text-slate-300' : ''}>Submit your gift</span>
                            </li>
                            <li className="flex items-center gap-2">
                              {hasShippingAddress ? (
                                <span className="text-green-400">✓</span>
                              ) : (
                                <span className="text-slate-500">○</span>
                              )}
                              <span className={hasShippingAddress ? 'text-slate-300' : ''}>Add your shipping address</span>
                            </li>
                          </ul>
                        </div>
                      )}
                      
                      {canBeReady && currentParticipant.ready && (
                        <div className="bg-green-500/10 border-2 border-green-500/30 rounded-lg p-4 mb-4">
                          <p className="text-green-400 font-semibold">✓ You're all set! Waiting for the host to start the game.</p>
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
                        <p className="text-sm text-slate-300 mt-3">
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
          <p className="text-slate-300">
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

      {/* Developer Simulation Controls - Only visible when ?sim=true */}
      <SimulationControls socket={socket} partyId={partyId} />
    </div>
  );
}

