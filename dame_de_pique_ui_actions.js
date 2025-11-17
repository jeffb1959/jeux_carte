const $=(id)=>document.getElementById(id);

function diagnosticsPush(lines){
  const d=document.getElementById('diagOutput');
  if(d) d.textContent=lines.join('\n');
}

function wireOpenScore(){
  const btn=$('btnOpenScore'); if(!btn||btn.__wired) return; btn.__wired=true;
  btn.addEventListener('click',(e)=>{ e.preventDefault(); openScoreModal(); },{capture:true});
}

function wireFinishHold2s(){
  const btn=$('btnFinish'); if(!btn||btn.__wired) return; btn.__wired=true;
  let timer=null;
  const fill=btn.querySelector('.fill');

  const start=(ev)=>{
    ev.preventDefault?.();
    if(fill){
      fill.style.transition='none';
      fill.style.width='0%';
      void fill.offsetWidth;
      fill.style.transition='width 2s linear';
      fill.style.width='100%';
    }
    timer=setTimeout(()=>{
      clearTimeout(timer); timer=null;
      try{
        const modRounds = window.ModRounds;
        if(modRounds && typeof modRounds.finishGameNow === 'function'){
          modRounds.finishGameNow().finally(()=>{
            const modInit = window.ModInit || {};
            const state = modInit.state || {};
            const code = state && state.soireeCode ? String(state.soireeCode) : "";
            if(code){
              window.location.href = `selection_jeux.html?code=${encodeURIComponent(code)}`;
            } else {
              window.location.href = 'selection_jeux.html';
            }
          });
        } else {
          const modInit = window.ModInit || {};
          const state = modInit.state || {};
          const code = state && state.soireeCode ? String(state.soireeCode) : "";
          if(code){
            window.location.href = `selection_jeux.html?code=${encodeURIComponent(code)}`;
          } else {
            window.location.href = 'selection_jeux.html';
          }
        }
      } catch(e){
        console.error('[wireFinishHold2s] erreur finishGameNow:', e);
        const modInit = window.ModInit || {};
        const state = modInit.state || {};
        const code = state && state.soireeCode ? String(state.soireeCode) : "";
        if(code){
          window.location.href = `selection_jeux.html?code=${encodeURIComponent(code)}`;
        } else {
          window.location.href = 'selection_jeux.html';
        }
      }
    },2000);
  };

  const cancel=()=>{
    clearTimeout(timer); timer=null;
    if(fill){ fill.style.transition='none'; fill.style.width='0%'; }
  };

  ['mousedown','touchstart'].forEach(ev=> btn.addEventListener(ev,start,{passive:false}));
  ['mouseup','mouseleave','touchend','touchcancel'].forEach(ev=> btn.addEventListener(ev,cancel));
}


function ensureFinishIsLast(){
  const main=document.querySelector('main.wrap');
  const finish=document.getElementById('finishSection');
  if(main&&finish&&main.lastElementChild!==finish){
    main.appendChild(finish);
  }
}

// ✅ Nouvelle fonction : contrôle de la visibilité du bouton Fin de partie
function updateFinishVisibility(){
  const { state } = window.ModInit;
  const finish = document.getElementById('finishSection');
  if (!finish) return;

  // Par défaut : on cache le bouton (sécurité)
  let isHostDevice = false;

  // Liste ordonnée des joueurs (ordre réel des sièges)
  const ordered = (state.players || []).slice().sort(
    (a,b) => (a?.order ?? 0) - (b?.order ?? 0)
  );

  if (ordered.length > 0 && state.deviceId) {
    const hostPlayer = ordered[0];  // joueur 0 = hôte
    if (hostPlayer && hostPlayer.deviceId && hostPlayer.deviceId === state.deviceId) {
      isHostDevice = true;
    }
  }

  // Seul l'hôte voit la section Fin de partie
  finish.style.display = isHostDevice ? '' : 'none';
}

