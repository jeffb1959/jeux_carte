import { doc, updateDoc, getDoc, deleteField } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

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
    expected,
    filledCount,
    isComplete,
    isValid25,
    isGrandChelem: isGrand,
    grandChelemIndex: grandIndex
  };
}

// Applique une ronde complétée aux totaux et écrit dans Firestore
async function applyRoundScore(summary){
  const modInit = window.ModInit;
  if (!modInit) {
    console.warn('[applyRoundScore] ModInit manquant');
    return;
  }
  const { state, getDb } = modInit;
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
  for (let i = 0; i < n; i++) {
    const key = String(i);
    const raw = state.totals && Object.prototype.hasOwnProperty.call(state.totals, key)
      ? state.totals[key]
      : 0;
    const v = Number(raw||0);
    baseTotals[i] = Number.isFinite(v) ? v : 0;
  }

  const perRound = summary.perRound || [];
  const roundVals = new Array(n).fill(0);

  if (summary.isGrandChelem && summary.grandChelemIndex >= 0 && summary.grandChelemIndex < n) {
    // Grand chelem : le joueur gagnant prend 0, les autres 25
    for (let i = 0; i < n; i++) {
      roundVals[i] = (i === summary.grandChelemIndex) ? 0 : 25;
    }
  } else {
    // Cas normal : on applique les valeurs telles quelles
    for (let i = 0; i < n; i++) {
      const v = perRound[i];
      roundVals[i] = Number.isFinite(v) ? v : 0;
    }
  }

  const newTotalsArr = [];
  for (let i = 0; i < n; i++) {
    newTotalsArr[i] = baseTotals[i] + roundVals[i];
  }

  // Détection de fin de partie : >= 100 points
  let gameOver = false;
  let winnerId = null;

  let minTotal = Infinity;
  let minIdx = -1;
  for (let i = 0; i < n; i++) {
    if (newTotalsArr[i] < minTotal) {
      minTotal = newTotalsArr[i];
      minIdx = i;
    }
  }
  if (minIdx >= 0 && playersOrdered[minIdx]) {
    const did = playersOrdered[minIdx].deviceId;
    if (did) {
      winnerId = did;
    }
  }

  // Si au moins un joueur atteint 100 ou plus → fin de partie
  if (newTotalsArr.some(v => v >= 100)) {
    gameOver = true;
  }

  // Map "p1","p2",... pour compatibilité avec ton schema existant
  const totalsMap = {};
  newTotalsArr.forEach((v,i)=>{
    totalsMap['p'+(i+1)] = v;
  });

  const roundNumber = state.round || 1;
  
console.warn(">>> DEBUG soireeCode =", soireeCode);
  
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

async function finishGameNow(){
  try{
    const modInit = window.ModInit || {};
    const state = modInit.state;
    const getDb = modInit.getDb;
    if(!state || !getDb){
      console.warn('[finishGameNow] ModInit/state/getDb manquants');
      return;
    }
    const db = getDb();
    if(!db){
      console.warn('[finishGameNow] DB indisponible');
      return;
    }
    if(!state.gameId){
      console.warn('[finishGameNow] gameId manquant');
      return;
    }
        // On essaie d'avoir un soireeCode fiable.
    // 1) D'abord celui qui vient de l'URL (state.soireeCode)
    let soireeCode = state.soireeCode ? String(state.soireeCode).replace(/\D/g,"").slice(0,4) : "";

    // 2) Si on ne l'a pas, on le récupère depuis le doc de scores (champ "code")
    if (!soireeCode && state.gameId) {
      try {
        const scoreRef = doc(db, 'scores_dame_de_pique', state.gameId);
        const snapScore = await getDoc(scoreRef);
        if (snapScore.exists()) {
          const dataScore = snapScore.data();
          if (dataScore && dataScore.code) {
            soireeCode = String(dataScore.code).replace(/\D/g,"").slice(0,4);
            console.debug('[finishGameNow] soireeCode récupéré depuis scores_dame_de_pique:', soireeCode);
          }
        }
      } catch (e) {
        console.warn('[finishGameNow] impossible de lire scores_dame_de_pique pour retrouver le code de soirée :', e);
      }
    }
    
    const playersOrdered = (state.players||[]).slice().sort((a,b)=>(a?.order??0)-(b?.order??0));
    const n = playersOrdered.length;

    let winnerId = null;

    if(n>0){
      let minTotal = Infinity;
      let minIdx = -1;
      for(let i=0;i<n;i++){
        const key = String(i);
        const rawVal = state.totals && Object.prototype.hasOwnProperty.call(state.totals, key)
          ? state.totals[key]
          : 0;
        const v = Number(rawVal||0);
        if(v < minTotal){
          minTotal = v;
          minIdx = i;
        }
      }
      if(minIdx>=0 && playersOrdered[minIdx] && playersOrdered[minIdx].deviceId){
        winnerId = playersOrdered[minIdx].deviceId;
      }
    }
  
    const ref = doc(db, 'scores_dame_de_pique', state.gameId);
    const payload = {
      gameOver: true,
      winnerId: winnerId || null,
      roundError: "",
      inputs: {}
    };

    await updateDoc(ref, payload);
        // Après avoir marqué la partie terminée dans scores_dame_de_pique,
    // on marque aussi la soirée comme "finished" pour stopper les redirections.
    if (soireeCode) {
      const soireeRef = doc(db, 'soirees', soireeCode);
      await updateDoc(soireeRef, {
        currentGame: deleteField()
      });
    }


    console.debug('[finishGameNow] Partie marquée terminée (gameOver=true).');
     
    if (soireeCode) {
      try {
        const soireeRef = doc(db, 'soirees', soireeCode);
        await updateDoc(soireeRef, {
          status: 'finished'
        });
        console.debug('[finishGameNow] status=finished mis à jour dans soirees pour', soireeCode);
      } catch (e) {
        console.warn('[finishGameNow] impossible de mettre à jour le status de la soirée :', e);
      }
    } else {
      console.warn('[finishGameNow] soireeCode introuvable, impossible de mettre status=finished');
    }


    state.gameOver = true;
    state.currentInputs = {};
  }catch(e){
    console.error('[finishGameNow] erreur finishGameNow:', e);
  }
}

function checkGameOver(){ return false; } // pas utilisé directement ici

window.ModRounds = { computePassRule, computeRoundSummary, applyRoundScore, checkGameOver, finishGameNow };




