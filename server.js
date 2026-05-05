const express = require("express");
const app = express();
const server = require("http").createServer(app);
const io = require("socket.io")(server);

let rooms = {};

// ===== ROOM CODE =====
function generateRoomCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    return Array.from({length:6},()=>chars[Math.floor(Math.random()*chars.length)]).join("");
}

// ===== FORMATIONS =====
const formations = {
    "4-3-3": ["GK","LB","CB","CB","RB","CM","CM","CM","LW","ST","RW"],
    "4-4-2": ["GK","LB","CB","CB","RB","LM","CM","CM","RM","ST","ST"]
};

// ===== TEAM OVR =====
function calculateTeamOVR(team){
    if(!team || team.length===0) return 0;
    let total=0;
    team.forEach(p=> total+=p.rating||75);
    return Math.floor(total/team.length);
}

// ===== LEADERBOARD =====
function generateLeaderboard(room){
    let r=rooms[room];
    let lb=[];

    r.players.forEach(p=>{
        lb.push({
            name:p,
            ovr:calculateTeamOVR(r.teams[p])
        });
    });

    return lb.sort((a,b)=>b.ovr-a.ovr);
}

// ===== SOCKET =====
io.on("connection", (socket)=>{

    socket.on("createRoom", ({name})=>{
        let code=generateRoomCode();

        rooms[code]={
            host:socket.id,
            players:[name],
            budget:{[name]:100},
            teams:{},
            playerPool:[],
            currentPlayer:null,
            currentBid:0,
            highestBidder:null,
            timer:null,
            timeLeft:10,
            optedOut:[],
            ready:{[name]:false}
        };

        socket.join(code);
        socket.emit("roomCreated",code);
    });

    socket.on("joinRoom", ({roomCode,name})=>{
        let r=rooms[roomCode];
        r.players.push(name);
        r.budget[name]=100;
        r.ready[name]=false;

        socket.join(roomCode);
    });

    socket.on("toggleReady", ({room,name})=>{
        rooms[room].ready[name]=!rooms[room].ready[name];
    });

    socket.on("setPlayerPool", ({room,pool})=>{
        rooms[room].playerPool=pool;
    });

    socket.on("startGame",(room)=>{
        let r=rooms[room];
        r.currentPlayer=r.playerPool.shift() || {name:"Random",rating:75,positions:["ST"]};
        r.currentBid=10;
        startTimer(room);
        io.to(room).emit("newRound",r);
    });

    socket.on("bid",({room,name,amount})=>{
        let r=rooms[room];

        if(amount>r.currentBid && r.budget[name]>=amount){
            r.currentBid=amount;
            r.highestBidder=name;
            startTimer(room);
            io.to(room).emit("bidUpdate",r);
        }
    });

    socket.on("optOut",({room,name})=>{
        let r=rooms[room];
        if(!r.optedOut.includes(name)) r.optedOut.push(name);
    });

    socket.on("finishTeam",(room)=>{
        let lb=generateLeaderboard(room);
        io.to(room).emit("leaderboard",lb);
        io.to(room).emit("winner",lb[0]);
    });

});

// ===== TIMER =====
function startTimer(room){
    let r=rooms[room];
    clearInterval(r.timer);

    r.timeLeft=10;

    r.timer=setInterval(()=>{
        r.timeLeft--;
        io.to(room).emit("timerUpdate",r.timeLeft);

        if(r.timeLeft<=0){
            clearInterval(r.timer);

            if(r.highestBidder){
                let u=r.highestBidder;
                if(!r.teams[u]) r.teams[u]=[];

                r.teams[u].push(r.currentPlayer);
                r.budget[u]-=r.currentBid;
            }

            if(r.playerPool.length>0){
                r.currentPlayer=r.playerPool.shift();
                r.currentBid=10;
                r.highestBidder=null;
                r.optedOut=[];
                startTimer(room);
            }else{
                io.to(room).emit("auctionEnded",r);
            }

            io.to(room).emit("newRound",r);
        }

    },1000);
}

