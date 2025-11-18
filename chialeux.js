onReady(()=>{

  // Pour l'instant : simple "mock" visuel
  const players = [
    {name:"Joueur 1"},
    {name:"Joueur 2"},
    {name:"Joueur 3"},
    {name:"Joueur 4"}
  ];

  buildPredictionUI(players);
  buildScoreUI(players);

  // L’hôte sera activé dans une étape future (JS + Firestore)
  // document.getElementById("hostControls").classList.remove("hidden");

});


function buildPredictionUI(players){
  const list = document.getElementById("predictionList");
  list.innerHTML = "";

  players.forEach(p=>{
    const div = document.createElement("div");
    div.className = "player-card";

    div.innerHTML = `
      <div class="player-name">${p.name}</div>
      <div class="predict-display" data-player="${p.name}">—</div>
    `;

    list.appendChild(div);
  });
}

function buildScoreUI(players){
  const sb = document.getElementById("scoreBoard");
  sb.innerHTML = "";

  players.forEach(p=>{
    const row = document.createElement("div");
    row.className = "score-row";
    row.innerHTML = `
      <span class="score-name">${p.name}</span>
      <span class="score-value">10</span>
    `;
    sb.appendChild(row);
  });
}


// Petit utilitaire
function onReady(fn){
  if(document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", fn);
  else
    fn();
}
