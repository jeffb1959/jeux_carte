import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

function listenSoiree(db, code, onData){
  if(!db||!code){ console.warn("listenSoiree: db ou code manquant"); return ()=>{}; }
  const ref = doc(db, "soirees", code);
  return onSnapshot(ref, snap=>{
    if(!snap.exists()){
      onData(null);
      return;
    }
    onData(snap.data());
  }, err=>{
    console.error("Erreur onSnapshot soiree", err);
  });
}

window.ModSoiree = { listenSoiree };
