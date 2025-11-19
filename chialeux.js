// chialeux.js
// UI pour le jeu du Chialeux, branchée sur Firestore via ModChialeux.
// Version autonome : n'utilise PAS ModInit ni dame_de_pique_init.js.

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDLSnoOCdHXl-5sKaJ55hhFbv-quS156kg",
  authDomain: "soireecartev2.firebaseapp.com",
  projectId: "soireecartev2",
  storageBucket: "soireecartev2.firebasestorage.app",
  messagingSenderId: "784781686361",
  appId: "1:784781686361:web:033693cb22fb1a55af2348"
};

function getFirebaseApp() {
  const apps = getApps();
  if (!apps.length) {
    return initializeApp(firebaseConfig);
  }
  return apps[0];
}

async function ensureAuth() {
  const app = getFirebaseApp();
  const auth = getAuth(app);
  try {
    await signInAnonymously(auth);
  } catch (err) {
    console.warn("[chialeux] erreur ensureAuth:", err);
  }
}

function getDb() {
  const app = getFirebaseApp();
  return getFirestore(app);
}

// Lecture des paramètres d'URL ?code=XXXX&gid=YYYY
function getUrlParams() {
  const sp = new URLSearchParams(window.location.search);
  const soireeCode = (sp.get("code") || "").trim().toUpperCase();
  const gameId = (sp.get("gid") || "").trim();
  return { soireeCode, gameId };
}

