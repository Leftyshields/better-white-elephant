/**
 * Firestore Data Converters
 * Type-safe converters for Firestore documents
 */

/**
 * User converter
 * @param {Object} data - User document data
 * @returns {Object} Converted user object
 */
export const userConverter = {
  toFirestore: (user) => ({
    displayName: user.displayName || '',
    email: user.email || '',
    avatarUrl: user.avatarUrl || null,
    shippingAddress: user.shippingAddress || null,
    createdAt: user.createdAt || new Date(),
    updatedAt: new Date(),
  }),
  fromFirestore: (snapshot, options) => {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      displayName: data.displayName || '',
      email: data.email || '',
      avatarUrl: data.avatarUrl || null,
      shippingAddress: data.shippingAddress || null,
      createdAt: data.createdAt?.toDate() || null,
      updatedAt: data.updatedAt?.toDate() || null,
    };
  },
};

/**
 * Party converter
 * @param {Object} data - Party document data
 * @returns {Object} Converted party object
 */
export const partyConverter = {
  toFirestore: (party) => ({
    adminId: party.adminId,
    title: party.title || null,
    date: party.date,
    status: party.status || 'LOBBY', // LOBBY, ACTIVE, ENDED
    config: {
      maxSteals: party.config?.maxSteals || 3,
      returnToStart: party.config?.returnToStart || false,
      priceLimit: party.config?.priceLimit || null,
    },
    createdAt: party.createdAt || new Date(),
    updatedAt: new Date(),
  }),
  fromFirestore: (snapshot, options) => {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      adminId: data.adminId,
      title: data.title || null,
      date: data.date?.toDate() || null,
      status: data.status || 'LOBBY',
      config: {
        maxSteals: data.config?.maxSteals || 3,
        returnToStart: data.config?.returnToStart || false,
        priceLimit: data.config?.priceLimit || null,
      },
      createdAt: data.createdAt?.toDate() || null,
      updatedAt: data.updatedAt?.toDate() || null,
    };
  },
};

/**
 * Participant converter
 * @param {Object} data - Participant document data
 * @returns {Object} Converted participant object
 */
export const participantConverter = {
  toFirestore: (participant) => ({
    status: participant.status, // 'GOING' | 'PENDING'
    turnNumber: participant.turnNumber || null,
    joinedAt: participant.joinedAt || new Date(),
    updatedAt: new Date(),
  }),
  fromFirestore: (snapshot, options) => {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      status: data.status || 'PENDING',
      turnNumber: data.turnNumber || null,
      joinedAt: data.joinedAt?.toDate() || null,
      updatedAt: data.updatedAt?.toDate() || null,
    };
  },
};

/**
 * Gift converter
 * @param {Object} data - Gift document data
 * @returns {Object} Converted gift object
 */
export const giftConverter = {
  toFirestore: (gift) => ({
    partyId: gift.partyId,
    submitterId: gift.submitterId,
    url: gift.url,
    title: gift.title || '',
    image: gift.image || null,
    price: gift.price || null,
    isFrozen: gift.isFrozen || false,
    winnerId: gift.winnerId || null,
    createdAt: gift.createdAt || new Date(),
    updatedAt: new Date(),
  }),
  fromFirestore: (snapshot, options) => {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      partyId: data.partyId,
      submitterId: data.submitterId,
      url: data.url,
      title: data.title || '',
      image: data.image || null,
      price: data.price || null,
      isFrozen: data.isFrozen || false,
      winnerId: data.winnerId || null,
      createdAt: data.createdAt?.toDate() || null,
      updatedAt: data.updatedAt?.toDate() || null,
    };
  },
};


