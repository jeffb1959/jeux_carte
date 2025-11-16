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
  const btn=$('btnFinish'); if(!btn||btn.__wired) return; btn.__wired=true; let timer=null; const fill=btn.querySelector('.fill');
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
      }catch(e){
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

  // Si nous n'avons pas encore l'info sur l'hôte, on affiche au cas où
  if (typeof state.isHost !== 'boolean') {
    finish.style.display = '';
    return;
  }

  const isHostDevice = !!state.isHost;

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

  const backdrop=document.getElementById('modalScoreBackdrop');
  const modal=document.getElementById('modalScore');
  const playersList=document.getElementById('modalPlayers');
  const myInput=document.getElementById('myScoreInput');
  if(!backdrop||!modal||!playersList||!myInput) return;

  const players=(state.players||[]).slice().sort((a,b)=>(a?.order??0)-(b?.order??0));
  playersList.innerHTML='';

  players.forEach((p,idx)=>{
    const row=document.createElement('div');
    row.className='line';
    const n=document.createElement('div'); n.textContent=p?.name||`Joueur ${idx+1}`;
    const v=document.createElement('div'); v.className='muted'; v.textContent='—';
    row.appendChild(n); row.appendChild(v); playersList.appendChild(row);
  });

  myInput.value='';
  backdrop.hidden=false;
  modal.hidden=false;
  myInput.focus();
}

function wireScoreModal(){
  const backdrop=document.getElementById('modalScoreBackdrop');
  const modal=document.getElementById('modalScore');
  const btnCancel=document.getElementById('btnScoreCancel');
  const btnOk=document.getElementById('btnScoreOk');
  const myInput=document.getElementById('myScoreInput');
  if(!backdrop||!modal||!btnCancel||!btnOk||!myInput) return;

  btnCancel.addEventListener('click',(e)=>{
    e.preventDefault();
    backdrop.hidden=true; modal.hidden=true;
  });

  btnOk.addEventListener('click',async (e)=>{
    e.preventDefault();
    const v=Number(myInput.value);
    if(!Number.isFinite(v) || v<0){
      alert('Veuillez entrer un nombre valide ≥ 0.');
      return;
    }
    const { state, getDb } = window.ModInit;
    const db = getDb();
    if(!db||!state.gameId||!state.deviceId){
      alert('Configuration incomplète, impossible d\'enregistrer le score.');
      return;
    }
    try{
      const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
      const ref = doc(db, 'scores_dame_de_pique', state.gameId);
      await updateDoc(ref, {
        [`inputs.${state.deviceId}`]: v
      });
      console.debug('[scoreModal] Score enregistré pour', state.deviceId, v);
      backdrop.hidden=true; modal.hidden=true;
    }catch(err){
      console.error('[scoreModal] erreur updateDoc:', err);
      alert('Erreur lors de l\'enregistrement du score.');
    }
  });
}

document.addEventListener('DOMContentLoaded',()=>{
  wireOpenScore();
  wireFinishHold2s();
  wireScoreModal();
  ensureFinishIsLast();
});