// Même logique que selection_jeux.html pour le deviceId
function getDeviceId() {
  let id = localStorage.getItem("deviceId") || localStorage.getItem("mgm_deviceId");
  if (!id) {
    id =
      (window.crypto?.randomUUID?.()) ||
      ("did_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8));
    localStorage.setItem("deviceId", id);
  }
  return id;
}

const ChialeuxUI = {
  model: null,        // modèle combiné (soirees + scores_chialeux)
  players: [],
  myIndex: null,
  currentIndex: null  // index du joueur dont la modale de prédiction est ouverte sur CE device
};

onReady(initChialeuxPage);

async function initChialeuxPage() {
  const ModChialeux = window.ModChialeux;

  if (!ModChialeux) {
    console.error("[chialeux] ModChialeux manquant (modChialeux.js doit être chargé AVANT chialeux.js)");
    return;
  }

  // 1) Auth anonyme Firebase
  await ensureAuth();
  const db = getDb();

  // 2) Paramètres d'URL + deviceId
  const { soireeCode, gameId } = getUrlParams();
  const deviceId = getDeviceId();

  if (!soireeCode || !gameId) {
    console.error("[chialeux] soireeCode ou gameId manquant dans l’URL");
    return;
  }

  const baseState = {
    soireeCode,
    gameId,
    deviceId
  };

  // 3) Initialisation du module Firestore Chialeux
  ModChialeux.init(db, baseState);

  // 4) Écoute combinée soirees/{code} + scores_chialeux/{gid}
  ModChialeux.listenCombined(
    (model) => onModelUpdate(model),
    (err) => console.error("[chialeux] erreur listenCombined:", err)
  );

  // 5) Wiring UI
  initPredictionModal();
  initResultsModal();
  initHostControls();
}

/* --- Réaction à chaque mise à jour Firestore combinée --- */

function onModelUpdate(model) {
  ChialeuxUI.model = model;
  ChialeuxUI.players = model.players || [];
  ChialeuxUI.myIndex = model.myIndex;

  // 1) Construire les sections UI de base à partir des joueurs
  buildPredictionUI(model.players);
  buildScoreUIFromModel(model);

  // 2) Mettre à jour la carte de titre : brasseur, nb de cartes, mode
  updateHeaderFromModel(model);

  // 3) Appliquer les couleurs + valeurs de prédiction
  updatePredictionListFromModel(model);

  // 4) Mettre à jour les contrôles hôte
  updateHostControls(model);

  // 5) Gestion des modales selon le statut
  if (model.status === "prediction") {
    handleModalForCurrentTurn(model);
    hideResultModal();
    updateRoundError(false, "");
  } else if (model.status === "results") {
    hidePredictionModal();
    handleResultsModal(model);
    if (model.resultsError) {
      updateRoundError(true, "Le total des levées ne correspond pas au nombre de cartes distribuées. Veuillez ressaisir les résultats.");
    } else {
      updateRoundError(false, "");
    }
  } else {
    // Autres statuts potentiels ("play", "finished", etc.)
    hidePredictionModal();
    hideResultModal();
    updateRoundError(false, "");
  }
}

/* --- Construction UI --- */

function buildPredictionUI(players) {
  const list = document.getElementById("predictionList");
  if (!list) return;
  list.innerHTML = "";

  (players || []).forEach((p, index) => {
    const name = p && p.name ? p.name : `Joueur ${index + 1}`;
    const div = document.createElement("div");
    div.className = "player-card";

    div.innerHTML = `
      <div class="player-name">${name}</div>
      <div class="predict-display">—</div>
    `;

    list.appendChild(div);
  });
}

function buildScoreUIFromModel(model) {
  const players = model.players || [];
  const scores = model.scores || {};

  const sb = document.getElementById("scoreBoard");
  if (!sb) return;
  sb.innerHTML = "";

  players.forEach((p, index) => {
    const name = p && p.name ? p.name : `Joueur ${index + 1}`;
    const total = (scores && typeof scores[index] === "number") ? scores[index] : 10;

    const row = document.createElement("div");
    row.className = "score-row";
    row.innerHTML = `
      <span class="score-name">${name}</span>
      <span class="score-value">${total}</span>
    `;
    sb.appendChild(row);
  });
}

function updateHeaderFromModel(model) {
  const dealerIndex = model.dealerIndex || 0;
  const players = model.players || [];
  const dealerName =
    players[dealerIndex] && players[dealerIndex].name
      ? players[dealerIndex].name
      : `Joueur ${dealerIndex + 1}`;

  const dealerEl = document.getElementById("dealerName");
  const cardsEl = document.getElementById("cardsCount");
  const modeEl = document.getElementById("modeLabel");

  if (dealerEl) dealerEl.textContent = dealerName;
  if (cardsEl) cardsEl.textContent = model.cardsThisRound || 0;

  if (modeEl) {
    if (model.status === "prediction") {
      modeEl.textContent = "Prédiction";
    } else if (model.status === "results") {
      modeEl.textContent = "Résultat";
    } else {
      modeEl.textContent = "Jeu";
    }
  }
}

/* --- Prédictions : couleurs + valeurs --- */

function updatePredictionListFromModel(model) {
  const predictions = model.predictions || {};
  const predictionTurnIndex = model.predictionTurnIndex;

  const rows = document.querySelectorAll(".player-card");

  rows.forEach((row, index) => {
    row.classList.remove("player-pending", "player-current", "player-done");

    const val = Object.prototype.hasOwnProperty.call(predictions, index)
      ? predictions[index]
      : null;

    const span = row.querySelector(".predict-display");
    if (span) {
      span.textContent = (val === null || val === undefined) ? "—" : String(val);
    }

    if (val === null || val === undefined) {
      row.classList.add("player-pending"); // rouge = à faire
    } else {
      row.classList.add("player-done");    // vert pâle = fait
    }

    if (predictionTurnIndex === index && model.status === "prediction") {
      row.classList.remove("player-pending", "player-done");
      row.classList.add("player-current"); // vert foncé = joueur en cours
    }
  });
}

/* --- Gestion de la modale Prédiction selon le tour et le statut --- */

function handleModalForCurrentTurn(model) {
  const myIndex = model.myIndex;
  const predictionTurnIndex = model.predictionTurnIndex;
  const status = model.status || "prediction";

  const overlay = document.getElementById("predictionModalOverlay");
  const input = document.getElementById("modalPredictionInput");
  const btn = document.getElementById("modalValidateBtn");

  // CAS 1 : on n'est pas en phase prédiction
  // OU toutes les prédictions sont faites (predictionTurnIndex === null)
  if (status !== "prediction" || predictionTurnIndex === null) {
    if (overlay) overlay.classList.add("hidden");
    if (input) input.disabled = true;
    if (btn) btn.disabled = true;
    ChialeuxUI.currentIndex = null;
    return;
  }

  // CAS 2 : ce device n'est associé à aucun joueur
  if (myIndex == null) {
    if (overlay) overlay.classList.add("hidden");
    if (input) input.disabled = true;
    if (btn) btn.disabled = true;
    ChialeuxUI.currentIndex = null;
    return;
  }

  // CAS 3 : ce n'est pas mon tour → pas de modale ici
  if (myIndex !== predictionTurnIndex) {
    if (overlay) overlay.classList.add("hidden");
    if (input) input.disabled = true;
    if (btn) btn.disabled = true;
    ChialeuxUI.currentIndex = null;
    return;
  }

  // CAS 4 : c'est mon tour → modale visible et active
  ChialeuxUI.currentIndex = myIndex;
  openPredictionModalForIndex(myIndex, model);
}

/* --- Modale de prédiction : wiring bouton "Valider" --- */

function initPredictionModal() {
  const btn = document.getElementById("modalValidateBtn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const input = document.getElementById("modalPredictionInput");
    const overlay = document.getElementById("predictionModalOverlay");

    const model = ChialeuxUI.model;
    const index = ChialeuxUI.currentIndex;

    if (!model || index == null) return;

    const raw = input.value;
    const value = Number(raw);
    const maxCards = model.cardsThisRound || 10;

    // Validation locale : 0..cardsThisRound
    if (!Number.isFinite(value)) return;
    if (value < 0 || value > maxCards) return;

    try {
      await window.ModChialeux.submitPrediction(index, value);
    } catch (err) {
      console.error("[chialeux] erreur submitPrediction:", err);
      return;
    }

    // On ferme la modale après la prédiction
    overlay.classList.add("hidden");
    input.disabled = true;
    btn.disabled = true;
    // Le reste sera mis à jour via Firestore → onModelUpdate()
  });
}

