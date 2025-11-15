const $=(id)=>document.getElementById(id);

function renderHeader(){
  const { state } = window.ModInit;
  const lbl = $('passRule');
  const roundSpan1 = $('round');
  const roundSpan2 = $('round2');
  const dealerNameEl = $('dealerName');

  if(!state) return;

  const round = Number.isFinite(state.round)? state.round : 1;
  if(roundSpan1) roundSpan1.textContent=String(round);
  if(roundSpan2) roundSpan2.textContent=String(round);

  const { computePassRule } = window.ModRounds;
  const rule = computePassRule(round);
  if(lbl) lbl.textContent = `Règle : ${rule}`;

  if(dealerNameEl){
    const idx = Number.isInteger(state.dealerIndex)? state.dealerIndex : 0;
    const p = Array.isArray(state.players)? state.players[idx] : null;
    dealerNameEl.textContent = p?.name || '—';
  }
}

function renderPlayers(){
  const { state } = window.ModInit;
  const host=$('playersList'); if(!host) return;
  host.innerHTML='';
  const totals = state.totals || {};
  const ordered=(state.players||[]).slice().sort((a,b)=>(a?.order??0)-(b?.order??0));
  let minTotal=Infinity, maxTotal=-Infinity;

  const numericTotals = ordered.map((p,idx)=>{
    const key=(p.id!=null)?String(p.id):String(idx);
    const v=Number.isFinite(totals[key])? totals[key] : 0;
    if(v<minTotal) minTotal=v;
    if(v>maxTotal) maxTotal=v;
    return { idx, total:v, key };
  });

  const diff = maxTotal-minTotal;

  ordered.forEach((p,idx)=>{
    const key=(p.id!=null)?String(p.id):String(idx);
    const total = numericTotals[idx]?.total ?? 0;

    const row=document.createElement('div');
    row.className='line';

    const left=document.createElement('div');
    left.textContent = p?.name || `Joueur ${idx+1}`;

    const right=document.createElement('div');
    right.textContent = `${total} pts`;

    if(diff>0){
      if(total===minTotal){
        right.textContent += ' (en tête)';
      } else if(total===maxTotal){
        right.textContent += ' (dernier)';
      }
    }

    row.appendChild(left);
    row.appendChild(right);
    host.appendChild(row);
  });
}

function renderRoundStatus(){
  const { state } = window.ModInit;
  const rs = $('roundStatusValue');
  const re = $('roundError');
  const banner = $('grandChelemBanner');
  if(!state) return;

  const inputs = state.currentInputs || {};
  const submitted = Object.keys(inputs).length;
  const expected = (state.players||[]).length;
  if(rs) rs.textContent = `${submitted}/${expected}`;

  if(state.gameOver){
    if(re){
      re.style.display='';
      re.textContent='La partie est terminée. Le gagnant est indiqué selon le plus petit total.';
    }
    const btnOpen = $('btnOpenScore');
    if(btnOpen){
      btnOpen.disabled = true;
      btnOpen.textContent = "Partie terminée";
    }
    if(banner) banner.style.display = 'none';
    return;
  }

  const { computeRoundSummary } = window.ModRounds;
  const summary = computeRoundSummary(state.players, state.currentInputs);

  if(!summary.isComplete){
    if(re) { re.style.display='none'; re.textContent=''; }
    if(banner) banner.style.display='none';
  } else if(!summary.isValid25){
    if(re){
      re.style.display='';
      re.textContent=`Erreur: la somme des scores est ${summary.sum}, elle doit être exactement 25.`;
    }
    if(banner) banner.style.display='none';
  } else {
    if(re){
      re.style.display='';
      re.textContent='OK: somme des scores = 25. Les totaux seront mis à jour pour la prochaine ronde.';
    }
    if(banner){
      banner.style.display = summary.isGrandChelem ? '' : 'none';
    }
  }
}

function renderLeaderInfo(){
  const p = new URLSearchParams(window.location.search);
  const leaderParam = p.get('leader') || '';
  const isLeader = leaderParam === '1';
  const info = $('leaderInfo');
  const btnFinish = $('btnFinish');

  if(info){
    info.textContent = isLeader
      ? "Vous êtes l’hôte de la partie. Vous pouvez terminer la partie lorsque vous le jugez nécessaire."
      : "Vous n’êtes pas l’hôte de la partie.";
  }
  if(btnFinish){
    btnFinish.style.display = isLeader ? '' : 'none';
  }
}

function renderAll(){
  renderHeader();
  renderPlayers();
  renderRoundStatus();
  renderLeaderInfo();
}

window.ModUI = { renderAll };
