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
  currentIndex: null  // index du joueur dont la modale est ouverte sur CE device
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

  // 5) Préparation de la modale (bouton Valider)
  initPredictionModal();
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

  // 4) Décider si on doit ouvrir la modale sur CE device
  handleModalForCurrentTurn(model);
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

    if (predictionTurnIndex === index) {
      row.classList.remove("player-pending", "player-done");
      row.classList.add("player-current"); // vert foncé = joueur en cours
    }
  });
}

/* --- Gestion de la modale selon le tour et le statut --- */

function handleModalForCurrentTurn(model) {
  const myIndex = model.myIndex;
  const predictionTurnIndex = model.predictionTurnIndex;
  const status = model.status || "prediction";

  const overlay = document.getElementById("predictionModalOverlay");
  const input = document.getElementById("modalPredictionInput");
  const btn = document.getElementById("modalValidateBtn");

  // Modale fermée si on n'est pas en phase "prediction"
  if (status !== "prediction") {
    if (overlay) overlay.classList.add("hidden");
    if (input) input.disabled = true;
    if (btn) btn.disabled = true;
    ChialeuxUI.currentIndex = null;
    return;
  }

  if (myIndex == null || predictionTurnIndex == null) {
    // Ce device est spectateur ou tous ont déjà prédit
    if (overlay) overlay.classList.add("hidden");
    if (input) input.disabled = true;
    if (btn) btn.disabled = true;
    ChialeuxUI.currentIndex = null;
    return;
  }

  if (myIndex !== predictionTurnIndex) {
    // Ce n'est pas mon tour
    if (overlay) overlay.classList.add("hidden");
    if (input) input.disabled = true;
    if (btn) btn.disabled = true;
    ChialeuxUI.currentIndex = null;
    return;
  }

  // Ici : c'est au tour de CE joueur (device) de faire sa prédiction
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

/* --- Utilitaire DOMContentLoaded --- */

function onReady(fn) {
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", fn);
  else
    fn();
}
