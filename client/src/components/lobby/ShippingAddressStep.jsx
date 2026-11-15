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
import {
  SHIPPING_ADDRESS_INCOMPLETE_PROFILE,
  SHIPPING_ADDRESS_SENDER_SHARE_CONSENT_LABEL,
} from '../../utils/shippingAddressCopy.js';
import {
  areAllShippingFieldsEmpty,
  isAddressStepReady,
  LOBBY_STEP_STATUS,
} from './lobbyStepUtils.js';
import {
  hasCompleteShippingFields,
  normalizeShippingAddressFromStorage,
  SHIPPING_FIELD_MAX_LENGTH,
  trimShippingAddress,
} from '../../utils/shippingAddressFields.js';

const touchClass = 'min-h-11';

const ADDRESS_INPUT_MAX = {
  name: SHIPPING_FIELD_MAX_LENGTH.name,
  street: SHIPPING_FIELD_MAX_LENGTH.street,
  city: SHIPPING_FIELD_MAX_LENGTH.city,
  state: SHIPPING_FIELD_MAX_LENGTH.state,
  zip: SHIPPING_FIELD_MAX_LENGTH.zip,
  country: SHIPPING_FIELD_MAX_LENGTH.country,
};

export function ShippingAddressStep({
  stepStatus,
  headingId,
  savedAddress,
  savedHasConsent,
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
  const [shareConsent, setShareConsent] = useState(false);
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
          const normalized = normalizeShippingAddressFromStorage(userData.shippingAddress);
          setAddress((prev) => ({ ...prev, ...(normalized || {}) }));
          setHadPrefillFromProfile(hasCompleteShippingFields(normalized));
        }
        setShareConsent(Boolean(userData.shippingAddressSenderShareConsentAt ?? null));
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

  const done = isAddressStepReady(savedAddress, savedHasConsent);
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
        onSaved?.(null, false);
        setHadPrefillFromProfile(false);
        setShareConsent(false);
      } catch (error) {
        console.error('Error clearing lobby address:', { code: error.code, name: error.name });
        setSaveError(LOBBY_SETUP_STRINGS['address.error.save']);
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
        shippingAddressSenderShareConsentAt: shareConsent ? new Date() : deleteField(),
        updatedAt: new Date(),
      });
      const stillValid = hasCompleteShippingFields(trimmedAddress);
      const consentGranted = shareConsent && stillValid;
      onSaved?.(stillValid ? trimmedAddress : null, consentGranted);
      if (consentGranted) {
        onAdvanceNext?.();
      }
    } catch (error) {
      console.error('Error saving lobby address:', { code: error.code, name: error.name });
      setSaveError(LOBBY_SETUP_STRINGS['address.error.save']);
    } finally {
      setSaving(false);
    }
  };

  if (loadState === 'loading') {
    return (
      <p className="text-slate-400 text-sm min-h-11 flex items-center">
        {LOBBY_SETUP_STRINGS['address.loading']}
      </p>
    );
  }

  if (loadState === 'error') {
    return (
      <div className="space-y-3" role="alert">
        <p className="text-sm text-amber-300">{LOBBY_SETUP_STRINGS['address.error.load']}</p>
        <Button type="button" onClick={reloadAddress} className={`${touchClass} w-full sm:w-auto`}>
          {LOBBY_SETUP_STRINGS['error.load.retry']}
        </Button>
      </div>
    );
  }

  if (done && !isEditing && stepStatus === LOBBY_STEP_STATUS.DONE) {
    const city = String(savedAddress?.city ?? '').trim();
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
          {LOBBY_SETUP_STRINGS['address.edit']}
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
        maxLength={ADDRESS_INPUT_MAX.name}
      />
      <Input
        label="Street Address"
        value={address.street}
        onChange={(e) => updateAddressField({ street: e.target.value })}
        placeholder="123 Main St"
        className={touchClass}
        maxLength={ADDRESS_INPUT_MAX.street}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="City"
          value={address.city}
          onChange={(e) => updateAddressField({ city: e.target.value })}
          placeholder="City"
          className={touchClass}
          maxLength={ADDRESS_INPUT_MAX.city}
        />
        <Input
          label="State/Province"
          value={address.state}
          onChange={(e) => updateAddressField({ state: e.target.value })}
          placeholder="State"
          className={touchClass}
          maxLength={ADDRESS_INPUT_MAX.state}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="ZIP/Postal Code"
          value={address.zip}
          onChange={(e) => updateAddressField({ zip: e.target.value })}
          placeholder="12345"
          className={touchClass}
          maxLength={ADDRESS_INPUT_MAX.zip}
        />
        <Input
          label="Country"
          value={address.country}
          onChange={(e) => updateAddressField({ country: e.target.value })}
          placeholder="Country"
          className={touchClass}
          maxLength={ADDRESS_INPUT_MAX.country}
        />
      </div>

      <div className="space-y-2">
        <label className="flex gap-3 items-start text-sm text-slate-300 cursor-pointer min-h-11">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 rounded border-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            checked={shareConsent}
            onChange={(e) => setShareConsent(e.target.checked)}
            data-testid="lobby-address-consent"
            aria-describedby={`${headingId}-consent-helper`}
          />
          <span>{SHIPPING_ADDRESS_SENDER_SHARE_CONSENT_LABEL}</span>
        </label>
        <p id={`${headingId}-consent-helper`} className="text-sm text-slate-400 pl-8">
          {LOBBY_SETUP_STRINGS['address.consent']}
        </p>
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