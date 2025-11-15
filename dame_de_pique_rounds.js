import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

function computePassRule(round){
  const rules=['À droite','À gauche','Au centre','Garde tes cartes'];
  if(!Number.isFinite(round) || round<=0) return '—';
  const idx = (round-1)%4;
  return rules[idx] || '—';
}

function computeRoundSummary(players, inputs){
  const res={
    isComplete:false,
    isValid25:false,
    isGrandChelem:false,
    sum:0,
    perRound:[],
    grandChelemIndex:-1
  };
  if(!Array.isArray(players)||!players.length) return res;

  const ordered=players.slice().sort((a,b)=>(a?.order??0)-(b?.order??0));
  let sum=0, nbComplete=0;
  const perRound=[];
  let grandIdx=-1;

  ordered.forEach((p,idx)=>{
    const key=(p.id!=null)?String(p.id):String(idx);
    const raw = inputs && Object.prototype.hasOwnProperty.call(inputs,key) ? inputs[key] : null;
    if(raw==null || raw===""){
      perRound.push(null);
      return;
    }
    const v=Number(raw);
    if(!Number.isFinite(v) || v<0){
      perRound.push(null);
      return;
    }
    perRound.push(v);
    sum+=v;
    nbComplete++;
  });

  res.sum=sum;
  res.perRound=perRound;
  res.isComplete=(nbComplete===ordered.length);
  res.isValid25=(res.isComplete && sum===25);

  if(res.isValid25){
    const idx=perRound.findIndex(v=>v===25);
    if(idx>=0){
      res.isGrandChelem=true;
      res.grandChelemIndex=idx;
    }
  }
  return res;
}

async function applyRoundScore(db, gid, state, summary){
  if(!db||!gid) throw new Error("applyRoundScore: db ou gid manquant");
  const ref = doc(db,"scores_dame_de_pique",gid);

  const players=(state.players||[]).slice().sort((a,b)=>(a?.order??0)-(b?.order??0));
  let roundVals=summary.perRound.slice();
  if(summary.isGrandChelem && summary.grandChelemIndex>=0){
    roundVals=roundVals.map((v,idx)=> idx===summary.grandChelemIndex ? 0 : 25);
  }

  const prevTotals=state.totals||{};
  const newTotals={...prevTotals};
  players.forEach((p,idx)=>{
    const key=(p.id!=null)?String(p.id):String(idx);
    const prev = Number.isFinite(prevTotals[key])? prevTotals[key] : 0;
    const add  = Number.isFinite(roundVals[idx])? roundVals[idx] : 0;
    newTotals[key]=prev+add;
  });

  const roundNumber = Number.isFinite(state.round)? state.round : 1;
  const payload={
    lastRound:{
      appliedGrandChelem: !!summary.isGrandChelem,
      controleIndex: summary.grandChelemIndex ?? -1,
      perRound: summary.perRound,
      round: roundNumber,
      sum: roundVals.reduce((a,b)=>a+(Number(b)||0),0),
      values: roundVals
    },
    totals:newTotals,
    round: roundNumber+1,
    roundError:"",
    gameOver:false
  };

  await updateDoc(ref,payload);
}

window.ModRounds={
  computePassRule,
  computeRoundSummary,
  applyRoundScore
};
