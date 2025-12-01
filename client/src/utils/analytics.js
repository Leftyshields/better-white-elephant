/**
 * Analytics Utility
 * Wrapper for Firebase Analytics and Google Analytics event tracking
 * 
 * To enable Google Analytics:
 * 1. Go to https://analytics.google.com/
 * 2. Create a property or use an existing one
 * 3. Get your Measurement ID (format: G-XXXXXXXXXX)
 * 4. Add it to your .env file as: VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
 * 
 * Note: Firebase Analytics and Google Analytics will both track events
 * if both are configured. Firebase Analytics data also flows into Google Analytics.
 */
import { logEvent } from 'firebase/analytics';
import { analytics } from './firebase.js';

// Initialize Google Analytics if ID is provided
const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;

if (GA_MEASUREMENT_ID && typeof window !== 'undefined') {
  // Load Google Analytics script
  const script1 = document.createElement('script');
  script1.async = true;
  script1.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script1);

  // Initialize gtag
  window.dataLayer = window.dataLayer || [];
  function gtag(){window.dataLayer.push(arguments);}
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', GA_MEASUREMENT_ID);
}

/**
 * Track a custom event
 * @param {string} eventName - Name of the event
 * @param {object} eventParams - Additional parameters for the event
 */
export const trackEvent = (eventName, eventParams = {}) => {
  // Track with Firebase Analytics
  if (analytics) {
    try {
      logEvent(analytics, eventName, eventParams);
    } catch (error) {
      console.error('Firebase Analytics error:', error);
    }
  }

  // Track with Google Analytics
  if (typeof window !== 'undefined' && window.gtag && GA_MEASUREMENT_ID) {
    try {
      window.gtag('event', eventName, eventParams);
    } catch (error) {
      console.error('Google Analytics error:', error);
    }
  }
};

/**
 * Track page views
 * @param {string} pageName - Name of the page
 * @param {string} pagePath - Path of the page
 */
export const trackPageView = (pageName, pagePath) => {
  // Track with Firebase Analytics
  trackEvent('page_view', {
    page_title: pageName,
    page_location: pagePath,
  });

  // Track with Google Analytics (uses page_view event automatically)
  if (typeof window !== 'undefined' && window.gtag && GA_MEASUREMENT_ID) {
    try {
      window.gtag('config', GA_MEASUREMENT_ID, {
        page_path: pagePath,
        page_title: pageName,
      });
    } catch (error) {
      console.error('Google Analytics page view error:', error);
    }
  }
};

/**
 * Track user sign up
 * @param {string} method - Sign up method (email, google, etc.)
 */
export const trackSignUp = (method) => {
  trackEvent('sign_up', {
    method: method,
  });
};

/**
 * Track user login
 * @param {string} method - Login method (email, google, etc.)
 */
export const trackLogin = (method) => {
  trackEvent('login', {
    method: method,
  });
};

/**
 * Track party creation
 * @param {object} partyData - Party data
 */
export const trackCreateParty = (partyData) => {
  trackEvent('create_party', {
    has_title: !!partyData.title,
    has_date: !!partyData.date,
  });
};

/**
 * Track party join
 * @param {string} partyId - Party ID
 */
export const trackJoinParty = (partyId) => {
  trackEvent('join_party', {
    party_id: partyId,
  });
};

/**
 * Track gift submission
 * @param {string} partyId - Party ID
 */
export const trackSubmitGift = (partyId) => {
  trackEvent('submit_gift', {
    party_id: partyId,
  });
};

/**
 * Track game start
 * @param {string} partyId - Party ID
 * @param {number} participantCount - Number of participants
 */
export const trackStartGame = (partyId, participantCount) => {
  trackEvent('start_game', {
    party_id: partyId,
    participant_count: participantCount,
  });
};

/**
 * Track game action (steal, reveal, etc.)
 * @param {string} action - Action type (steal, reveal, etc.)
 * @param {string} partyId - Party ID
 */
export const trackGameAction = (action, partyId) => {
  trackEvent('game_action', {
    action: action,
    party_id: partyId,
  });
};

/**
 * Track button click
 * @param {string} buttonName - Name of the button
 * @param {string} location - Location where button was clicked
 */
