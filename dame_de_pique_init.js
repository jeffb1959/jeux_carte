const $ = (id)=>document.getElementById(id);

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const state = {
  soireeCode: "",
  gameId: "",
  players: [],
  dealerIndex: 0,
  round: 1,
  totals: {},
  roundScores: {},
  isHost: false,
  gameOver: false,
  lastRound: null,
  lastRoundPer: null,
  authUid: null,
  deviceId: null,
  currentInputs: {},
  scoresRaw: null,
  winnerId: null,   // suivi du gagnant éventuel
  _db: null
};

function readUrl(){
  const qs = new URLSearchParams(location.search);
  state.soireeCode = String(qs.get("code")||"").replace(/\D/g,"").slice(0,4);
  state.gameId     = String(qs.get("gid")||"");
  if(state.soireeCode) $("code").textContent = state.soireeCode;
}

// Résolution du deviceId au démarrage (URL ?did=... ou localStorage)
function resolveDeviceIdAtBoot() {
  try {
    const qs = new URLSearchParams(location.search);
    const fromUrl = qs.get("did");
    if (fromUrl) {
      state.deviceId = fromUrl;
      try { localStorage.setItem("deviceId", fromUrl); } catch(_) {}
      return;
    }

    const stored =
      localStorage.getItem("deviceId") ||
      localStorage.getItem("dame_de_pique_deviceId");

    if (stored) {
      state.deviceId = stored;
      return;
    }

    console.warn("[boot] Aucun deviceId trouvé dans l'URL ni le localStorage.");
  } catch (e) {
    console.warn("[boot] Erreur lors de la résolution du deviceId :", e);
  }
}

function bootUi(){
  $("round").textContent = String(state.round);
  $("dealerName").textContent = "—";
}

async function ensureAuth(){
  if(!window.firebaseConfig){
    console.warn("[ensureAuth] firebaseConfig manquant — lecture désactivée.");
    return null;
  }
  const app = getApps().length ? getApps()[0] : initializeApp(window.firebaseConfig);
  const auth = getAuth(app);
  const db   = getFirestore(app);
  state._db  = db;
  try{
    await signInAnonymously(auth);
  }catch(e){
    if(!auth.currentUser) throw e;
  }
  return new Promise((resolve)=>
    onAuthStateChanged(auth, (user)=>{
      state.authUid = user?.uid || null;
      resolve({ app, auth, db, uid: state.authUid });
    })
  );
}

function getDb(){ return state._db; }

async function boot(){
  readUrl();
  resolveDeviceIdAtBoot();
  bootUi();
}

window.ModInit = { state, boot, ensureAuth, getDb };
