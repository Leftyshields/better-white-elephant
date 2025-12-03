/**
 * Party Invite Landing Component
 * Shows a beautiful "ticket stub" UI for unauthenticated users or users not yet joined
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { Button } from './ui/Button.jsx';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../utils/firebase.js';
import { trackParticipantJoin, trackError } from '../utils/analytics.js';
import { GiftIcon } from '@heroicons/react/24/outline';

export function PartyInviteLanding({ partyId }) {
  const { user, signInWithGoogle, loading: authLoading } = useAuth();
  const [partyInfo, setPartyInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [hostName, setHostName] = useState(null);

  // Fetch public party info
  useEffect(() => {
    const fetchPartyInfo = async () => {
      if (!partyId) return;
      
      setLoading(true);
      try {
        const partyDoc = await getDoc(doc(db, 'parties', partyId));
        if (partyDoc.exists()) {
          const data = partyDoc.data();
          setPartyInfo({
            title: data.title || 'White Elephant Party',
            date: data.date?.toDate?.() || data.date,
            adminId: data.adminId,
          });

          // Fetch host name if we have adminId
          // Note: User profile read requires authentication, so we'll try but fallback gracefully
          if (data.adminId) {
            try {
              const hostDoc = await getDoc(doc(db, 'users', data.adminId));
              if (hostDoc.exists()) {
                const hostData = hostDoc.data();
                // Only use displayName/email if available, don't access shippingAddress
                setHostName(hostData.displayName || hostData.email || 'Party Host');
              } else {
                setHostName('Party Host');
              }
            } catch (error) {
              // If permission denied or other error, just use default
              console.warn('Could not fetch host name (may require auth):', error.message);
              setHostName('Party Host');
            }
          }
        } else {
          setPartyInfo(null);
        }
      } catch (error) {
        console.error('Error fetching party info:', error);
        setPartyInfo(null);
      } finally {
        setLoading(false);
      }
    };

    fetchPartyInfo();
  }, [partyId]);

  // Check if user is already a participant
  useEffect(() => {
    const checkParticipant = async () => {
      if (!user || !partyId || !partyInfo) return;

      try {
        const participantRef = doc(db, 'parties', partyId, 'participants', user.uid);
        const participantDoc = await getDoc(participantRef);
        
        if (!participantDoc.exists()) {
          // User is logged in but not a participant - they can join
          // This will be handled by the join button
        }
      } catch (error) {
        console.error('Error checking participant:', error);
      }
    };

    checkParticipant();
  }, [user, partyId, partyInfo]);

  const handleJoin = async () => {
    if (!user) {
      // Not authenticated - trigger sign in
      window.sessionStorage.setItem('redirectAfterAuth', `/party/${partyId}`);
      const result = await signInWithGoogle();
      if (result.success) {
        // After sign in, the component will re-render and we can join
        window.location.reload();
      }
      return;
    }

    // User is authenticated - join the party
    setJoining(true);
    try {
      // Add user as participant
      // Note: We don't check for pending invites here because that requires admin permissions
      // The server or admin can handle invite acceptance separately if needed
      const participantRef = doc(db, 'parties', partyId, 'participants', user.uid);
      await setDoc(participantRef, {
        status: 'GOING',
        turnNumber: null,
        ready: false,
        joinedAt: new Date(),
        updatedAt: new Date(),
      });

      // Track join via share link (most common case for invite landing)
      trackParticipantJoin(partyId, 'share_link');

      // Reload to show the lobby
      window.location.reload();
    } catch (error) {
      console.error('Error joining party:', error);
      console.error('Error details:', {
        code: error.code,
        message: error.message,
        partyId,
        userId: user?.uid
      });
      trackError('join_party_failed', error.message, 'PartyInviteLanding');
      alert('Failed to join party: ' + error.message);
      setJoining(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900 via-slate-900 to-black">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mb-4"></div>
          <p className="text-white">Loading invitation...</p>
        </div>
      </div>
    );
  }

  if (!partyInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900 via-slate-900 to-black py-12">
        <div className="max-w-md w-full bg-slate-900/60 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl p-8 text-center">
          <h2 className="text-2xl font-bold mb-4 text-white">Party Not Found</h2>
          <p className="text-slate-400 mb-6">
            The party you're looking for doesn't exist or may have been deleted.
          </p>
          <Button
            onClick={() => window.location.href = '/'}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white"
          >
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  const formatDate = (date) => {
    if (!date) return 'Date TBD';
    if (date instanceof Date) {
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
    return 'Date TBD';
  };

  return (
    <>
      {/* Snow Animation Layers - Fixed to viewport */}
      <div className="fixed inset-0 overflow-visible pointer-events-none z-[5]">
        {/* Layer 1: Fastest, most visible */}
        {[...Array(50)].map((_, i) => {
          const randomDelay = Math.random() * 1;
          const randomTop = Math.random() * 120 - 20;
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
          const randomDelay = Math.random() * 1;
          const randomTop = Math.random() * 120 - 20;
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
          const randomDelay = Math.random() * 1;
          const randomTop = Math.random() * 120 - 20;
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

      <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900 via-slate-900 to-black py-12 px-4 relative z-10">
        <div className="max-w-md w-full">
        {/* Ticket Stub Card */}
        <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl p-8 md:p-10 text-center relative overflow-hidden">
          {/* Decorative gradient overlay */}
          <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-purple-500/20 to-transparent pointer-events-none"></div>
          
          {/* Gift Icon */}
          <div className="relative z-10 mb-6">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-purple-500/30 to-indigo-500/30 border border-purple-400/50 shadow-lg shadow-purple-500/20">
              <GiftIcon className="w-10 h-10 text-purple-300" />
            </div>
          </div>

          {/* Header */}
          <h1 className="text-3xl md:text-4xl font-bold mb-2 text-white relative z-10">
            You're Invited!
          </h1>
          <p className="text-slate-400 mb-8 relative z-10">
            Join the White Elephant gift exchange
          </p>

          {/* Party Details */}
          <div className="space-y-4 mb-8 relative z-10">
            <div className="bg-slate-950/50 border border-white/5 rounded-lg p-4">
              <p className="text-sm text-slate-400 mb-1">Host</p>
              <p className="text-lg font-semibold text-white">{hostName || 'Party Host'}</p>
            </div>
            
            <div className="bg-slate-950/50 border border-white/5 rounded-lg p-4">
              <p className="text-sm text-slate-400 mb-1">Party</p>
              <p className="text-lg font-semibold text-white">{partyInfo.title}</p>
            </div>
            
            <div className="bg-slate-950/50 border border-white/5 rounded-lg p-4">
              <p className="text-sm text-slate-400 mb-1">Date</p>
              <p className="text-lg font-semibold text-white">{formatDate(partyInfo.date)}</p>
            </div>
          </div>

          {/* Action Button */}
          <Button
            onClick={handleJoin}
            disabled={joining}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-purple-500/20 hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 text-lg py-3 font-semibold"
          >
            {joining ? 'Joining...' : user ? 'RSVP Now' : 'Join the Fun'}
          </Button>

          {!user && (
            <p className="text-xs text-slate-500 mt-4 relative z-10">
              You'll be able to choose which account to use
            </p>
          )}
        </div>
      </div>
    </div>
    </>
  );
}

