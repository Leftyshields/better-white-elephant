/** @typedef {'LOCKED' | 'WAITING' | 'DONE'} HostLobbyStartStepState */

/** @param {ReturnType<import('./computeLobbyReadiness.js').computeLobbyReadiness>} readiness */
export function deriveHostLobbyStartStepState(readiness) {
  if (!readiness?.hostReadyForStart) {
    return 'LOCKED';
  }
  if (readiness.allReady) {
    return 'DONE';
  }
  return 'WAITING';
}