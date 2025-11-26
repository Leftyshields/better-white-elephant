/**
 * Add Participants Component - Simplified onboarding
 * Allows admin to add a list of emails, then send invites
 */
import { useState, useEffect } from 'react';
import { Button } from './ui/Button.jsx';
import { Input } from './ui/Input.jsx';
import { Modal } from './ui/Modal.jsx';
import { collection, doc, setDoc, query, where, getDocs, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../utils/firebase.js';
import { useAuth } from '../hooks/useAuth.js';

export function AddParticipants({ partyId, onUpdate }) {
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pendingInvites, setPendingInvites] = useState([]);
  const [loading, setLoading] = useState(false);

  // Load existing pending invites when modal opens
  useEffect(() => {
    const loadPendingInvites = async () => {
      if (!showModal) return;
      
      try {
        const invitesSnapshot = await getDocs(
          collection(db, 'parties', partyId, 'pendingInvites')
        );
        const invites = invitesSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setPendingInvites(invites);
      } catch (error) {
        console.error('Error loading pending invites:', error);
      }
    };
    
    loadPendingInvites();
  }, [showModal, partyId]);

  const handleAddPerson = async () => {
    if (!email.trim() || !email.includes('@')) {
      alert('Please enter a valid email address');
      return;
    }

    const emailLower = email.trim().toLowerCase();
    const inviteId = emailLower.replace(/[^a-z0-9]/g, '_');

    // Check if email already exists
    const existingInvite = pendingInvites.find((inv) => inv.email === emailLower);
    if (existingInvite) {
      alert('This email is already in the list');
      return;
    }

    // Add to local state
    const newInvite = {
      id: inviteId,
      email: emailLower,
      name: name.trim() || null,
      status: 'PENDING',
      addedAt: new Date(),
    };

    setPendingInvites((prev) => [...prev, newInvite]);
    
    // Save to Firestore immediately
    try {
      await setDoc(
        doc(db, 'parties', partyId, 'pendingInvites', inviteId),
        {
          email: emailLower,
          name: name.trim() || null,
          status: 'PENDING',
          addedAt: new Date(),
          updatedAt: new Date(),
        },
        { merge: true }
      );
    } catch (error) {
      console.error('Error saving invite:', error);
      alert('Failed to add person: ' + error.message);
      // Remove from local state if save failed
      setPendingInvites((prev) => prev.filter((inv) => inv.id !== inviteId));
      return;
    }

    // Clear form
    setName('');
    setEmail('');
    onUpdate?.();
  };

  const handleRemoveInvite = async (inviteId) => {
    try {
      // Remove from Firestore
      await deleteDoc(doc(db, 'parties', partyId, 'pendingInvites', inviteId));
      // Remove from local state
      setPendingInvites((prev) => prev.filter((inv) => inv.id !== inviteId));
      onUpdate?.();
    } catch (error) {
      console.error('Error removing invite:', error);
      alert('Failed to remove: ' + error.message);
    }
  };


  const handleSendInvites = async () => {
    if (pendingInvites.length === 0) {
      alert('No emails to send invites to');
      return;
    }

    setLoading(true);
    try {
      const functionUrl =
        import.meta.env.VITE_FUNCTIONS_URL ||
        'https://us-central1-better-white-elephant.cloudfunctions.net/sendPartyInvite';

      const hostName = user?.displayName || user?.email?.split('@')[0] || 'Someone';

      let successCount = 0;
      let errorCount = 0;

      // Send invite to each email
      for (const invite of pendingInvites) {
        try {
          const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: invite.email,
              partyId,
              hostName,
            }),
          });

          if (response.ok) {
            // Update status to SENT
            await updateDoc(
              doc(db, 'parties', partyId, 'pendingInvites', invite.id),
              {
                status: 'SENT',
                sentAt: new Date(),
                updatedAt: new Date(),
              }
            );
            successCount++;
          } else {
            errorCount++;
          }
        } catch (error) {
          console.error(`Error sending invite to ${invite.email}:`, error);
          errorCount++;
        }
      }

      if (successCount > 0) {
        alert(`Invites sent! ${successCount} successful${errorCount > 0 ? `, ${errorCount} failed` : ''}`);
        // Refresh the list
        const invitesSnapshot = await getDocs(
          collection(db, 'parties', partyId, 'pendingInvites')
        );
        const invites = invitesSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setPendingInvites(invites);
      } else {
        alert('Failed to send invites. Please try again.');
      }
    } catch (error) {
      console.error('Error sending invites:', error);
      alert('Error sending invites: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setShowModal(true)}>
        Add People
      </Button>

      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEmailInput('');
        }}
        title="Add People to Party"
        className="max-w-2xl"
      >
        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-600 mb-4">
              Add people to your party. You can add multiple people, then send invites to all at once.
            </p>
            <div className="space-y-3">
              <Input
                type="text"
                label="Name (optional)"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <div className="flex gap-2">
                <Input
                  type="email"
                  label="Email"
                  placeholder="friend@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="flex-1"
                />
                <div className="flex items-end">
                  <Button 
                    onClick={handleAddPerson} 
                    disabled={!email.trim() || !email.includes('@')}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {pendingInvites.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">
                People to Invite ({pendingInvites.length})
              </h3>
              <div className="space-y-2 max-h-60 overflow-y-auto border border-gray-200 rounded p-3">
                {pendingInvites.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded"
                  >
                    <div className="flex-1">
                      {invite.name && (
                        <p className="text-sm font-medium text-gray-900">{invite.name}</p>
                      )}
                      <p className="text-sm text-gray-600">{invite.email}</p>
                    </div>
                    <Button
                      variant="danger"
                      onClick={() => handleRemoveInvite(invite.id)}
                      className="text-xs px-2 py-1 ml-2"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <Button 
                  onClick={handleSendInvites} 
                  disabled={loading || pendingInvites.length === 0} 
                  variant="primary"
                  className="w-full"
                >
                  {loading ? 'Sending...' : `Send Invites to All (${pendingInvites.length})`}
                </Button>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setShowModal(false);
                setName('');
                setEmail('');
              }}
            >
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