// ===== FRONTEND =====
app.get("/", (req,res)=>{
res.send(`
<html>
<head>
<title>Football Auction</title>
<style>
body { background:#0b6623; color:white; text-align:center; font-family:Arial; }

.player {
  width:80px;height:110px;
  background:gold;border-radius:10px;
  margin:5px;padding:5px;
  cursor:grab;color:black;
}

#pitch { width:320px;height:500px;margin:auto;position:relative;border:2px solid white; }

.slot {
  position:absolute;width:70px;height:70px;
  background:rgba(255,255,255,0.2);
  border-radius:10px;
}

#winnerOverlay {
 position:fixed;top:0;left:0;width:100%;height:100%;
 background:rgba(0,0,0,0.9);
 display:none;justify-content:center;align-items:center;
}

#winnerBox { color:gold;font-size:30px;animation:pop 1s; }

@keyframes pop { from{transform:scale(0);} to{transform:scale(1);} }

</style>
</head>

<body>

<h2>Create</h2>
<input id="name"><button onclick="createRoom()">Create</button>

<h2>Join</h2>
<input id="joinName"><input id="code">
<button onclick="joinRoom()">Join</button>

<h3 id="room"></h3>
<h3 id="timer"></h3>

<input id="bid"><button onclick="bid()">Bid</button>
<button onclick="optOut()">Opt Out</button>

<button onclick="ready()">Ready</button>
<button onclick="start()">Start</button>

<h2>Pitch</h2>
<select id="formation"></select>
<div id="pitch"></div>

<h2>Players</h2>
<div id="bench"></div>

<button onclick="finishTeam()">Finish Team</button>

<h2>Leaderboard</h2>
<div id="leaderboard"></div>

<div id="winnerOverlay">
 <div id="winnerBox">
   🏆 WINNER<br>
   <span id="winnerName"></span><br>
   <span id="winnerOVR"></span>
 </div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
const socket=io();
let room,name,myTeam=[];
const formations=${JSON.stringify(formations)};

function createRoom(){
 name=document.getElementById("name").value;
 socket.emit("createRoom",{name});
}

socket.on("roomCreated",(c)=>{
 room=c;
 document.getElementById("room").innerText="Room: "+c;
});

function joinRoom(){
 name=document.getElementById("joinName").value;
 room=document.getElementById("code").value;
 socket.emit("joinRoom",{roomCode:room,name});
}

function bid(){
 socket.emit("bid",{room,name,amount:+document.getElementById("bid").value});
}

function optOut(){ socket.emit("optOut",{room,name}); }
function ready(){ socket.emit("toggleReady",{room,name}); }
function start(){ socket.emit("startGame",room); }
function finishTeam(){ socket.emit("finishTeam",room); }

socket.on("timerUpdate",(t)=>{
 document.getElementById("timer").innerText="Time:"+t;
});

socket.on("auctionEnded",(data)=>{
 myTeam=data.teams[name]||[];
 renderBench();
 loadFormations(Object.keys(formations));
});

function loadFormations(list){
 let s=document.getElementById("formation");
 s.innerHTML="";
 list.forEach(f=>{
  let o=document.createElement("option");
  o.value=f;o.innerText=f;
  s.appendChild(o);
 });
 renderPitch();
}

function renderPitch(){
 let f=document.getElementById("formation").value;
 let arr=formations[f];
 let pitch=document.getElementById("pitch");
 pitch.innerHTML="";

 arr.forEach((pos,i)=>{
  let d=document.createElement("div");
  d.className="slot";
  d.dataset.pos=pos;

  d.style.left=(i%4)*80+"px";
  d.style.top=Math.floor(i/4)*100+"px";

  d.ondragover=e=>e.preventDefault();
  d.ondrop=e=>drop(e,d);

  pitch.appendChild(d);
 });
}

function renderBench(){
 let b=document.getElementById("bench");
 b.innerHTML="";

 myTeam.forEach(p=>{
  let d=document.createElement("div");
  d.className="player";
  d.draggable=true;

  d.innerHTML=\`
   <b>\${p.rating||75}</b><br>
   \${p.name}<br>
   \${p.positions}
  \`;

  d.ondragstart=e=>e.dataTransfer.setData("p",JSON.stringify(p));
  b.appendChild(d);
 });
}

function calculateOVR(p,pos){
 return p.positions.includes(pos)?p.rating:Math.floor(p.rating*0.7);
}

function drop(e,slot){
 let p=JSON.parse(e.dataTransfer.getData("p"));
 let ovr=calculateOVR(p,slot.dataset.pos);

 slot.innerHTML=\`\${p.name}<br>\${ovr}\`;
}

socket.on("leaderboard",(data)=>{
 let div=document.getElementById("leaderboard");
 div.innerHTML="";
 data.forEach((p,i)=>{
  div.innerHTML+=\`#\${i+1} \${p.name} - \${p.ovr}<br>\`;
 });
});

const winSound=new Audio("https://www.soundjay.com/human/sounds/applause-8.mp3");

socket.on("winner",(w)=>{
 document.getElementById("winnerOverlay").style.display="flex";
 document.getElementById("winnerName").innerText=w.name;
 document.getElementById("winnerOVR").innerText="OVR: "+w.ovr;
 winSound.play();
});
</script>

</body>
</html>
`);
});

const PORT=process.env.PORT||3000;
server.listen(PORT);
