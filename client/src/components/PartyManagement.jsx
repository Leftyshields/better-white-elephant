/**
 * Party Management Component - Admin only
 */
import { useState, useEffect } from 'react';
import { Button } from './ui/Button.jsx';
import { Input } from './ui/Input.jsx';
import { Modal } from './ui/Modal.jsx';
import { doc, updateDoc, deleteDoc, collection, query, where, getDocs, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../utils/firebase.js';
import { useAuth } from '../hooks/useAuth.js';
import { apiRequest } from '../utils/api.js';

export function PartyManagement({ party, participants, pendingInvites = [] }) {
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState('settings');
  const [editingTitle, setEditingTitle] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [editingDate, setEditingDate] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [editingConfig, setEditingConfig] = useState(false);
  const [maxSteals, setMaxSteals] = useState(party?.config?.maxSteals ?? 3);
  const [returnToStart, setReturnToStart] = useState(party?.config?.returnToStart ?? false);
  const [priceLimit, setPriceLimit] = useState(party?.config?.priceLimit ?? '');
  const [userNames, setUserNames] = useState({});
  const [userEmails, setUserEmails] = useState({});
  const [showAddPeople, setShowAddPeople] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const [newPersonEmail, setNewPersonEmail] = useState('');
  const [sendingInvites, setSendingInvites] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelConfirmationText, setCancelConfirmationText] = useState('');
  
  // Update local state when party changes
  useEffect(() => {
    if (party?.config) {
      setMaxSteals(party.config.maxSteals ?? 3);
      setReturnToStart(party.config.returnToStart ?? false);
      setPriceLimit(party.config.priceLimit ?? '');
    }
  }, [party]);

  // Fetch user names and emails for participants
  useEffect(() => {
    const fetchUserInfo = async () => {
      if (participants.length === 0) {
        setUserNames({});
        setUserEmails({});
        return;
      }

      try {
        // Fetch user names from server (uses Firebase Admin SDK)
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
        console.error('Error fetching user names:', error);
        // Fallback to participant IDs
        const names = {};
        participants.forEach(p => {
          names[p.id] = p.id;
        });
        setUserNames(names);
        setUserEmails({});
      }
    };

    fetchUserInfo();
  }, [participants]);

  const handleUpdateTitle = async () => {
    try {
      await updateDoc(doc(db, 'parties', party.id), {
        title: newTitle.trim() || null,
        updatedAt: new Date(),
      });
      setEditingTitle(false);
      setNewTitle('');
    } catch (error) {
      console.error('Error updating title:', error);
      alert('Failed to update title: ' + error.message);
    }
  };

  const handleUpdateDate = async () => {
    try {
      await updateDoc(doc(db, 'parties', party.id), {
        date: new Date(newDate),
        updatedAt: new Date(),
      });
      setEditingDate(false);
      setNewDate('');
    } catch (error) {
      console.error('Error updating date:', error);
      alert('Failed to update date: ' + error.message);
    }
  };

  const handleUpdateConfig = async () => {
    try {
      await updateDoc(doc(db, 'parties', party.id), {
        config: {
          maxSteals: parseInt(maxSteals) || 3,
          returnToStart: returnToStart,
          priceLimit: priceLimit ? parseFloat(priceLimit) : null,
        },
        updatedAt: new Date(),
      });
      setEditingConfig(false);
    } catch (error) {
      console.error('Error updating config:', error);
      alert('Failed to update settings: ' + error.message);
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
      await deleteDoc(doc(db, 'parties', party.id, 'participants', participantId));
      // Also delete their gift if they have one
      const giftsSnapshot = await getDocs(
        query(
          collection(db, 'gifts'),
          where('partyId', '==', party.id),
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

  const handleUpdateParticipantStatus = async (participantId, newStatus) => {
    try {
      await updateDoc(doc(db, 'parties', party.id, 'participants', participantId), {
        status: newStatus,
        updatedAt: new Date(),
      });
    } catch (error) {
      console.error('Error updating participant:', error);
      alert('Failed to update participant: ' + error.message);
    }
  };

  const handleAddPerson = async () => {
    if (!newPersonEmail.trim() || !newPersonEmail.includes('@')) {
      alert('Please enter a valid email address');
      return;
    }

    const emailLower = newPersonEmail.trim().toLowerCase();
    const inviteId = emailLower.replace(/[^a-z0-9]/g, '_');
    const name = newPersonName.trim() || null;

    try {
      // Add/update them directly as GOING status (they'll appear in participants list)
      // Use merge: true so if they already exist, we just update their status to GOING
      await setDoc(
        doc(db, 'parties', party.id, 'pendingInvites', inviteId),
        {
          email: emailLower,
          name: name,
          status: 'GOING', // Always set to GOING
          addedAt: new Date(),
          updatedAt: new Date(),
        },
        { merge: true }
      );

      // Try to send email, but don't worry if it fails
      try {
        const functionUrl =
          import.meta.env.VITE_FUNCTIONS_URL ||
          'https://us-central1-better-white-elephant.cloudfunctions.net/sendPartyInvite';

        const hostName = user?.displayName || user?.email?.split('@')[0] || 'Someone';

        await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: emailLower,
            partyId: party.id,
            hostName,
          }),
        });
        // Don't care about response - just try to send
      } catch (emailError) {
        // Silently fail - user said they'll fix email later
        console.log('Email sending failed, but person added:', emailError);
      }

      setNewPersonName('');
      setNewPersonEmail('');
      setShowAddPeople(false);
    } catch (error) {
      console.error('Error adding person:', error);
      alert('Failed to add person: ' + error.message);
    }
  };

  const handleRemovePendingInvite = async (inviteId) => {
    if (!confirm('Remove this person from the invite list?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'parties', party.id, 'pendingInvites', inviteId));
    } catch (error) {
      console.error('Error removing invite:', error);
      alert('Failed to remove: ' + error.message);
    }
  };

  const handleCancelParty = () => {
    // First confirmation: show confirmation modal
    setShowCancelConfirm(true);
    setCancelConfirmationText('');
  };

  const handleConfirmCancelParty = async () => {
    // Second confirmation: require typing party title
    const expectedText = party?.title || 'CANCEL';
    if (cancelConfirmationText !== expectedText) {
      alert(`Please type "${expectedText}" to confirm cancellation.`);
      return;
    }

    try {
      // Update party status to CANCELLED
      await updateDoc(doc(db, 'parties', party.id), {
        status: 'CANCELLED',
        updatedAt: new Date(),
      });

      // Close modals and navigate away
      setShowCancelConfirm(false);
      setShowModal(false);
      alert('Party has been cancelled.');
      
      // Reload page to reflect cancelled status
      window.location.href = '/';
    } catch (error) {
      console.error('Error cancelling party:', error);
      alert('Failed to cancel party: ' + error.message);
    }
  };

  const handleSendInvitesToAll = async () => {
    const pendingList = pendingInvites.filter((inv) => inv.status === 'PENDING');
    
    if (pendingList.length === 0) {
      alert('No pending invites to send');
      return;
    }

    setSendingInvites(true);
    try {
      const functionUrl =
        import.meta.env.VITE_FUNCTIONS_URL ||
        'https://us-central1-better-white-elephant.cloudfunctions.net/sendPartyInvite';

      const hostName = user?.displayName || user?.email?.split('@')[0] || 'Someone';

      let successCount = 0;
      let failedList = [];

      for (const invite of pendingList) {
        try {
          const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: invite.email,
              partyId: party.id,
              hostName,
            }),
          });

          if (response.ok) {
            // Keep as PENDING, email was sent
            await updateDoc(
              doc(db, 'parties', party.id, 'pendingInvites', invite.id),
              {
                sentAt: new Date(),
                updatedAt: new Date(),
              }
            );
            successCount++;
          } else {
            // Email failed, but they can still use share link
            failedList.push(invite);
            await updateDoc(
              doc(db, 'parties', party.id, 'pendingInvites', invite.id),
              {
                emailFailed: true,
                updatedAt: new Date(),
              }
            );
          }
        } catch (error) {
          console.error(`Error sending invite to ${invite.email}:`, error);
          // Email failed, but they can still use share link
          failedList.push(invite);
          
          try {
            await updateDoc(
              doc(db, 'parties', party.id, 'pendingInvites', invite.id),
              {
                emailFailed: true,
                updatedAt: new Date(),
              }
            );
          } catch (updateError) {
            console.error('Error updating invite status:', updateError);
          }
        }
      }

      if (pendingList.length > 0) {
        const message = successCount > 0 
          ? `Invites sent! ${successCount} emails sent successfully.`
          : 'Email sending had issues, but all invitees can join via the share link.';
        
        if (failedList.length > 0) {
          alert(`${message}\n\n${failedList.length} email(s) failed, but those people can still join using the share link. Just share the party link with them!`);
        } else {
          alert(message);
        }
      }
    } catch (error) {
      console.error('Error sending invites:', error);
      alert('Error sending invites: ' + error.message);
    } finally {
      setSendingInvites(false);
    }
  };

  const handleOverrideStatus = async (inviteId, newStatus) => {
    try {
      await updateDoc(
        doc(db, 'parties', party.id, 'pendingInvites', inviteId),
        {
          status: newStatus,
          updatedAt: new Date(),
        }
      );
    } catch (error) {
      console.error('Error updating invite status:', error);
      alert('Failed to update status: ' + error.message);
    }
  };

  const formatDateForInput = (dateValue) => {
    if (!dateValue) return '';
    try {
      const d = dateValue?.toDate ? dateValue.toDate() : new Date(dateValue);
      if (isNaN(d.getTime())) return '';
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch (e) {
      return '';
    }
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setShowModal(true)}>
        Manage Party
      </Button>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Party Management"
        className="max-w-3xl"
      >
        {/* Tab Navigation */}
        <div className="bg-slate-900/50 p-1 rounded-lg border border-white/10 mb-6">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-4 py-2 rounded-md transition-colors ${
                activeTab === 'settings'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Settings
            </button>
            <button
              onClick={() => setActiveTab('guests')}
              className={`px-4 py-2 rounded-md transition-colors ${
                activeTab === 'guests'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Guests
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* Party Title */}
            <div className="border-b border-white/10 pb-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold text-white">Party Title</h3>
              {!editingTitle && (
                <Button variant="secondary" onClick={() => {
                  setEditingTitle(true);
                  setNewTitle(party.title || '');
                }}>
                  Edit
                </Button>
              )}
            </div>
            {editingTitle ? (
              <div className="space-y-2">
                <Input
                  type="text"
                  placeholder="e.g., Family Christmas Exchange 2025"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 focus:border-purple-500"
                />
                <div className="flex gap-2">
                  <Button onClick={handleUpdateTitle}>Save</Button>
                  <Button variant="secondary" onClick={() => {
                    setEditingTitle(false);
                    setNewTitle('');
                  }}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-slate-300">
                {party.title || 'No title set'}
              </p>
            )}
          </div>

          {/* Party Date */}
          <div className="border-b border-white/10 pb-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold text-white">Party Date</h3>
              {!editingDate && (
                <Button variant="secondary" onClick={() => {
                  setEditingDate(true);
                  setNewDate(formatDateForInput(party.date));
                }}>
                  Edit
                </Button>
              )}
            </div>
            {editingDate ? (
              <div className="space-y-2">
                <Input
                  type="datetime-local"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 focus:border-purple-500"
                />
                <div className="flex gap-2">
                  <Button onClick={handleUpdateDate}>Save</Button>
                  <Button variant="secondary" onClick={() => {
                    setEditingDate(false);
                    setNewDate('');
                  }}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-slate-300">
                {party.date?.toDate ? party.date.toDate().toLocaleString() : 'Not set'}
              </p>
            )}
          </div>

          {/* Game Configuration */}
          <div className="border-b border-white/10 pb-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold text-white">Game Settings</h3>
              {!editingConfig && (
                <Button variant="secondary" onClick={() => setEditingConfig(true)}>
                  Edit
                </Button>
              )}
            </div>
            {editingConfig ? (
              <div className="space-y-4">
                <Input
                  type="number"
                  label="Max Steals"
                  value={maxSteals}
                  onChange={(e) => setMaxSteals(e.target.value)}
                  min="1"
                  className="bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 focus:border-purple-500"
                />
                <Input
                  type="number"
                  label="Price Limit (optional)"
                  placeholder="e.g., 25.00"
                  value={priceLimit}
                  onChange={(e) => setPriceLimit(e.target.value)}
                  min="0"
                  step="0.01"
                  className="bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 focus:border-purple-500"
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
                  <Button onClick={handleUpdateConfig}>Save</Button>
                  <Button variant="secondary" onClick={() => {
                    setEditingConfig(false);
                    setMaxSteals(party?.config?.maxSteals || 3);
                    setReturnToStart(party?.config?.returnToStart || false);
                    setPriceLimit(party?.config?.priceLimit ?? '');
                  }}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-slate-300 space-y-1">
                <p>Max Steals: {party?.config?.maxSteals || 3}</p>
                {party?.config?.priceLimit && (
                  <p>Price Limit: ${parseFloat(party.config.priceLimit).toFixed(2)}</p>
                )}
                <p>Boomerang Rule: {party?.config?.returnToStart ? 'Enabled' : 'Disabled'}</p>
              </div>
            )}
          </div>

          {/* Cancel Party Section - Danger Zone */}
          <div className="border border-red-900/30 bg-red-900/10 rounded-lg p-4 mt-6">
            <h3 className="text-red-400 text-xs uppercase font-semibold mb-2">Danger Zone</h3>
            <p className="text-slate-300 text-sm mb-4">
              This will permanently cancel the party. This action cannot be undone. All participants will lose access to this party.
            </p>
            <Button
              variant="danger"
              onClick={handleCancelParty}
              className="w-auto px-4"
            >
              Cancel Party
            </Button>
          </div>
          </div>
        )}

        {activeTab === 'guests' && (
          <div className="space-y-6">
          {/* Add People Section */}
          <div className="border-b border-white/10 pb-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold text-white">Add People</h3>
              {!showAddPeople && (
                <Button variant="secondary" onClick={() => setShowAddPeople(true)}>
                  Add Person
                </Button>
              )}
            </div>
            {showAddPeople ? (
              <div className="space-y-3">
                <Input
                  type="text"
                  label="Name (optional)"
                  placeholder="John Doe"
                  value={newPersonName}
                  onChange={(e) => setNewPersonName(e.target.value)}
                  className="bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 focus:border-purple-500"
                />
                <div className="flex gap-2">
                  <Input
                    type="email"
                    label="Email"
                    placeholder="friend@example.com"
                    value={newPersonEmail}
                    onChange={(e) => setNewPersonEmail(e.target.value)}
                    className="flex-1 bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 focus:border-purple-500"
                  />
                  <div className="flex items-end gap-2">
                    <Button
                      onClick={handleAddPerson}
                      disabled={!newPersonEmail.trim() || !newPersonEmail.includes('@')}
                    >
                      Add
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
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                Add people by name and email. They'll be added to the participants list and an invite email will be sent automatically.
              </p>
            )}
          </div>

          {/* Participants Management */}
          <div>
            <h3 className="font-semibold mb-3 text-white">
              Participants ({
                participants.length + 
                pendingInvites.filter(inv => inv.status !== 'ACCEPTED').length
              })
            </h3>
            <p className="text-xs text-slate-400 mb-3">
              Includes signed-up users and pending invites. Change status below to manage who's going.
            </p>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {/* Actual participants (signed up users) */}
              {participants.map((participant) => {
                const isAdmin = participant.id === party?.adminId;
                return (
                <div
                  key={participant.id}
                  className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                    <p className="font-medium text-white break-words">
                      {userNames[participant.id] && userNames[participant.id] !== participant.id
                        ? userNames[participant.id]
                        : `User ${participant.id.slice(0, 8)}...`}
                    </p>
                        {isAdmin && (
                          <span className="text-xs bg-indigo-600/30 text-indigo-300 px-2 py-1 rounded border border-indigo-500/30">
                            Host
                          </span>
                        )}
                      </div>
                    {userNames[participant.id] === participant.id && (
                      <p className="text-xs text-slate-400 mt-1 break-all">ID: {participant.id}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <select
                        value={participant.status || 'PENDING'}
                        onChange={(e) => handleUpdateParticipantStatus(participant.id, e.target.value)}
                          className="text-sm border border-slate-700 rounded px-2 py-1 text-white bg-slate-950"
                          disabled={isAdmin}
                      >
                        <option value="PENDING">PENDING</option>
                        <option value="GOING">GOING</option>
                      </select>
                      {participant.turnNumber !== null && (
                        <span className="text-sm text-slate-400">
                          Turn #{participant.turnNumber}
                        </span>
                      )}
                    </div>
                  </div>
                    {!isAdmin ? (
                  <Button
                    variant="danger"
                    onClick={() => handleRemoveParticipant(participant.id)}
                    className="ml-2"
                  >
                    Remove
                  </Button>
                    ) : (
                      <span className="text-xs text-slate-400 ml-2 italic">Cannot remove host</span>
                    )}
                </div>
                );
              })}
              {/* All pending invites - show in participants list so they can be managed */}
              {pendingInvites
                .filter(inv => {
                  // Don't show if already accepted
                  if (inv.status === 'ACCEPTED') return false;
                  
                  // Don't show if there's a participant with matching userId
                  if (inv.userId && participants.some(p => p.id === inv.userId)) return false;
                  
                  // Don't show if there's a participant with matching email
                  const inviteEmail = inv.email?.toLowerCase();
                  if (inviteEmail) {
                    const participantEmails = Object.values(userEmails).map(e => e?.toLowerCase());
                    if (participantEmails.includes(inviteEmail)) return false;
                  }
                  
                  return true;
                })
                .map((invite) => (
                  <div
                    key={invite.id}
                    className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-white break-words">
                        {invite.name || invite.email}
                      </p>
                      {invite.email && invite.name && (
                        <p className="text-xs text-slate-400 mt-1 break-all">{invite.email}</p>
                      )}
                      {invite.emailFailed && (
                        <p className="text-xs text-orange-400 mt-1">Email failed - use share link</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <select
                          value={invite.status || 'PENDING'}
                          onChange={(e) => handleOverrideStatus(invite.id, e.target.value)}
                          className="text-sm border border-slate-700 rounded px-2 py-1 text-white bg-slate-950"
                        >
                          <option value="PENDING">PENDING</option>
                          <option value="GOING">GOING</option>
                        </select>
                        <span className="text-xs text-slate-400 italic">Pending sign-up</span>
                      </div>
                    </div>
                    <Button
                      variant="danger"
                      onClick={() => handleRemovePendingInvite(invite.id)}
                      className="ml-2"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
            </div>
          </div>
          </div>
        )}
      </Modal>

      {/* Cancel Party Confirmation Modal */}
      <Modal
        isOpen={showCancelConfirm}
        onClose={() => {
          setShowCancelConfirm(false);
          setCancelConfirmationText('');
        }}
        title="⚠️ Confirm Party Cancellation"
        className="max-w-lg"
      >
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800 font-semibold mb-2">
              Are you absolutely sure you want to cancel this party?
            </p>
            <ul className="text-sm text-red-700 space-y-1 list-disc list-inside">
              <li>This action cannot be undone</li>
              <li>All participants will lose access</li>
              <li>The party will be marked as cancelled</li>
            </ul>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              To confirm, please type the party title:
              <span className="font-bold text-gray-900 ml-1">
                "{party?.title || 'CANCEL'}"
              </span>
            </label>
            <Input
              type="text"
              value={cancelConfirmationText}
              onChange={(e) => setCancelConfirmationText(e.target.value)}
              placeholder={party?.title || 'CANCEL'}
              className="w-full"
            />
          </div>

          <div className="flex gap-3 justify-end pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setShowCancelConfirm(false);
                setCancelConfirmationText('');
              }}
            >
              No, Keep Party
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmCancelParty}
              disabled={cancelConfirmationText !== (party?.title || 'CANCEL')}
            >
              Yes, Cancel Party
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

