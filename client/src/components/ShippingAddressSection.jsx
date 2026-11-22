/**
 * Per-game shipping address (A0). Shown on the end screen to a player who won someone else's gift.
 * Saved through the game server only (parties/{partyId}/shipping/{uid}; Firestore rules deny all
 * client access). Saving is the share: no checkbox, no agreement, no notice line.
 * Clearing every field and saving deletes it, after one confirm.
 */
import { useEffect, useState } from 'react';
import { Button } from './ui/Button.jsx';
import { Input } from './ui/Input.jsx';
import { Modal } from './ui/Modal.jsx';
import { fetchMyPartyShipping, saveMyPartyShipping } from '../utils/api.js';
import {
  SHIPPING_ADDRESS_CANCEL,
  SHIPPING_ADDRESS_DELETE_CONFIRM,
  SHIPPING_ADDRESS_DELETE_CONFIRM_ACTION,
  SHIPPING_ADDRESS_DELETE_SUCCESS,
  SHIPPING_ADDRESS_FORM_COPY as COPY,
} from '../utils/shippingAddressCopy.js';

const FIELD_KEYS = ['name', 'street', 'city', 'state', 'zip', 'country'];
const EMPTY = Object.freeze(Object.fromEntries(FIELD_KEYS.map((key) => [key, ''])));
const MAX_LENGTH = { name: 100, street: 200, city: 100, state: 50, zip: 20, country: 60 };

const filledCount = (address) => FIELD_KEYS.filter((key) => address[key]?.trim()).length;

