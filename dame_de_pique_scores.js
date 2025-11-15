// dame_de_pique_scores.js
// Version: retour au comportement antérieur (clé = deviceId pour inputs)

import { doc, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

/**
 * Essaie de reconstruire les totaux à partir du document scores_dame_de_pique.
 * (même logique que précédemment, on garde ça tel quel)
 */
function extractTotals(data){
  // 1) totals direct
  if (data && data.totals && typeof data.totals === "object" && !Array.isArray(data.totals)) {
    return data.totals;
  }

  // 2) standings.totals
  if (data && data.standings && typeof data.standings === "object" && !Array.isArray(data.standings)) {
    return data.standings;
  }

  // 3) lastRound.perRound comme secours
  if (data && data.lastRound && Array.isArray(data.lastRound.perRound)) {
    const o = {};
    data.lastRound.perRound.forEach((v, i) => {
      o[String(i)] = Number(v) || 0;
    });
    return o;
  }

  return null;
}

/**
 * Écrit le score de CE téléphone dans inputs.<deviceId>,
 * comme dans ta version stable précédente.
 * → clé = deviceId, ce qui permet de retrouver le joueur si le téléphone revient.
 */
async function writeScore(db, gid, state, value){
  if (!db || !gid) throw new Error("writeScore: db ou gid manquant");

  const deviceId = window.ModInit?.deviceId;
  if (!deviceId) {
    throw new Error("writeScore: deviceId manquant (auth/initialisation incomplète).");
  }

  const s = Number(value);
  if (!Number.isFinite(s)) {
    throw new Error("writeScore: score invalide.");
  }

  const ref = doc(db, "scores_dame_de_pique", gid);

  // On écrit directement inputs.<deviceId> dans Firestore
  await updateDoc(ref, { ["inputs."+deviceId]: s });

  // On met aussi à jour l'état local (state.currentInputs) pour rafraîchir l'UI
  const currentInputs = state.currentInputs || {};
  const newInputs = { ...currentInputs, [deviceId]: s };

  state.currentInputs = newInputs;
  return newInputs;
}

window.ModScores = {
  extractTotals,
  writeScore
};
