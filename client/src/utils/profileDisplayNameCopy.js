/**
 * User-facing copy for Profile display name and public invite host label.
 */

export const PROFILE_DISPLAY_NAME_PLACEHOLDER = 'First name or nickname';

export const PROFILE_DISPLAY_NAME_HELPER =
  "Other players see this name. Leave it blank and they'll see Player plus a short code.";

export const PROFILE_DISPLAY_NAME_EMAIL_ERROR = 'Use a name, not an email address.';

/** Host display when Firestore name is missing, email-shaped, or doc missing */
export const INVITE_LANDING_HOST_NAME_NOT_SHARED = 'Name not shared';

/** Host display when the public users/{uid} read fails (network/rules) */
export const INVITE_LANDING_HOST_NAME_UNAVAILABLE = 'Name unavailable';