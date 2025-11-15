// dame_de_pique_rounds.js
// Version v7.5.x — logique de rondes pour Dame de Pique (clé inputs = deviceId)

import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

/**
 * Règle de passe en fonction du numéro de ronde.
 * 1 → À droite, 2 → À gauche, 3 → Au centre, 4 → Garde tes cartes, puis ça recommence.
 */
function computePassRule(round) {
  const rules = ["À droite", "À gauche", "Au centre", "Garde tes cartes"];
  const n = Number(round);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const idx = (n - 1) % rules.length;
  return rules[idx] || "—";
}

/**
 * Calcule un résumé de la ronde à partir :
 * - de la liste des joueurs (avec leur deviceId),
 * - des inputs dans Firestore (inputs.<deviceId> = score).
 *
 * Objectif :
 * - reconstruire perRound dans l'ordre des joueurs,
 * - savoir si tout le monde a un score,
 * - vérifier si la somme fait 25,
 * - détecter un éventuel grand chelem (un seul joueur à 25, les autres à 0).
 */
function computeRoundSummary(players, inputs) {
  const ordered = (players || []).slice().sort(
    (a, b) => (a?.order ?? 0) - (b?.order ?? 0)
  );

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

  // Grand chelem : 1 seul joueur à 25, les autres à 0.
  let grandIndex = -1;
  let isGrand = false;

  if (isComplete && isValid25) {
    const nonZero = [];
    perRound.forEach((v, idx) => {
      if (v && v !== 0) nonZero.push(idx);
    });
    if (nonZero.length === 1 && perRound[nonZero[0]] === 25) {
      isGrand = true;
      grandIndex = nonZero[0];
    }
  }

  return {
    isComplete,
    isValid25,
    isGrandChelem: isGrand,
    grandChelemIndex: grandIndex,
    sum,
    perRound
  };
}

/**
 * Applique la ronde lorsqu'elle est complète et valide :
 * - si grand chelem : le joueur à 25 → 0, les autres → 25,
 * - met à jour les totaux cumulés,
 * - enregistre lastRound (perRound, values, sum, etc.),
 * - passe à la ronde suivante.
 */
async function applyRoundScore(db, gid, state, summary) {
  if (!db || !gid) throw new Error("applyRoundScore: db ou gid manquant");

  const ref = doc(db, "scores_dame_de_pique", gid);

  const players = (state.players || []).slice().sort(
    (a, b) => (a?.order ?? 0) - (b?.order ?? 0)
  );

  // On part de perRound, puis on applique éventuellement le grand chelem
  let roundVals = summary.perRound.slice();

  if (summary.isGrandChelem && summary.grandChelemIndex >= 0) {
    roundVals = roundVals.map((v, idx) => (idx === summary.grandChelemIndex ? 0 : 25));
  }

  const prevTotals = state.totals || {};
  const newTotals = { ...prevTotals };

  players.forEach((p, idx) => {
    const key = p && p.id != null ? String(p.id) : String(idx);
    const prev = Number.isFinite(prevTotals[key]) ? prevTotals[key] : 0;
    const add = Number.isFinite(roundVals[idx]) ? roundVals[idx] : 0;
    newTotals[key] = prev + add;
  });

  const roundNumber = Number.isFinite(state.round) ? state.round : 1;

  const payload = {
    lastRound: {
      appliedGrandChelem: !!summary.isGrandChelem,
      controleIndex: summary.grandChelemIndex ?? -1,
      perRound: summary.perRound,
      round: roundNumber,
      sum: roundVals.reduce((a, b) => a + (Number(b) || 0), 0),
      values: roundVals
    },
    totals: newTotals,
    round: roundNumber + 1,
    roundError: "",
    gameOver: false
  };

  await updateDoc(ref, payload);

  // On met aussi à jour le state local pour que l'UI soit cohérente
  state.totals = newTotals;
  state.round = roundNumber + 1;
}

window.ModRounds = {
  computePassRule,
  computeRoundSummary,
  applyRoundScore
};
