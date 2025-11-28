/**
 * Gift To Send Card Component
 * Shows a gift you need to send with winner's shipping address
 */
import { useState, useEffect } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../utils/firebase.js';
import { ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import { CheckIcon } from '@heroicons/react/24/solid';
import { CheckBadgeIcon } from '@heroicons/react/24/solid';

export function GiftToSendCard({ gift, winnerId, winnerName, userNames, userEmails, isSelfWin = false }) {
  const [address, setAddress] = useState(null);
  const [loadingAddress, setLoadingAddress] = useState(true);
  const [copied, setCopied] = useState(false);

  const formatAddressForCopy = (addr) => {
    if (!addr) return '';
    const parts = [
      addr.name,
      addr.street,
      addr.city && addr.state ? `${addr.city}, ${addr.state} ${addr.zip || ''}`.trim() : addr.city,
      addr.country,
    ].filter(Boolean);
    return parts.join('\n');
  };

  const [showToast, setShowToast] = useState(false);

  const handleCopyAddress = async () => {
    if (!address) return;
    const addressText = formatAddressForCopy(address);
    try {
      await navigator.clipboard.writeText(addressText);
      setCopied(true);
      setShowToast(true);
      setTimeout(() => {
        setCopied(false);
        setShowToast(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to copy address:', error);
    }
  };

  useEffect(() => {
    if (!winnerId) {
      setAddress(null);
      setLoadingAddress(false);
      return;
    }

    setLoadingAddress(true);
    
    // Subscribe to real-time updates for the winner's shipping address
    const unsubscribe = onSnapshot(
      doc(db, 'users', winnerId),
      (userDoc) => {
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setAddress(userData.shippingAddress || null);
        } else {
          setAddress(null);
        }
        setLoadingAddress(false);
      },
      (error) => {
        console.error('Error fetching address:', error);
        setAddress(null);
        setLoadingAddress(false);
      }
    );

    return () => unsubscribe();
  }, [winnerId]);

  return (
    <div className="bg-slate-900/50 border border-slate-700 rounded-2xl p-6 hover:border-slate-600 transition-all relative">
      {/* Toast Notification */}
      {showToast && (
        <div className="absolute top-4 right-4 bg-green-500/90 text-white px-4 py-2 rounded-lg shadow-lg z-10 animate-fade-in">
          Address Copied!
        </div>
      )}
      <div className="flex gap-6">
        {gift.image && (
          <img
            src={gift.image}
            alt={gift.title || 'Gift'}
            className="w-32 h-32 object-cover rounded-lg shadow-md"
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
        )}
        <div className="flex-1">
          <h3 className="text-white text-xl font-bold mb-2">{gift.title || 'Gift'}</h3>
          {gift.url && (
            <a
              href={gift.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-300 hover:text-white underline text-sm mb-4 inline-block"
            >
              View Gift Link ↗
            </a>
          )}
          
          {/* Winner Info */}
          {!isSelfWin && (
            <div className="mb-4">
              <p className="text-sm text-slate-300 mb-1">Winner:</p>
              <p className="text-lg font-semibold text-white">{winnerName}</p>
            </div>
          )}

          {/* Self-Win Success Message */}
          {isSelfWin ? (
            <div className="bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-sm rounded-lg p-6 mt-4 text-center">
              <CheckBadgeIcon className="w-12 h-12 mx-auto mb-2 text-emerald-400" />
              <p className="text-emerald-400 font-bold text-lg mb-2">You won your own gift!</p>
              <p className="text-slate-400">No shipping required. You get to keep it!</p>
            </div>
          ) : (
            /* Shipping Address */
            <div className="bg-black/30 border-2 border-dashed border-white/20 rounded-lg p-4 mt-4 relative">
              <p className="text-sm font-semibold text-slate-300 mb-2">📬 Shipping Address:</p>
              {loadingAddress ? (
                <p className="text-slate-500 text-sm font-mono">Loading address...</p>
              ) : address ? (
                <>
                  {address && (
                    <button
                      onClick={handleCopyAddress}
                      className="absolute top-2 right-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded p-1.5 transition-all"
                      title={copied ? "Address Copied!" : "Copy address"}
                    >
                      {copied ? (
                        <CheckIcon className="w-4 h-4 text-green-400" />
                      ) : (
                        <ClipboardDocumentIcon className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                  )}
                  <div className="text-sm font-mono text-slate-300 space-y-1 pr-8">
                    <p className="font-medium">{address.name || 'N/A'}</p>
                    {address.street && <p>{address.street}</p>}
                    {address.city && address.state && (
                      <p>
                        {address.city}, {address.state} {address.zip || ''}
                      </p>
                    )}
                    {address.country && <p>{address.country}</p>}
                  </div>
                </>
              ) : (
                <p className="text-sm text-orange-400 italic font-mono">
                  ⏳ Winner hasn't provided their shipping address yet. They'll add it soon!
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