export function ShippingAddressSection({ partyId }) {
  const [view, setView] = useState('loading'); // loading | loadFailed | form | saved
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  // A failed write: { copy, kind: 'save' | 'delete' }. A failed save keeps the typed fields in
  // the form; a failed delete goes back to the saved view. A write that didn't happen never
  // shows as saved or as gone.
  const [failure, setFailure] = useState(null);
  const [notice, setNotice] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setView('loading');
    fetchMyPartyShipping(partyId)
      .then((data) => {
        if (cancelled) return;
        const address = data?.shippingAddress ?? null;
        setSaved(address);
        setDraft(address ? { ...EMPTY, ...address } : EMPTY);
        setView(address ? 'saved' : 'form');
      })
      .catch(() => {
        if (!cancelled) setView('loadFailed');
      });
    return () => {
      cancelled = true;
    };
  }, [partyId, loadAttempt]);

  const filled = filledCount(draft);
  const isClear = filled === 0;
  const canSubmit = !busy && (filled === FIELD_KEYS.length || (isClear && saved));

  const write = async (address, failedCopy, viewOnFailure) => {
    setBusy(true);
    setFailure(null);
    try {
      const data = await saveMyPartyShipping(partyId, address);
      const next = data?.shippingAddress ?? null;
      setSaved(next);
      setDraft(next ? { ...EMPTY, ...next } : EMPTY);
      setNotice(next ? '' : SHIPPING_ADDRESS_DELETE_SUCCESS);
      setView(next ? 'saved' : 'form');
    } catch {
      if (viewOnFailure === 'saved') setDraft({ ...EMPTY, ...saved });
      setView(viewOnFailure);
      setFailure({ copy: failedCopy, kind: viewOnFailure === 'saved' ? 'delete' : 'save' });
    } finally {
      setBusy(false);
    }
  };

  const failureLine = failure && (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <p role="alert" className="text-sm text-amber-300">
        {failure.copy}
      </p>
      {failure.kind === 'save' ? (
        // Inside the form: resubmits whatever is in the fields now.
        <Button type="submit" variant="secondary" disabled={!canSubmit}>
          {COPY.retry}
        </Button>
      ) : (
        <Button variant="secondary" disabled={busy} onClick={() => write(EMPTY, COPY.deleteFailed, 'saved')}>
          {COPY.retry}
        </Button>
      )}
    </div>
  );

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    if (isClear) {
      setConfirmingDelete(true);
      return;
    }
    write({ ...draft }, COPY.saveFailed, 'form');
  };

  const confirmDelete = () => {
    setConfirmingDelete(false);
    write(EMPTY, COPY.deleteFailed, 'saved');
  };

  return (
    <section
      aria-labelledby="shipping-address-heading"
      className="bg-slate-900/60 border border-white/10 rounded-2xl p-6"
    >
      <h3 id="shipping-address-heading" className="text-xl font-bold text-white mb-4">
        {COPY.heading}
      </h3>

      {notice && (
        <p role="status" className="text-sm text-emerald-300 mb-4">
          {notice}
        </p>
      )}

      {view === 'loading' && <p className="text-sm text-slate-300">{COPY.loading}</p>}

      {view === 'loadFailed' && (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className="text-sm text-amber-300">
            {COPY.loadFailed}
          </p>
          <Button variant="secondary" onClick={() => setLoadAttempt((n) => n + 1)}>
            {COPY.retry}
          </Button>
        </div>
      )}

      {view === 'saved' && saved && failureLine}

      {view === 'saved' && saved && (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <address className="not-italic text-sm text-slate-200 leading-6">
            <span className="block">{saved.name}</span>
            <span className="block">{saved.street}</span>
            <span className="block">
              {saved.city}, {saved.state} {saved.zip}
            </span>
            <span className="block">{saved.country}</span>
          </address>
          <Button
            variant="secondary"
            aria-label={COPY.editAria}
            onClick={() => {
              setNotice('');
              setFailure(null);
              setView('form');
            }}
          >
            {COPY.edit}
          </Button>
        </div>
      )}

      {view === 'form' && (
        <form onSubmit={handleSubmit} noValidate>
          <Input
            label={COPY.fields.name.label}
            placeholder={COPY.fields.name.placeholder}
            value={draft.name}
            maxLength={MAX_LENGTH.name}
            autoComplete="name"
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <Input
            label={COPY.fields.street.label}
            placeholder={COPY.fields.street.placeholder}
            value={draft.street}
            maxLength={MAX_LENGTH.street}
            autoComplete="street-address"
            onChange={(e) => setDraft({ ...draft, street: e.target.value })}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            <Input
              label={COPY.fields.city.label}
              placeholder={COPY.fields.city.placeholder}
              value={draft.city}
              maxLength={MAX_LENGTH.city}
              autoComplete="address-level2"
              onChange={(e) => setDraft({ ...draft, city: e.target.value })}
            />
            <Input
              label={COPY.fields.state.label}
              placeholder={COPY.fields.state.placeholder}
              value={draft.state}
              maxLength={MAX_LENGTH.state}
              autoComplete="address-level1"
              onChange={(e) => setDraft({ ...draft, state: e.target.value })}
            />
            <Input
              label={COPY.fields.zip.label}
              placeholder={COPY.fields.zip.placeholder}
              value={draft.zip}
              maxLength={MAX_LENGTH.zip}
              autoComplete="postal-code"
              onChange={(e) => setDraft({ ...draft, zip: e.target.value })}
            />
            <Input
              label={COPY.fields.country.label}
              placeholder={COPY.fields.country.placeholder}
              value={draft.country}
              maxLength={MAX_LENGTH.country}
              autoComplete="country-name"
              onChange={(e) => setDraft({ ...draft, country: e.target.value })}
            />
          </div>
          {failureLine}
          <div className="flex flex-wrap justify-end gap-3">
            {saved && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setDraft({ ...EMPTY, ...saved });
                  setFailure(null);
                  setView('saved');
                }}
              >
                {SHIPPING_ADDRESS_CANCEL}
              </Button>
            )}
            <Button type="submit" disabled={!canSubmit}>
              {busy ? COPY.saving : COPY.save}
            </Button>
          </div>
        </form>
      )}

      <Modal isOpen={confirmingDelete} onClose={() => setConfirmingDelete(false)}>
        <p className="text-sm text-slate-300 mb-6">{SHIPPING_ADDRESS_DELETE_CONFIRM}</p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
            {SHIPPING_ADDRESS_CANCEL}
          </Button>
          <Button variant="danger" onClick={confirmDelete}>
            {SHIPPING_ADDRESS_DELETE_CONFIRM_ACTION}
          </Button>
        </div>
      </Modal>
    </section>
  );
}
