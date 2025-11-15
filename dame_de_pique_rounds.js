import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

function computePassRule(round){
  const rules=['À droite','À gauche','Au centre','Garde tes cartes'];
  return rules[(Math.max(1,round)-1)%4];
}

// Calcule un résumé de ronde à partir des inputs Firestore (local, sans écriture)
function computeRoundSummary(players, inputs){
  const ordered = (players||[]).slice().sort((a,b)=>(a?.order??0)-(b?.order??0));
  const perRound = [];
  let sum = 0;
  let filledCount = 0;

  ordered.forEach((p, idx) => {
    const did = p && p.deviceId;
    let v = null;
    if (did && inputs && Object.prototype.hasOwnProperty.call(inputs, did)) {
      v = Number(inputs[did]);
      if (!Number.isFinite(v)) v = 0;
      filledCount++;
    }
    perRound[idx] = v;
    if (v != null) sum += v;
  });

  const expected = ordered.length;
  const isComplete = expected > 0 && filledCount === expected;
  const isValid25 = isComplete && sum === 25;

  // Grand Chelem : un seul joueur à 25, tous les autres à 0
  let grandIndex = -1;
  let isGrand = false;
  if (isComplete && isValid25) {
    const nonZero = [];
    perRound.forEach((v,i)=>{
      if (v && v > 0) nonZero.push({v,i});
    });
    if (nonZero.length === 1 && nonZero[0].v === 25) {
      isGrand = true;
      grandIndex = nonZero[0].i;
    }
  }

  return {
    perRound,
    sum,
    isComplete,
    isValid25,
    isGrandChelem: isGrand,
    grandChelemIndex: grandIndex
  };
}

// Écrit la ronde et les totaux dans Firestore quand la somme vaut 25
async function applyRoundScore(summary){
  const mod = window.ModInit || {};
  const state = mod.state || {};
  const getDb = mod.getDb;

  if (!getDb) {
    console.warn('[applyRoundScore] getDb absent');
    return;
  }
  const db = getDb();
  if (!db) {
    console.warn('[applyRoundScore] DB indisponible');
    return;
  }
  if (!state.gameId) {
    console.warn('[applyRoundScore] gameId manquant');
    return;
  }

  // 🔒 Si la partie est déjà terminée, on ne touche plus aux scores
  if (state.scoresRaw && state.scoresRaw.gameOver === true) {
    console.warn('[applyRoundScore] Partie déjà terminée (gameOver=true). Aucune nouvelle ronde appliquée.');
    return;
  }

  if (!summary || !summary.isComplete || !summary.isValid25) {
    return; // rien à faire si la ronde n'est pas complète ou invalide
  }

  const playersOrdered = (state.players||[]).slice().sort((a,b)=>(a?.order??0)-(b?.order??0));
  const n = playersOrdered.length;
  if (!n) return;

  // Totaux de base (normalisés "0","1",...)
  const baseTotals = [];
  for (let i=0;i<n;i++){
    const key = String(i);
    baseTotals[i] = Number(state.totals?.[key] || 0);
  }

  // Points de la ronde (après éventuel Grand Chelem)
  let roundVals = summary.perRound.slice();
  if (summary.isGrandChelem && summary.grandChelemIndex >= 0) {
    roundVals = roundVals.map((v,idx)=> idx===summary.grandChelemIndex ? 0 : 25);
  }

  const newTotalsArr = baseTotals.map((t,i)=> t + (Number(roundVals[i])||0));

  // Détermination de fin de partie
  let gameOver = false;
  let winnerId = null;
  let maxTotal = -Infinity;
  newTotalsArr.forEach(v => { if (v>maxTotal) maxTotal = v; });
  if (Number.isFinite(maxTotal) && maxTotal >= 100) {
    gameOver = true;
    let minTotal = Infinity;
    let winIndex = -1;
    newTotalsArr.forEach((v,i)=>{
      if (v < minTotal) {
        minTotal = v;
        winIndex = i;
      }
    });
    if (winIndex >= 0 && playersOrdered[winIndex] && playersOrdered[winIndex].deviceId) {
      winnerId = playersOrdered[winIndex].deviceId;
    }
  }

  // Map "p1","p2",... pour compatibilité avec ton schema existant
  const totalsMap = {};
  newTotalsArr.forEach((v,i)=>{
    totalsMap['p'+(i+1)] = v;
  });

  const roundNumber = state.round || 1;

  const ref = doc(db, 'scores_dame_de_pique', state.gameId);
  const payload = {
    lastRound: {
      appliedGrandChelem: !!summary.isGrandChelem,
      controleIndex: -1,
      perRound: roundVals,
      round: roundNumber,
      sum: roundVals.reduce((a,b)=> a + (Number(b)||0), 0),
      values: roundVals
    },
    totals: totalsMap,
    round: roundNumber + 1,
    gameOver: gameOver,
    winnerId: gameOver ? (winnerId || null) : null,
    roundError: "",
    // on vide les inputs pour forcer une nouvelle saisie à la ronde suivante
    inputs: {}
  };

  try{
    await updateDoc(ref, payload);
    console.debug('[applyRoundScore] Ronde appliquée et totaux mis à jour.');
  }catch(e){
    console.error('[applyRoundScore] erreur updateDoc:', e);
  }
}

function checkGameOver(){ return false; } // pas utilisé directement ici

window.ModRounds = { computePassRule, computeRoundSummary, applyRoundScore, checkGameOver };