export const trackButtonClick = (buttonName, location) => {
  trackEvent('button_click', {
    button_name: buttonName,
    location: location,
  });
};

/**
 * Track game completion
 * @param {string} partyId - Party ID
 * @param {number} duration - Game duration in seconds
 * @param {number} totalActions - Total number of actions in the game
 * @param {number} stealCount - Total number of steals
 * @param {boolean} boomerangMode - Whether boomerang mode was enabled
 */
export const trackGameComplete = (partyId, duration, totalActions, stealCount, boomerangMode) => {
  trackEvent('game_complete', {
    party_id: partyId,
    duration_seconds: duration,
    total_actions: totalActions,
    steal_count: stealCount,
    boomerang_mode: boomerangMode,
  });
};

/**
 * Track game abandonment
 * @param {string} partyId - Party ID
 * @param {string} phase - Phase where game was abandoned (lobby, setup, in_progress)
 * @param {number} participantCount - Number of participants when abandoned
 */
export const trackGameAbandoned = (partyId, phase, participantCount) => {
  trackEvent('game_abandoned', {
    party_id: partyId,
    phase: phase,
    participant_count: participantCount,
  });
};

/**
 * Track participant invite
 * @param {string} partyId - Party ID
 * @param {string} method - Invite method (email, share_link, etc.)
 * @param {boolean} success - Whether invite was successfully sent
 */
export const trackInviteSent = (partyId, method, success) => {
  trackEvent('invite_sent', {
    party_id: partyId,
    method: method,
    success: success,
  });
};

/**
 * Track participant join via invite
 * @param {string} partyId - Party ID
 * @param {string} inviteMethod - How they joined (email, share_link, direct)
 */
export const trackParticipantJoin = (partyId, inviteMethod) => {
  trackEvent('participant_join', {
    party_id: partyId,
    invite_method: inviteMethod,
  });
};

/**
 * Track gift link scraping
 * @param {string} partyId - Party ID
 * @param {boolean} success - Whether scraping was successful
 * @param {string} error - Error message if failed
 */
export const trackGiftScrape = (partyId, success, error = null) => {
  trackEvent('gift_scrape', {
    party_id: partyId,
    success: success,
    error: error,
  });
};

/**
 * Track share action
 * @param {string} partyId - Party ID
 * @param {string} method - Share method (copy_link, email, social, etc.)
 */
export const trackShare = (partyId, method) => {
  trackEvent('share', {
    party_id: partyId,
    method: method,
  });
};

/**
 * Track reaction/emoji usage
 * @param {string} partyId - Party ID
 * @param {string} reactionType - Type of reaction (emoji, etc.)
 * @param {string} giftId - Gift ID that was reacted to
 */
export const trackReaction = (partyId, reactionType, giftId) => {
  trackEvent('reaction', {
    party_id: partyId,
    reaction_type: reactionType,
    gift_id: giftId,
  });
};

/**
 * Track fulfillment action
 * @param {string} partyId - Party ID
 * @param {string} action - Action type (address_added, fulfillment_confirmed)
 */
export const trackFulfillment = (partyId, action) => {
  trackEvent('fulfillment', {
    party_id: partyId,
    action: action,
  });
};

/**
 * Track error
 * @param {string} errorType - Type of error
 * @param {string} errorMessage - Error message
 * @param {string} location - Where error occurred
 */
export const trackError = (errorType, errorMessage, location) => {
  trackEvent('error', {
    error_type: errorType,
    error_message: errorMessage,
    location: location,
  });
};

/**
 * Track feature usage
 * @param {string} featureName - Name of the feature
 * @param {object} featureData - Additional feature data
 */
export const trackFeatureUsage = (featureName, featureData = {}) => {
  trackEvent('feature_usage', {
    feature_name: featureName,
    ...featureData,
  });
};

/**
 * Track session duration
 * @param {string} page - Page name
 * @param {number} duration - Duration in seconds
 */
export const trackSessionDuration = (page, duration) => {
  trackEvent('session_duration', {
    page: page,
    duration_seconds: duration,
  });
};

/**
 * Track user engagement milestone
 * @param {string} milestone - Milestone name (first_party, first_game, etc.)
 */
export const trackMilestone = (milestone) => {
  trackEvent('milestone', {
    milestone: milestone,
  });
};

