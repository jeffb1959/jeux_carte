const $=(id)=>document.getElementById(id);

function renderPlayers(){
  const { state } = window.ModInit;
  const { computePassRule } = window.ModRounds;

  const host = $('playersList');
  if (!host) return;
  host.innerHTML = '';

  // Liste des joueurs triée dans l'ordre réel des sièges
  const players = (state.players || [])
    .slice()
    .sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0));

  const playerCount = players.length;

  // Index de base = brasseur du premier tour (leaderIndex)
  let baseDealerIndex = Number.isInteger(state.dealerIndex) ? state.dealerIndex : 0;
  if (baseDealerIndex < 0) baseDealerIndex = 0;
  if (playerCount > 0 && baseDealerIndex >= playerCount) {
    baseDealerIndex = baseDealerIndex % playerCount;
  }

  // Numéro de ronde (au moins 1)
  const roundNumber = Number.isInteger(state.round) ? state.round : 1;

  // Décalage en fonction de la ronde (0 pour la 1re, 1 pour la 2e, etc.)
  const offset = playerCount > 0 ? (roundNumber - 1 + playerCount) % playerCount : 0;

  // Index du brasseur pour la ronde actuelle
  const currentDealerIndex = playerCount > 0 ? (baseDealerIndex + offset) % playerCount : 0;

  // Rendu de la liste des joueurs
  players.forEach((p, idx) => {
    const row = document.createElement('div');
    row.className = 'line';

    const name = document.createElement('div');
    name.textContent = p?.name || `Joueur ${idx + 1}`;

    // Badge "Brasseur" sur le joueur courant
    if (idx === currentDealerIndex) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'Brasseur';
      name.appendChild(badge);
    }

    const val = document.createElement('div');
    val.className = 'muted';
    const key = (p && p.id != null) ? String(p.id) : String(idx);
    const total = Number.isFinite(state.totals?.[key]) ? state.totals[key] : 0;
    val.textContent = `Total: ${total}`;

    row.appendChild(name);
    row.appendChild(val);
    host.appendChild(row);
  });

  const pass = computePassRule(state.round);

  // Brasseur courant pour l'en-tête
  const dealerPlayer = players[currentDealerIndex] || null;
  const dealerName = dealerPlayer && dealerPlayer.name ? dealerPlayer.name : '—';

  const dealerEl = $('dealerName');      // ✅ sécurité ajoutée
  if (dealerEl) {
    dealerEl.textContent = dealerName;
  }

  $('round').textContent = String(state.round);

  const meta = document.getElementById('meta');
  if (meta) {
    const codeSoiree = state.soireeCode || '';
    const gameId = state.gameId || '';
    meta.innerHTML =
      `Code soirée: <strong id="code">${codeSoiree}</strong>` +
      ` • GID: <span id="gameId">${gameId}</span>` +
      ` • Brasseur: <strong id="dealerName">${dealerName}</strong>`;
  }

  const passEl = document.getElementById('passRule');
  if (passEl) passEl.textContent = `Règle : ${pass}`;
}


function renderTotals(){
  const { state } = window.ModInit;
  const host = document.getElementById('totals');

  // Si l'élément existe (ancienne UI ou futur besoin), on le remplit,
  // sinon on saute seulement cette partie visuelle.
  if (host) {
    host.innerHTML = '';

    (state.players||[]).forEach((p,idx)=>{
      const line=document.createElement('div'); line.className='line';
      const n=document.createElement('div'); n.textContent=p?.name||`Joueur ${idx+1}`;
      const v=document.createElement('div');
      const key = (p.id!=null)? String(p.id): String(idx);
      const total = Number.isFinite(state.totals?.[key]) ? state.totals[key] : 0;
      v.textContent=String(total);
      line.appendChild(n); line.appendChild(v); host.appendChild(line);
    });
  }

  // Statut de la ronde basé sur les inputs Firestore
  const inputs = state.currentInputs || {};
  const submitted = Object.keys(inputs).length;
  const expected = (state.players||[]).length;
  const rs = document.getElementById('roundStatus');
  if (rs) rs.textContent = `${submitted}/${expected} soumis`;

  const re = document.getElementById('roundError');
  if (re) {
    const { computeRoundSummary, applyRoundScore } = window.ModRounds;

    // 🔚 Cas 1 : partie déjà terminée
    if (state.gameOver) {
      if (rs) rs.textContent = "Partie terminée.";

      // Désactiver le bouton "Inscrire mon pointage"
      const btn = document.getElementById('btnOpenScore');
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Partie terminée";
      }

      // Chercher le gagnant (si winnerId connu)
      let winnerName = "—";
      let winnerTotal = null;

      const ordered = (state.players||[]).slice().sort((a,b)=>(a?.order??0)-(b?.order??0));

      if (state.winnerId) {
        const idx = ordered.findIndex(p => p && p.deviceId === state.winnerId);
        if (idx >= 0) {
          winnerName = ordered[idx].name || `Joueur ${idx+1}`;
          const key = String(idx);
          winnerTotal = Number(state.totals?.[key] || 0);
        }
      }

      // Si winnerId manquant, on essaie de déterminer le plus petit total
      if (winnerName === "—") {
        let minTotal = Infinity;
        let minIdx = -1;
        Object.keys(state.totals || {}).forEach(k=>{
          const v = Number(state.totals[k] || 0);
          if (v < minTotal) {
            minTotal = v;
            minIdx = parseInt(k,10);
          }
        });
        if (minIdx >= 0 && ordered[minIdx]) {
          winnerName = ordered[minIdx].name || `Joueur ${minIdx+1}`;
          winnerTotal = minTotal;
        }
      }

      if (winnerTotal != null) {
        re.textContent = `Partie terminée. Gagnant : ${winnerName} avec ${winnerTotal} points.`;
      } else {
        re.textContent = `Partie terminée. Gagnant : ${winnerName}.`;
      }

      // On ne fait plus de validation de ronde ni d'appel à applyRoundScore
      return;
    }

    // 🔁 Cas 2 : partie en cours → logique de validation de ronde
    const summary = computeRoundSummary(state.players, inputs);

    if (!summary.isComplete) {
      re.textContent = "";
    } else if (!summary.isValid25) {
      re.textContent = `Erreur: la somme des scores est ${summary.sum}, elle doit être exactement 25.`;
    } else if (summary.isGrandChelem) {
      const ordered = (state.players||[]).slice().sort((a,b)=>(a?.order??0)-(b?.order??0));
      const winnerPlayer = ordered[summary.grandChelemIndex];
      const nm = winnerPlayer?.name || `Joueur ${summary.grandChelemIndex+1}`;
      re.textContent = `Grand chelem détecté pour ${nm} (25). Les totaux seront ajustés (0 pour ${nm}, 25 pour les autres).`;
      applyRoundScore(summary);
    } else {
      re.textContent = `OK : tous les scores sont saisis et la somme est 25. Les totaux sont mis à jour pour la prochaine ronde.`;
      applyRoundScore(summary);
    }
  }
}

function renderAll(){
  renderPlayers();
  renderTotals();
  const { state } = window.ModInit;
  document.body.style.background = (state.myIndex===state.dealerIndex)?'#0f2e16':'var(--bg)';
}

window.ModUI = { renderPlayers, renderTotals, renderAll };
