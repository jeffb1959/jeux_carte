import { doc, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
let unsubscribeScores=null;

function extractTotals(data){
  // 1) totals direct (objet)
  if (data && typeof data.totals === 'object' && !Array.isArray(data.totals)) {
    const t = data.totals;
    const keys = Object.keys(t);
    const looksLikePN = keys.length && keys.every(k => /^p\d+$/i.test(k));
    if (looksLikePN) {
      const out = {};
      for (const k of keys) {
        const n = parseInt(k.slice(1), 10);
        const idx = Number.isFinite(n) ? n-1 : null;
        if (idx != null && idx >= 0) out[String(idx)] = Number(t[k]) || 0;
      }
      return out;
    }
    return t;
  }

  // 2) standings.totals (si jamais utilisé plus tard)
  if (data && data.standings && typeof data.standings.totals === 'object') {
    return data.standings.totals;
  }

  // 3) standings objet simple
  if (data && data.standings && typeof data.standings === 'object' && !Array.isArray(data.standings)) {
    return data.standings;
  }

  // 4) lastRound.perRound comme fallback (dernier tour uniquement)
  if (data && data.lastRound && Array.isArray(data.lastRound.perRound)) {
    const o = {}; data.lastRound.perRound.forEach((v,i)=> o[String(i)] = Number(v)||0);
    return o;
  }

  return null;
}

function extractRound(data){
  if (data && Number.isInteger(data.round)) return data.round;
  if (data && data.roundState && Number.isInteger(data.roundState.round)) return data.roundState.round;
  if (data && data.lastRound && Number.isInteger(data.lastRound.round)) return data.lastRound.round;
  return null;
}

function listenScores(db, gid, onData){
  if(!db||!gid){ console.warn("[listenScores] db/gid manquant"); return ()=>{}; }
  if(unsubscribeScores){ try{unsubscribeScores();}catch(_){} unsubscribeScores=null; }
  const ref = doc(db, "scores_dame_de_pique", gid);
  unsubscribeScores = onSnapshot(
    ref,
    (snap)=>{
      if(!snap.exists()){ onData?.(null); return; }
      const raw = snap.data()||{};
      const inputs = (raw.inputs && typeof raw.inputs === "object" && !Array.isArray(raw.inputs))
        ? raw.inputs
        : {};
      try{
        if (window.ModInit && window.ModInit.state) {
          window.ModInit.state.currentInputs = inputs;
          window.ModInit.state.scoresRaw = raw;
          window.ModInit.state.gameOver = !!raw.gameOver;
          window.ModInit.state.winnerId = raw.winnerId || null;
        }
      }catch(_){}

      const totals = extractTotals(raw);
      const round  = extractRound(raw);
      const extra  = { lastRoundPer: (raw.lastRound && Array.isArray(raw.lastRound.perRound)) ? raw.lastRound.perRound : null };
      onData?.({ totals, round, extra, raw });
    },
    (err)=> console.error("[listenScores] erreur snapshot:", err)
  );
  return ()=>{ if(unsubscribeScores) unsubscribeScores(); };
}

async function submitScoreForCurrentDevice(score){
  const mod = window.ModInit || {};
  const state = mod.state || {};
  const getDb = mod.getDb;
  if (!getDb) {
    console.warn("[submitScore] getDb absent");
    return;
  }
  const db = getDb();
  if (!db) {
    console.warn("[submitScore] DB indisponible");
    return;
  }
  if (!state.gameId) {
    console.warn("[submitScore] gameId manquant");
    return;
  }
  if (!state.deviceId) {
    console.warn("[submitScore] deviceId non initialisé (vérifier resolveDeviceIdAtBoot).");
    return;
  }
  const s = Number(score);
  if (!Number.isFinite(s)) {
    console.warn("[submitScore] score invalide");
    return;
  }

  const ref = doc(db, "scores_dame_de_pique", state.gameId);
  try{
    await updateDoc(ref, { ["inputs."+state.deviceId]: s });
  }catch(e){
    console.error("[submitScore] erreur updateDoc:", e);
  }
}

window.ModScores = { listenScores, submitScoreForCurrentDevice };
