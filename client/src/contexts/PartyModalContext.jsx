/**
 * Context for managing the Create Party Modal
 */
import { createContext, useContext, useState } from 'react';

const PartyModalContext = createContext(null);

export function PartyModalProvider({ children }) {
  const [showModal, setShowModal] = useState(false);
  const [hostSignInNotice, setHostSignInNotice] = useState('');

  return (
    <PartyModalContext.Provider
      value={{
        showModal,
        setShowModal,
        hostSignInNotice,
        setHostSignInNotice,
      }}
    >
      {children}
    </PartyModalContext.Provider>
  );
}

export function usePartyModal() {
  const context = useContext(PartyModalContext);
  if (!context) {
    throw new Error('usePartyModal must be used within PartyModalProvider');
  }
  return context;
}