function openPredictionModalForIndex(index, model) {
  const overlay = document.getElementById("predictionModalOverlay");
  const nameEl = document.getElementById("modalPlayerName");
  const input = document.getElementById("modalPredictionInput");
  const btn = document.getElementById("modalValidateBtn");

  const players = model.players || [];
  const player = players[index];
  const playerName = player && player.name ? player.name : `Joueur ${index + 1}`;

  const maxCards = model.cardsThisRound || 10;

  if (nameEl) nameEl.textContent = playerName;

  if (input) {
    input.value = "";
    input.min = 0;
    input.max = maxCards;
    input.disabled = false;
  }

  if (btn) {
    btn.disabled = false;
  }

  if (overlay) {
    overlay.classList.remove("hidden");
  }
}

/* --- Modale Résultats (levées) --- */

function initResultsModal() {
  const btn = document.getElementById("resultModalValidateBtn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const model = ChialeuxUI.model;
    if (!model) return;

    const myIndex = model.myIndex;
    if (myIndex == null) return;

    const input = document.getElementById("resultModalInput");
    if (!input) return;

    const raw = input.value;
    const value = Number(raw);
    const maxCards = model.cardsThisRound || 10;

    if (!Number.isFinite(value)) return;
    if (value < 0 || value > maxCards) return;

    try {
      await window.ModChialeux.submitResult(myIndex, value);
    } catch (err) {
      console.error("[chialeux] erreur submitResult:", err);
      return;
    }
  });
}

