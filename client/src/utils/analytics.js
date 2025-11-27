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

