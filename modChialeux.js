// modChialeux.js
// Module de gestion Firestore pour le jeu du Chialeux.
// Utilise Firebase Firestore v10.13.0 (SDK modulaire).

import {
  doc,
  onSnapshot,
  updateDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

(function (window) {

  function createChialeuxModule() {

    const state = {
      db: null,
      soireeCode: null,
      gid: null,
      deviceId: null,

      players: [],
      myIndex: null,

      soireeData: null,   // données du doc soirees/{code}
      scoresData: null,   // données du doc scores_chialeux/{gid}

      unsubSoiree: null,
      unsubScores: null
    };

    /**
     * Initialisation du module.
     * @param {Firestore} db
     * @param {object} baseState - doit contenir au minimum { soireeCode, gameId, deviceId }
     */
    function init(db, baseState) {
      state.db = db;
      state.soireeCode = baseState.soireeCode;
      state.gid = baseState.gameId;
      state.deviceId = baseState.deviceId || null;
    }

    /**
     * Écoute combinée : soirees/{code} + scores_chialeux/{gid}
     * Appelle onUpdate(model) à chaque changement.
     */
    function listenCombined(onUpdate, onError) {
      const { db, soireeCode, gid } = state;
      if (!db || !soireeCode || !gid) {
        console.warn('[ModChialeux] init(db, state) doit être appelé avant listenCombined()');
        return;
      }

      const soireeRef = doc(db, 'soirees', soireeCode);
      const scoresRef = doc(db, 'scores_chialeux', gid);

      // Nettoyage si on relance
      if (state.unsubSoiree) { state.unsubSoiree(); state.unsubSoiree = null; }
      if (state.unsubScores) { state.unsubScores(); state.unsubScores = null; }

      state.unsubSoiree = onSnapshot(
        soireeRef,
        (snap) => {
          state.soireeData = snap.exists() ? snap.data() : null;

          // Essaye d'initialiser / compléter scores_chialeux à partir de soirees
          ensureScoresInitializedFromSoiree().then(() => {
            rebuildModelAndEmit(onUpdate);
          }).catch(err => {
            console.error('[ModChialeux] erreur ensureScoresInitializedFromSoiree (soirees):', err);
            onError && onError(err);
          });
        },
        (err) => {
          console.error('[ModChialeux] erreur listen soirees:', err);
          onError && onError(err);
        }
      );

      state.unsubScores = onSnapshot(
        scoresRef,
        (snap) => {
          state.scoresData = snap.exists() ? snap.data() : null;

          // Essaye d'initialiser / compléter scores_chialeux si incomplet
          ensureScoresInitializedFromSoiree().then(() => {
            rebuildModelAndEmit(onUpdate);
          }).catch(err => {
            console.error('[ModChialeux] erreur ensureScoresInitializedFromSoiree (scores):', err);
            onError && onError(err);
          });
        },
        (err) => {
          console.error('[ModChialeux] erreur listen scores_chialeux:', err);
          onError && onError(err);
        }
      );
    }

    /**
     * Construit un modèle combiné (soiree + scores) et le push vers l’UI.
     */
    function rebuildModelAndEmit(onUpdate) {
      const soiree = state.soireeData;
      const scores = state.scoresData;

      // On attend d'avoir les deux docs
      if (!soiree || !scores) return;

      const players = Array.isArray(soiree.players)
        ? soiree.players
        : (soiree.players && soiree.players.list) || [];

      // Index du joueur courant (deviceId)
      let myIndex = null;
      if (state.deviceId && players.length) {
        myIndex = players.findIndex(p => p && p.deviceId === state.deviceId);
        if (myIndex < 0) myIndex = null;
      }

      state.players = players;
      state.myIndex = myIndex;

      const dealerIndex = Number.isInteger(scores.dealerIndex)
        ? scores.dealerIndex
        : (Number.isInteger(soiree.leaderIndex) ? soiree.leaderIndex : 0);

      const model = {
        soireeCode: state.soireeCode,
        gid: state.gid,

        players,
        myIndex,
        dealerIndex,

        round: Number.isInteger(scores.round) ? scores.round : 1,
        maxCards: Number.isInteger(scores.maxCards) ? scores.maxCards : 10,
        cardsThisRound: Number.isInteger(scores.cardsThisRound) ? scores.cardsThisRound : 1,

        status: scores.status || 'prediction', // "prediction" | "play" | "results" | "finished"

        scores: scores.scores || {},           // { "0": totalPoints, ... }
        predictions: scores.predictions || {}, // { "0": prédictionBrasse, ... }
        predictionTurnIndex: Number.isInteger(scores.predictionTurnIndex)
          ? scores.predictionTurnIndex
          : null
      };

      onUpdate && onUpdate(model);
    }

    /**
     * Initialise ou complète le document scores_chialeux/{gid}
     * à partir des infos de soirees/{code}.
     *
     * - Si scoresData est null -> création avec setDoc(..., { merge: true })
     * - Si scoresData existe mais incomplet -> updateDoc avec seulement les champs manquants
     */
    async function ensureScoresInitializedFromSoiree() {
      const { db, soireeCode, gid, soireeData, scoresData } = state;
      if (!db || !soireeCode || !gid) return;
      if (!soireeData) return;

      const players = Array.isArray(soireeData.players)
        ? soireeData.players
        : (soireeData.players && soireeData.players.list) || [];

      const playerCount = players.length;
      if (!playerCount) return;

      const scoresRef = doc(db, 'scores_chialeux', gid);
      const current = scoresData || {};

      const patch = {};

      // round / maxCards / cardsThisRound / status
      if (!Number.isInteger(current.round)) {
        patch.round = 1;
      }
      if (!Number.isInteger(current.maxCards)) {
        patch.maxCards = 10;
      }
      if (!Number.isInteger(current.cardsThisRound)) {
        patch.cardsThisRound = 1;
      }
      if (!current.status) {
        patch.status = 'prediction';
      }

      // dealerIndex
      let dealerIndex;
      if (Number.isInteger(current.dealerIndex)) {
        dealerIndex = current.dealerIndex;
      } else if (Number.isInteger(soireeData.leaderIndex)) {
        dealerIndex = soireeData.leaderIndex;
        patch.dealerIndex = dealerIndex;
      } else {
        dealerIndex = 0;
        patch.dealerIndex = 0;
      }

      // scores init : 10 points par joueur si non présent
      if (!current.scores) {
        const scoresInit = {};
        for (let i = 0; i < playerCount; i++) {
          scoresInit[i] = 10;
        }
        patch.scores = scoresInit;
      }

      // predictions init
      if (!current.predictions) {
        patch.predictions = {};
      }

      // predictionTurnIndex : premier joueur à gauche du brasseur
      // 👉 On NE l'initialise que s'il n'y a encore AUCUNE prédiction.
      const hasAnyPrediction =
        current.predictions && Object.keys(current.predictions).length > 0;

      if (!Number.isInteger(current.predictionTurnIndex) && !hasAnyPrediction) {
        const order = computePredictionOrder(dealerIndex, playerCount);
        if (order.length > 0) {
          patch.predictionTurnIndex = order[0];
        } else {
          patch.predictionTurnIndex = 0;
        }
      }

      if (Object.keys(patch).length === 0 && scoresData) {
        // Rien à modifier
        return;
      }

      try {
        if (!scoresData) {
          // Doc inexistant ou non reçu -> création/injection de base
          await setDoc(scoresRef, patch, { merge: true });
        } else {
          // Doc existant -> on complète uniquement les champs manquants
          await updateDoc(scoresRef, patch);
        }
      } catch (err) {
        console.error('[ModChialeux] erreur ensureScoresInitializedFromSoiree (write):', err);
        throw err;
      }
    }

    /**
     * Soumet une prédiction pour un joueur.
     * Met à jour :
     *   - predictions.{index} = value
     *   - predictionTurnIndex = prochain joueur ou null si tous ont prédit
     *
     * NOTE : simple updateDoc, acceptable pour un petit groupe.
     */
    async function submitPrediction(playerIndex, value) {
      const { db, gid, scoresData, players } = state;
      if (!db || !gid) {
        console.warn('[ModChialeux] submitPrediction: db ou gid manquant');
        return;
      }
      if (!Number.isFinite(playerIndex)) return;

      const scoresRef = doc(db, 'scores_chialeux', gid);

      const existing = (scoresData && scoresData.predictions) || {};
      const playerCount = players ? players.length : 0;

      const newPredictions = { ...existing, [playerIndex]: value };

      let nextTurnIndex = null;

      if (playerCount > 0 && Object.keys(newPredictions).length < playerCount) {
        const dealerIndex = Number.isInteger(scoresData && scoresData.dealerIndex)
          ? scoresData.dealerIndex
          : 0;

        const order = computePredictionOrder(dealerIndex, playerCount);
        const currentPos = order.indexOf(playerIndex);

        if (currentPos >= 0 && currentPos < order.length - 1) {
          // prochain dans l'ordre à gauche du brasseur
          nextTurnIndex = order[currentPos + 1];
        } else {
          // par sécurité : premier joueur de l'ordre sans prédiction
          nextTurnIndex = order.find(i => !(i in newPredictions));
          if (typeof nextTurnIndex !== 'number') {
            nextTurnIndex = null;
          }
        }
      } else {
        // Tous les joueurs ont une prédiction -> plus de tour
        nextTurnIndex = null;
      }

      const patch = {
        [`predictions.${playerIndex}`]: value,
        predictionTurnIndex: nextTurnIndex
      };

      try {
        await updateDoc(scoresRef, patch);
      } catch (err) {
        console.error('[ModChialeux] erreur submitPrediction:', err);
        throw err;
      }
    }

    /**
     * Calcule l'ordre de prédiction à partir du brasseur (index), dans le sens horaire.
     */
    function computePredictionOrder(dealerIndex, playerCount) {
      const order = [];
      for (let i = 1; i <= playerCount; i++) {
        order.push((dealerIndex + i) % playerCount);
      }
      return order;
    }

    function stop() {
      if (state.unsubSoiree) { state.unsubSoiree(); state.unsubSoiree = null; }
      if (state.unsubScores) { state.unsubScores(); state.unsubScores = null; }
    }

    return {
      state,
      init,
      listenCombined,
      submitPrediction,
      stop
    };
  }

  window.ModChialeux = createChialeuxModule();

})(window);