// Fenêtre modale de saisie de score (synchro Firestore)
function openScoreModal(){
  const { state } = window.ModInit;

  // Si la partie est terminée, on ne permet plus la saisie
  if (state.gameOver) {
    alert("La partie est terminée. Il n'est plus possible de saisir des points.");
    return;
  }

  const backdrop = document.getElementById('modalScoreBackdrop');
  const listEl   = document.getElementById('modalPlayers');
  const roundEl  = document.getElementById('modalRound');
  const inputEl  = document.getElementById('myScoreInput');
  const msgEl    = document.getElementById('modalMsg');

  if(!backdrop || !listEl || !roundEl || !inputEl || !msgEl){
    console.warn('[openScoreModal] éléments manquants dans le DOM.');
    return;
  }

  msgEl.textContent = '';
  roundEl.textContent = String(state.round || 1);

  const players = state.players || [];
  const inputs = state.currentInputs || {};

  // Liste des joueurs avec leur score de ronde courant
  listEl.innerHTML = '';
  players.forEach((p, idx) => {
    const line = document.createElement('div');
    line.className = 'list-line';
    const left = document.createElement('div');
    left.textContent = (p && p.name) ? p.name : `Joueur ${idx+1}`;
    const right = document.createElement('div');
    const did = p && p.deviceId;
    const v = (did && Object.prototype.hasOwnProperty.call(inputs, did)) ? inputs[did] : null;
    right.textContent = (v != null) ? `${v} pts` : '—';
    line.appendChild(left);
    line.appendChild(right);
    listEl.appendChild(line);
  });

  // Pré-remplir mon score si déjà saisi
  let myVal = "";
  if (state.deviceId && inputs && Object.prototype.hasOwnProperty.call(inputs, state.deviceId)) {
    myVal = String(inputs[state.deviceId]);
  }
  inputEl.value = myVal;
  inputEl.focus();
  backdrop.style.display = 'flex';

  const close = () => {
    backdrop.style.display = 'none';
    msgEl.textContent = '';
  };

  const onCancel = () => {
    close();
  };

  const onAccept = async () => {
    const raw = inputEl.value.trim();
    const val = Number(raw);
    if (!Number.isFinite(val) || val < 0 || val > 25) {
      msgEl.textContent = "Le score doit être un nombre entre 0 et 25.";
      return;
    }
    msgEl.textContent = "Enregistrement...";
    try{
      if (window.ModScores && window.ModScores.submitScoreForCurrentDevice) {
        await window.ModScores.submitScoreForCurrentDevice(val);
        msgEl.textContent = "Score envoyé.";
      }else{
        msgEl.textContent = "Module scores indisponible (aucune écriture).";
      }
    }catch(e){
      console.error("[openScoreModal] erreur lors de submitScore:", e);
      msgEl.textContent = "Erreur lors de l'enregistrement du score.";
    }
    setTimeout(close, 600);
  };

  // ENTER déclenche « Accepter »
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      onAccept();
    }
  });


  document.getElementById('btnAcceptScore')?.addEventListener('click', onAccept, { once:true });

  // Fermer si clic en dehors de la boîte
  backdrop.addEventListener('click', function onBackdrop(e){
    if(e.target === backdrop){
      backdrop.removeEventListener('click', onBackdrop);
      close();
    }
  });
}

function onReady(fn){
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', fn, {once:true});
  } else {
    fn();
  }
}

onReady(async ()=>{
  const { state, boot, ensureAuth } = window.ModInit;
  const { listenSoiree } = window.ModSoiree;
  const { listenScores } = window.ModScores;
  const { renderAll } = window.ModUI;

  await boot();
  renderAll();
  wireOpenScore();
  wireFinishHold2s();
  ensureFinishIsLast();

  const notes=[];
  if(!window.firebaseConfig){
    notes.push('ℹ️ firebaseConfig manquant → lecture désactivée.');
    diagnosticsPush(notes);
    return;
  }
  notes.push('⏳ Auth anonyme…');
  const ctx = await ensureAuth();
  const db=ctx?.db, uid=ctx?.uid;
  if(!db){
    notes.push('❌ Auth/DB indisponible.');
    diagnosticsPush(notes);
    return;
  }
  notes.push('✅ Auth OK. UID: '+(uid||'(anonyme)'));

  // Écoute soirée
  if(!state.soireeCode){
    notes.push('ℹ️ ?code=XXXX manquant → pas d\'écoute soirees.');
    diagnosticsPush(notes);
    return;
  }
  notes.push('👂 Écoute soirees/'+state.soireeCode+' …');
  listenSoiree(db, state.soireeCode, (data)=>{
    if(!data){
      notes.push('⚠️ Doc soirees inexistant');
      diagnosticsPush(notes);
      return;
    }
    state.players = Array.isArray(data.players)? data.players : (data.players?.list||[]);
    state.dealerIndex = Number.isInteger(data.leaderIndex)? data.leaderIndex : (data.dealerIndex ?? 0);
    if(Number.isInteger(data.round)) state.round = data.round;
    let dlName = data.leaderName;
    if(!dlName && Array.isArray(state.players) && state.players[state.dealerIndex]){
      dlName = state.players[state.dealerIndex]?.name || '—';
    }
    document.getElementById('dealerName').textContent = dlName || '—';

    // ✅ Met à jour la visibilité du bouton Fin de partie pour cet appareil
    updateFinishVisibility();

    renderAll();
    diagnosticsPush([
      ...notes,
      '📦 Maj soirees: players='+(state.players?.length||0)+', dealerIndex='+state.dealerIndex+', round='+state.round
    ]);
  });

  // Écoute scores (totaux + inputs) si gid présent
  if(state.gameId){
    notes.push('👂 Écoute scores_dame_de_pique/'+state.gameId+' …');
    listenScores(db, state.gameId, ({ totals, round, extra, raw })=>{
      const inputs = window.ModInit.state.currentInputs || {};
      const inputsCount = Object.keys(inputs).length;

      // Même sans totals/round, on veut rafraîchir l'affichage
      if(!totals && !round){
        diagnosticsPush([
          ...notes,
          `ℹ️ Doc scores sans champs totals/round (inputs=${inputsCount}).`
        ]);
        renderAll();   // relance la validation 25 / grand chelem / fin de partie
        return;
      }

      if(totals) state.totals = totals;
      if(Number.isInteger(round)) state.round = round;
      if(extra && Array.isArray(extra.lastRoundPer)) state.lastRoundPer = extra.lastRoundPer;

      renderAll();
      diagnosticsPush([
        ...notes,
        '📦 Maj scores: totals='+(Object.keys(state.totals||{}).length)+', round='+state.round+`, inputs=${inputsCount}, gameOver=${state.gameOver}`
      ]);
    });
  } else {
    notes.push('ℹ️ ?gid=... manquant → pas d\'écoute scores.');
    diagnosticsPush(notes);
  }
});
