
(function(){
  // Optimized tasker for environment-based sprite management

  // This is the tasker that handles sprite positioning and interaction
  // between the environment and popout viewers through LocalStorage.
  function getCardDataFromLocalStorage() {
    const cardData = [];
    try {
      const presenceData = JSON.parse(localStorage.getItem("HG_WORLD_PRESENCE_V1") || "{}");
      for (const cardId in presenceData) {
        const card = presenceData[cardId];
        if (card && card.cardId && card.frameIndex !== undefined) {
          cardData.push({
            cardId,
            frameIndex: card.frameIndex,
            width: card.canvasW,
            height: card.canvasH
          });
        }
      }
    } catch (e) {
      console.error("Error reading card data from LocalStorage:", e);
    }
    return cardData;
  }

  // Function that runs to update the environment with sprite data
  function updateEnvironmentWithCards() {
    const cardData = getCardDataFromLocalStorage();
    window.runTask("updateEnvironment", cardData);
  }

  // Set an interval to update the environment each time
  setInterval(updateEnvironmentWithCards, 500);  // every 500ms
})();
