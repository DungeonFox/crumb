(() => {
  const CARD_ID_STORAGE_KEY = "spritefuly.cardId";

  const generateFallbackId = () => {
    const bytes = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i += 1) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  };

  const generateCardId = () => {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return generateFallbackId();
  };

  const readStoredCardId = () => {
    try {
      return window.localStorage.getItem(CARD_ID_STORAGE_KEY);
    } catch (error) {
      return null;
    }
  };

  const writeStoredCardId = (cardId) => {
    try {
      window.localStorage.setItem(CARD_ID_STORAGE_KEY, cardId);
    } catch (error) {
      // Ignore storage failures (e.g. private mode).
    }
  };

  const getOrCreateCardId = () => {
    const storedId = readStoredCardId();
    if (storedId) return storedId;
    const newId = generateCardId();
    writeStoredCardId(newId);
    return newId;
  };

  window.getOrCreateCardId = getOrCreateCardId;
})();