/**
 * Gestion de l'affichage de la modale résultats.
 * - visible pour tous en mode "results"
 * - chaque joueur ne peut saisir que son propre nombre de levées
 * - si tous ont saisi et que la somme est correcte -> la modale se ferme
 * - si erreur de somme -> resultsError = true et les champs sont à ressaisir
 */
function handleResultsModal(model) {
  const overlay = document.getElementById("resultModalOverlay");
  const nameEl = document.getElementById("resultModalPlayerName");
  const input = document.getElementById("resultModalInput");
  const btn = document.getElementById("resultModalValidateBtn");

  if (!overlay || !input || !btn) return;

  const status = model.status || "prediction";
  if (status !== "results") {
    hideResultModal();
    return;
  }

  const players = model.players || [];
  const results = model.results || {};
  const myIndex = model.myIndex;

  if (myIndex == null) {
    hideResultModal();
    return;
  }

  const playerCount = players.length;
  const keysCount = Object.keys(results).length;
  const allSubmitted = playerCount > 0 && keysCount >= playerCount;

  // Si tout le monde a soumis et qu'il n'y a pas d'erreur -> on ferme la modale
  if (allSubmitted && !model.resultsError) {
    hideResultModal();
    return;
  }

  // Sinon : la modale reste ouverte pour tout le monde
  overlay.classList.remove("hidden");

  const player = players[myIndex];
  const playerName = player && player.name ? player.name : `Joueur ${myIndex + 1}`;
  if (nameEl) nameEl.textContent = playerName;

  const myValue = Object.prototype.hasOwnProperty.call(results, myIndex)
    ? results[myIndex]
    : null;

  const maxCards = model.cardsThisRound || 10;
  input.min = 0;
  input.max = maxCards;

  if (myValue === null || myValue === undefined) {
    input.value = "";
    input.disabled = false;
    btn.disabled = false;
  } else {
    input.value = myValue;
    input.disabled = true;
    btn.disabled = true;
  }
}

/* --- Contrôles hôte (boutons) --- */

function initHostControls() {
  const btnStartResults = document.getElementById("btnStartResults");
  if (btnStartResults) {
    btnStartResults.addEventListener("click", async () => {
      try {
        await window.ModChialeux.startResultsPhase();
      } catch (err) {
        console.error("[chialeux] erreur startResultsPhase:", err);
      }
    });
  }

  // btnSetup et btnFinish seront branchés plus tard
}

function updateHostControls(model) {
  const hostControls = document.getElementById("hostControls");
  if (!hostControls) return;

  const isHost = !!model.isHost;
  if (isHost) {
    hostControls.classList.remove("hidden");
  } else {
    hostControls.classList.add("hidden");
  }
}

/* --- Utilitaires pour masquer les modales et erreurs --- */

function hidePredictionModal() {
  const overlay = document.getElementById("predictionModalOverlay");
  const input = document.getElementById("modalPredictionInput");
  const btn = document.getElementById("modalValidateBtn");

  if (overlay) overlay.classList.add("hidden");
  if (input) input.disabled = true;
  if (btn) btn.disabled = true;

  ChialeuxUI.currentIndex = null;
}

function hideResultModal() {
  const overlay = document.getElementById("resultModalOverlay");
  const input = document.getElementById("resultModalInput");
  const btn = document.getElementById("resultModalValidateBtn");

  if (overlay) overlay.classList.add("hidden");
  if (input) input.disabled = false; // ne préjuge pas de l'état futur
  if (btn) btn.disabled = false;
}

function updateRoundError(hasError, message) {
  const div = document.getElementById("roundError");
  if (!div) return;

  if (!hasError) {
    div.textContent = "";
    div.classList.add("hidden");
  } else {
    div.textContent = message || "";
    div.classList.remove("hidden");
  }
}

/* --- Utilitaire DOMContentLoaded --- */

function onReady(fn) {
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", fn);
  else
    fn();
}
