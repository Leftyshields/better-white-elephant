/**
 * Host step 4 / Guest step 2: shipping address (Profile storage).
 */
import { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../../utils/firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { Input } from '../ui/Input.jsx';
import { Button } from '../ui/Button.jsx';
import {
  formatLobbySetupString,
  LOBBY_SETUP_STRINGS,
} from '../../copy/lobbySetupStrings.js';
import { SHIPPING_ADDRESS_INCOMPLETE_PROFILE } from '../../utils/shippingAddressCopy.js';
import {
  areAllShippingFieldsEmpty,
  isAddressStepDone,
  LOBBY_STEP_STATUS,
} from './lobbyStepUtils.js';
import {
  hasCompleteShippingFields,
  trimShippingAddress,
} from '../../utils/shippingAddressFields.js';
const touchClass = 'min-h-11';

export function ShippingAddressStep({
  stepStatus,
  headingId,
  savedAddress,
  isEditing,
  onRequestEdit,
  onSaved,
  onCleared,
  onAdvanceNext,
  showMissingForReady,
  onClearMissingForReady,
}) {
  const { user } = useAuth();
  const [address, setAddress] = useState({
    name: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    country: '',
  });
  const [loadState, setLoadState] = useState('loading');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [showIncompleteError, setShowIncompleteError] = useState(false);
  const [hadPrefillFromProfile, setHadPrefillFromProfile] = useState(false);

  const reloadAddress = async () => {
    if (!user?.uid) {
      setLoadState('idle');
      return;
    }
    setLoadState('loading');
    setSaveError('');
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (userData.shippingAddress) {
          setAddress((prev) => ({ ...prev, ...userData.shippingAddress }));
          setHadPrefillFromProfile(isAddressStepDone(userData.shippingAddress));
        }
      }
      setLoadState('ready');
    } catch (error) {
      console.error('Error loading lobby address:', { code: error.code, name: error.name });
      setLoadState('error');
    }
  };

  useEffect(() => {
    reloadAddress();
  }, [user?.uid]);

  const done = isAddressStepDone(savedAddress);
  const showForm =
    stepStatus === LOBBY_STEP_STATUS.ACTIVE || isEditing || (!done && stepStatus !== LOBBY_STEP_STATUS.LOCKED);

  const updateAddressField = (partial) => {
    setShowIncompleteError(false);
    setSaveError('');
    onClearMissingForReady?.();
    setAddress((prev) => ({ ...prev, ...partial }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!user?.uid) return;

    const allEmpty = areAllShippingFieldsEmpty(address);
    if (allEmpty && savedAddress) {
      setSaving(true);
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          shippingAddress: deleteField(),
          shippingAddressSenderShareConsentAt: deleteField(),
          updatedAt: new Date(),
        });
        onCleared?.();
        onSaved?.(null);
        setHadPrefillFromProfile(false);
      } catch (error) {
        console.error('Error clearing lobby address:', { code: error.code, name: error.name });
        setSaveError("We couldn't save your address. Try again.");
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!hasCompleteShippingFields(address)) {
      setShowIncompleteError(true);
      return;
    }

    const trimmedAddress = trimShippingAddress(address);
    setSaving(true);
    setSaveError('');

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        shippingAddress: trimmedAddress,
        shippingAddressSenderShareConsentAt: new Date(),
        updatedAt: new Date(),
      });
      const stillValid = hasCompleteShippingFields(trimmedAddress);
      if (!stillValid) {
        onCleared?.();
      }
      onSaved?.(stillValid ? trimmedAddress : null);
      if (stillValid) {
        onAdvanceNext?.();
      }
    } catch (error) {
      console.error('Error saving lobby address:', { code: error.code, name: error.name });
      setSaveError("We couldn't save your address. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loadState === 'loading') {
    return <p className="text-slate-400 text-sm min-h-11 flex items-center">Loading...</p>;
  }

  if (loadState === 'error') {
    return (
      <div className="space-y-3" role="alert">
        <p className="text-sm text-amber-300">{LOBBY_SETUP_STRINGS['error.load']}</p>
        <Button type="button" onClick={reloadAddress} className={`${touchClass} w-full sm:w-auto`}>
          {LOBBY_SETUP_STRINGS['error.load.retry']}
        </Button>
      </div>
    );
  }

  if (done && !isEditing && stepStatus === LOBBY_STEP_STATUS.DONE) {
    const city = savedAddress?.city?.trim() || '';
    return (
      <div className="space-y-3" data-testid="lobby-address-done">
        <p className="text-sm text-slate-300" data-testid="lobby-address-summary">
          {formatLobbySetupString('address.summary', { city })}
        </p>
        <Button
          type="button"
          variant="secondary"
          onClick={onRequestEdit}
          className={`${touchClass} w-full sm:w-auto`}
          data-testid="lobby-address-edit"
        >
          Edit
        </Button>
      </div>
    );
  }

  if (!showForm) {
    return null;
  }

  return (
    <form onSubmit={handleSave} className="space-y-4" data-testid="lobby-address-step">
      <h3 id={headingId} tabIndex={-1} className="sr-only">
        Your shipping address
      </h3>
      <p className="text-sm text-slate-400">{LOBBY_SETUP_STRINGS['address.consent']}</p>

      {hadPrefillFromProfile && (
        <p className="text-sm text-slate-400" data-testid="lobby-address-prefilled">
          {LOBBY_SETUP_STRINGS['address.prefilled']}
        </p>
      )}

      {showMissingForReady && (
        <p className="text-sm text-amber-300" role="alert" data-testid="lobby-address-missing-message">
          {LOBBY_SETUP_STRINGS['guest.ready.locked.address']}
        </p>
      )}

      <Input
        label="Full Name"
        value={address.name}
        onChange={(e) => updateAddressField({ name: e.target.value })}
        placeholder="Enter your full name"
        className={touchClass}
      />
      <Input
        label="Street Address"
        value={address.street}
        onChange={(e) => updateAddressField({ street: e.target.value })}
        placeholder="123 Main St"
        className={touchClass}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="City"
          value={address.city}
          onChange={(e) => updateAddressField({ city: e.target.value })}
          placeholder="City"
          className={touchClass}
        />
        <Input
          label="State/Province"
          value={address.state}
          onChange={(e) => updateAddressField({ state: e.target.value })}
          placeholder="State"
          className={touchClass}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="ZIP/Postal Code"
          value={address.zip}
          onChange={(e) => updateAddressField({ zip: e.target.value })}
          placeholder="12345"
          className={touchClass}
        />
        <Input
          label="Country"
          value={address.country}
          onChange={(e) => updateAddressField({ country: e.target.value })}
          placeholder="Country"
          className={touchClass}
        />
      </div>

      {showIncompleteError && (
        <p className="text-sm text-amber-300" role="alert">
          {SHIPPING_ADDRESS_INCOMPLETE_PROFILE}
        </p>
      )}
      {saveError && (
        <p className="text-sm text-red-400" role="alert">
          {saveError}
        </p>
      )}

      <Button type="submit" disabled={saving} className={`${touchClass} w-full sm:w-auto`} data-testid="lobby-address-save">
        {saving ? 'Saving...' : 'Save shipping address'}
      </Button>
    </form>
  );
}