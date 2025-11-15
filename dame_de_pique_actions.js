const $=(id)=>document.getElementById(id);

function diagnosticsPush(lines){
  const d=document.getElementById('diagOutput');
  if(d) d.textContent=lines.join('\n');
}

function wireOpenScore(){
  const btn = $('btnOpenScore');
  if(!btn || btn.__wired) return;
  btn.__wired=true;
  btn.addEventListener('click', ()=>{
    const dlg=$('scoreDialog');
    if(typeof dlg.showModal==='function'){
      dlg.showModal();
    } else {
      dlg.setAttribute('open','true');
    }
  });
}

function wireCloseScore(){
  const btn=$('btnCancelModal');
  if(!btn || btn.__wired) return;
  btn.__wired=true;
  btn.addEventListener('click',()=>{
    const dlg=$('scoreDialog');
    if(typeof dlg.close==='function'){
      dlg.close();
    } else {
      dlg.removeAttribute('open');
    }
  });
}

function wireScoreForm(){
  const form=$('scoreForm');
  const input=$('scoreInput');
  const err=$('modalError');
  if(!form || form.__wired) return;
  form.__wired=true;

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if(!input || !err) return;
    const raw=input.value.trim();
    const v=Number(raw);
    if(!Number.isFinite(v) || v<0 || v>25){
      err.style.display='';
      err.textContent="Score invalide. Entrez un nombre entre 0 et 25.";
      return;
    }
    err.style.display='none';

    try{
      const { ModInit, ModScores, ModRounds } = window;
      const { db, state } = ModInit;
      const gid = new URLSearchParams(window.location.search).get('gid') || null;
      if(!gid) throw new Error("gid manquant pour l’écriture du score.");

      const newInputs = await ModScores.writeScore(db, gid, state, v);
      state.currentInputs = newInputs;

      const summary = ModRounds.computeRoundSummary(state.players, newInputs);
      if(summary.isComplete && summary.isValid25){
        await ModRounds.applyRoundScore(db, gid, state, summary);
      }

      const dlg=$('scoreDialog');
      if(typeof dlg.close==='function') dlg.close(); else dlg.removeAttribute('open');

    } catch(err2){
      console.error(err2);
      err.style.display='';
      err.textContent="Erreur lors de l’enregistrement du score. Réessayez.";
    }
  });
}

function wireReload(){
  const btn=$('btnReload');
  if(!btn || btn.__wired) return;
  btn.__wired=true;
  btn.addEventListener('click',()=>{
    window.location.reload();
  });
}

function wireFinishHold2s(){
  const btn=$('btnFinish');
  if(!btn || btn.__wired) return;
  btn.__wired=true;
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
    timer=setTimeout(async ()=>{
      timer=null;
      if(fill){
        fill.style.transition='none';
        fill.style.width='100%';
      }
      await finishGame();
    },2000);
  };

  const cancel=(ev)=>{
    ev.preventDefault?.();
    if(timer){
      clearTimeout(timer);
      timer=null;
    }
    if(fill){
      fill.style.transition='width 150ms ease-out';
      fill.style.width='0%';
    }
  };

  btn.addEventListener('mousedown', start,{capture:true});
  btn.addEventListener('touchstart', start,{capture:true,passive:false});
  btn.addEventListener('mouseup', cancel,{capture:true});
  btn.addEventListener('mouseleave', cancel,{capture:true});
  btn.addEventListener('touchend', cancel,{capture:true});
  btn.addEventListener('touchcancel', cancel,{capture:true});
}

async function finishGame(){
  const { ModInit } = window;
  const { db, state } = ModInit;
  const gid = new URLSearchParams(window.location.search).get('gid') || null;
  if(!db||!gid) return;

  const totals = state.totals || {};
  let winnerId=null;
  let minTotal=Infinity;
  const players=(state.players||[]).slice().sort((a,b)=>(a?.order??0)-(b?.order??0));

  players.forEach((p,idx)=>{
    const key=(p.id!=null)?String(p.id):String(idx);
    const v=Number.isFinite(totals[key])? totals[key] : 0;
    if(v<minTotal){
      minTotal=v;
      winnerId=p.deviceId||null;
    }
  });

  const ref = firebase.firestore().collection('scores_dame_de_pique').doc(gid);
  await ref.set({
    gameOver:true,
    winnerId:winnerId || null
  },{merge:true});
}

function bootstrapUI(){
  wireOpenScore();
  wireCloseScore();
  wireScoreForm();
  wireReload();
  wireFinishHold2s();
}

bootstrapUI();
