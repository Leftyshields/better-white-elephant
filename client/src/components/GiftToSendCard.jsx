/**
 * Gift To Send Card Component
 * Shows a gift you need to send with winner's shipping address
 */
import { useState, useEffect } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../utils/firebase.js';

export function GiftToSendCard({ gift, winnerId, winnerName, userNames, userEmails }) {
  const [address, setAddress] = useState(null);
  const [loadingAddress, setLoadingAddress] = useState(true);

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
    <div className="bg-gradient-to-br from-orange-50 to-pink-50 rounded-xl shadow-lg p-6 border-2 border-orange-200 hover:shadow-xl transition-shadow">
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
          <h3 className="text-xl font-bold text-gray-900 mb-2">{gift.title || 'Gift'}</h3>
          {gift.url && (
            <a
              href={gift.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline text-sm mb-4 inline-block"
            >
              View Gift Link ↗
            </a>
          )}
          
          {/* Winner Info */}
          <div className="mb-4">
            <p className="text-sm text-gray-600 mb-1">Winner:</p>
            <p className="text-lg font-semibold text-gray-900">{winnerName}</p>
          </div>

          {/* Shipping Address */}
          <div className="bg-white rounded-lg p-4 border-2 border-orange-300">
            <p className="text-sm font-semibold text-gray-700 mb-2">📬 Shipping Address:</p>
            {loadingAddress ? (
              <p className="text-gray-500 text-sm">Loading address...</p>
            ) : address ? (
              <div className="text-sm text-gray-700 space-y-1">
                <p className="font-medium">{address.name || 'N/A'}</p>
                {address.street && <p>{address.street}</p>}
                {address.city && address.state && (
                  <p>
                    {address.city}, {address.state} {address.zip || ''}
                  </p>
                )}
                {address.country && <p>{address.country}</p>}
              </div>
            ) : (
              <p className="text-sm text-orange-600 italic">
                ⏳ Winner hasn't provided their shipping address yet. They'll add it soon!
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

