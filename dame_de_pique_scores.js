import { doc, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

function extractTotals(data){
  // 1) totals direct
  if(data && data.totals && typeof data.totals==='object'){
    return data.totals;
  }
  // 2) standings.totals
  if(data && data.standings && typeof data.standings==='object'){
    const st=data.standings;
    if(st.totals && typeof st.totals==='object') return st.totals;
    const out={};
    Object.keys(st).forEach(k=>{
      const v=st[k];
      if(v && typeof v==='object' && Number.isFinite(v.total)){
        out[k]=v.total;
      }
    });
    if(Object.keys(out).length>0) return out;
  }
  // 3) dernier round
  if(data && data.lastRound && Array.isArray(data.lastRound.perRound)){
    const o={};
    data.lastRound.perRound.forEach((v,i)=>o[String(i)]=Number(v)||0);
    return o;
  }
  return null;
}

async function writeScore(db, gid, state, value){
  if(!db||!gid) throw new Error("writeScore: db ou gid manquant");
  const ref = doc(db,"scores_dame_de_pique",gid);

  const players = (state.players||[]).slice().sort((a,b)=>(a?.order??0)-(b?.order??0));
  const deviceId = window.ModInit.deviceId;
  const idx = players.findIndex(p=>p && p.deviceId===deviceId);
  if(idx<0) throw new Error("Impossible d’identifier votre joueur dans cette partie.");
  const key = (players[idx].id!=null)?String(players[idx].id):String(idx);

  const currentInputs = state.currentInputs || {};
  const newInputs = { ...currentInputs, [key]: value };

  await updateDoc(ref,{ inputs:newInputs });
  return newInputs;
}

window.ModScores = {
  extractTotals,
  writeScore
};
