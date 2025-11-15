import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
let unsubscribeSoiree=null;
function listenSoiree(db, code, onData){
  if(!db||!code){ console.warn("[listenSoiree] db/code manquant"); return ()=>{}; }
  if(unsubscribeSoiree){ try{unsubscribeSoiree();}catch(_){} unsubscribeSoiree=null; }
  const ref = doc(db,"soirees",code);
  unsubscribeSoiree = onSnapshot(
    ref,
    (snap)=>{
      if(!snap.exists()){ onData?.(null); return; }
      onData?.(snap.data()||{});
    },
    (err)=> console.error("[listenSoiree] erreur snapshot:",err)
  );
  return ()=>{ if(unsubscribeSoiree) unsubscribeSoiree(); };
}
window.ModSoiree = { listenSoiree };
