/**
 * G19: locationWithoutInviteToken and stripInviteTokenFromAddressBar.
 * replaceState drops #t=, keeps path and query, and does not push, assign, or reload.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  locationWithoutInviteToken,
  stripInviteTokenFromAddressBar,
} from '../../utils/partyInvite.js';

const PARTY_ID = 'invite-join-party';
const TOKEN = 'feedfacefeedfacefeedfacefeedface';

describe('locationWithoutInviteToken', () => {
  it('drops only the invite token and keeps path, query, and other hash params', () => {
    expect(locationWithoutInviteToken(`/party/${PARTY_ID}`, '', `#t=${TOKEN}`)).toBe(`/party/${PARTY_ID}`);
    expect(locationWithoutInviteToken(`/party/${PARTY_ID}`, '?utm=1', `#t=${TOKEN}`)).toBe(`/party/${PARTY_ID}?utm=1`);
    expect(locationWithoutInviteToken(`/party/${PARTY_ID}`, '', `#x=1&t=${TOKEN}`)).toBe(`/party/${PARTY_ID}#x=1`);
    expect(locationWithoutInviteToken(`/party/${PARTY_ID}`, '', `#t=${TOKEN}&ref=host`)).toBe(`/party/${PARTY_ID}#ref=host`);
  });

  it('leaves the URL alone when there is no valid invite token', () => {
    expect(locationWithoutInviteToken(`/party/${PARTY_ID}`, '?x=1', '')).toBe(`/party/${PARTY_ID}?x=1`);
    expect(locationWithoutInviteToken(`/party/${PARTY_ID}`, '', `#t=not-a-token`)).toBe(`/party/${PARTY_ID}#t=not-a-token`);
    expect(locationWithoutInviteToken(`/party/${PARTY_ID}`, '', `#invite=${TOKEN}`)).toBe(`/party/${PARTY_ID}#invite=${TOKEN}`);
  });
});

describe('stripInviteTokenFromAddressBar', () => {
  it('calls replaceState with the current history state and does not push, assign, or reload', () => {
    const state = { from: 'invite' };
    const loc = { pathname: `/party/${PARTY_ID}`, search: '?utm=1', hash: `#t=${TOKEN}` };
    const historyObj = {
      state,
      replaceState: vi.fn(),
      pushState: vi.fn(),
    };
    const assign = vi.fn();
    const reload = vi.fn();
    loc.assign = assign;
    loc.reload = reload;

    const changed = stripInviteTokenFromAddressBar(historyObj, loc);

    expect(changed).toBe(true);
    expect(historyObj.replaceState).toHaveBeenCalledTimes(1);
    expect(historyObj.replaceState).toHaveBeenCalledWith(state, '', `/party/${PARTY_ID}?utm=1`);
    expect(historyObj.pushState).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('is a no-op when the hash has no invite token', () => {
    const historyObj = { state: null, replaceState: vi.fn(), pushState: vi.fn() };
    const loc = { pathname: `/party/${PARTY_ID}`, search: '', hash: '' };
    expect(stripInviteTokenFromAddressBar(historyObj, loc)).toBe(false);
    expect(historyObj.replaceState).not.toHaveBeenCalled();
  });
});
