const $ = (id)=>document.getElementById(id);

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

window.ModInit = {
  app: null,
  db: null,
  auth: null,
  state: {
    players: [],
    totals: {},
    round: 1,
    dealerIndex: 0,
    currentInputs: {},
    gameOver: false,
    winnerId: null
  }
};

function initFirebase(){
  if (getApps().length === 0) {
    const app = initializeApp(window.firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    window.ModInit.app = app;
    window.ModInit.auth = auth;
    window.ModInit.db = db;
    signInAnonymously(auth).catch(console.error);
  }
}

function initAuthListener(){
  const { auth } = window.ModInit;
  if (!auth) return;
  onAuthStateChanged(auth, user=>{
    if (user) {
      const uid = user.uid;
      let deviceId = localStorage.getItem('deviceId');
      if(!deviceId){
        deviceId = String(Date.now())+"_"+Math.random().toString(36).slice(2);
        localStorage.setItem('deviceId',deviceId);
      }
      window.ModInit.deviceId = deviceId;
      diagnosticsPush([`✅ Connecté (auth anonyme) uid=${uid}, deviceId=${deviceId}`]);
    } else {
      diagnosticsPush(["⚠️ Utilisateur déconnecté (auth)."]);
    }
  });
}

function getCodeFromUrl(){
  const p = new URLSearchParams(window.location.search);
  const code = (p.get('code') || "").trim().toUpperCase();
  return code || null;
}

function diagnosticsPush(lines){
  const d = document.getElementById('diagOutput');
  if(d) d.textContent = lines.join('\n');
}

function bootstrapInit(){
  initFirebase();
  const code = getCodeFromUrl();
  if(!code){
    diagnosticsPush(["❌ Aucun code de soirée dans l’URL (?code=...)."]);
    return;
  }
  document.getElementById('code').textContent = code;
  diagnosticsPush([`🔗 Code soirée détecté: ${code}`]);
  initAuthListener();
}

bootstrapInit();
