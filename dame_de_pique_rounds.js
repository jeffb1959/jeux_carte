// Calcule un résumé de ronde à partir des inputs Firestore (clé = deviceId)
function computeRoundSummary(players, inputs){
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

  // Grand Chelem : un seul joueur à 25, tous les autres à 0
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

window.ModRounds = {
  computePassRule,
  computeRoundSummary,
  applyRoundScore
};
