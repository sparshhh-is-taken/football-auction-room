const express = require("express");
const app = express();
const server = require("http").createServer(app);
const io = require("socket.io")(server);

// 🔥 SHOW REAL ERRORS IN RENDER LOGS
process.on("uncaughtException", err => {
  console.error("CRASH:", err);
});

let rooms = {};

function codeGen(){
  return Math.random().toString(36).substring(2,6).toUpperCase();
}

io.on("connection", (socket)=>{

  socket.on("createRoom",({name})=>{
    let code = codeGen();

    rooms[code] = {
      players:[name],
      host:name,
      playerPool:[],
      budget:{},
      teams:{},
      currentPlayer:null,
      currentBid:1,
      highestBidder:null,
      timer:null,
      timeLeft:10
    };

    socket.join(code);
    socket.emit("roomCreated",code);
  });

  socket.on("joinRoom",({roomCode,name})=>{
    let r = rooms[roomCode];
    if(!r) return;

    r.players.push(name);
    socket.join(roomCode);

    io.to(roomCode).emit("playerList",r.players);
    socket.emit("updatePool",r.playerPool);
  });

  socket.on("setPlayerPool",({roomCode,pool})=>{
    let r = rooms[roomCode];
    if(!r) return;

    r.playerPool = pool;
    io.to(roomCode).emit("updatePool",pool);
  });

  socket.on("setBudget",({roomCode,amount})=>{
    let r = rooms[roomCode];
    if(!r) return;

    r.players.forEach(p=>{
      r.budget[p]=amount;
      r.teams[p]=[];
    });
  });

  socket.on("startAuction",(roomCode)=>{
    let r = rooms[roomCode];
    if(!r) return;

    r.playerPool.sort(()=>Math.random()-0.5);

    r.currentPlayer = r.playerPool.shift();
    r.currentBid = 1;
    r.highestBidder = null;

    startTimer(roomCode);

    io.to(roomCode).emit("auctionStart",r);
  });

  socket.on("bid",({roomCode,name,amount})=>{
    let r = rooms[roomCode];
    if(!r) return;

    if(amount > r.currentBid && r.budget[name] >= amount){
      r.currentBid = amount;
      r.highestBidder = name;

      startTimer(roomCode);

      io.to(roomCode).emit("bidUpdate",r);
    }
  });

});

function startTimer(roomCode){
  let r = rooms[roomCode];
  if(!r) return;

  clearInterval(r.timer);
  r.timeLeft = 10;

  r.timer = setInterval(()=>{
    r.timeLeft--;

    io.to(roomCode).emit("timerUpdate",r.timeLeft);

    if(r.timeLeft<=0){
      clearInterval(r.timer);

      if(r.highestBidder){
        r.teams[r.highestBidder].push({
          ...r.currentPlayer,
          price:r.currentBid
        });

        r.budget[r.highestBidder]-=r.currentBid;
      }

      if(r.playerPool.length>0){
        r.currentPlayer = r.playerPool.shift();
        r.currentBid = 1;
        r.highestBidder = null;

        startTimer(roomCode);
        io.to(roomCode).emit("newPlayer",r);

      } else {
        io.to(roomCode).emit("auctionEnded",r);
      }
    }

  },1000);
}

app.get("/",(req,res)=>{
res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Auction Game</title>

<style>
body{
  background:#02040a;
  color:white;
  font-family:Arial;
  text-align:center;
}

button{
  padding:10px;
  margin:5px;
  background:#00c853;
  border:none;
  border-radius:8px;
  color:white;
}

.screen{display:none}
.active{display:block}

.card{
  border:2px solid gold;
  padding:20px;
  border-radius:12px;
  margin:20px;
}
</style>

</head>
<body>

<!-- HOME -->
<div id="home" class="active">
<h1>Auction Room</h1>
<button onclick="show('host')">Host</button>
<button onclick="show('join')">Join</button>
</div>

<!-- HOST -->
<div id="host" class="screen">
<input id="hName" placeholder="Name">
<button onclick="createRoom()">Create</button>
</div>

<!-- JOIN -->
<div id="join" class="screen">
<input id="jName" placeholder="Name">
<input id="jCode" placeholder="Code">
<button onclick="joinRoom()">Join</button>
</div>

<!-- LOBBY -->
<div id="lobby" class="screen">
<h2 id="roomCode"></h2>

<input id="budgetInput" placeholder="Budget">
<button onclick="setBudget()">Set Budget</button>
<button onclick="startAuction()">Start Auction</button>

<button onclick="addPlayer()">Add Player</button>

<h3>Pool</h3>
<div id="pool"></div>

<h3>Players</h3>
<div id="players"></div>
</div>

<!-- AUCTION -->
<div id="auction" class="screen">
<div class="card">
<h2 id="pName"></h2>
<p id="pInfo"></p>
</div>

<h2 id="timer">10</h2>
<h3>Bid: <span id="bid">1</span></h3>
<h3>Your Budget: <span id="myBudget"></span></h3>

<button onclick="bid()">Bid +1</button>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>

let socket = io();
let room, name;

function show(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function createRoom(){
  name = document.getElementById("hName").value;
  socket.emit("createRoom",{name});
}

function joinRoom(){
  name = document.getElementById("jName").value;
  room = document.getElementById("jCode").value;
  socket.emit("joinRoom",{roomCode:room,name});
}

socket.on("roomCreated",(c)=>{
  room=c;
  show("lobby");
  document.getElementById("roomCode").innerText="Room: "+c;
});

socket.on("playerList",(p)=>{
  document.getElementById("players").innerHTML = p.join("<br>");
});

function addPlayer(){
  let n = prompt("Name");
  let r = prompt("Rating");
  let p = prompt("Positions (comma)");

  socket.emit("setPlayerPool",{
    roomCode:room,
    pool:[{name:n,rating:r,positions:p.split(",")}]
  });
}

socket.on("updatePool",(data)=>{
  let html="";
  data.forEach(p=> html += p.name+"<br>");
  document.getElementById("pool").innerHTML = html;
});

function setBudget(){
  socket.emit("setBudget",{
    roomCode:room,
    amount:+document.getElementById("budgetInput").value
  });
}

function startAuction(){
  socket.emit("startAuction",room);
}

socket.on("auctionStart",(r)=>{
  show("auction");
  showPlayer(r.currentPlayer);
});

function showPlayer(p){
  document.getElementById("pName").innerText = p.name;
  document.getElementById("pInfo").innerText =
    p.positions.join("/") + " | " + p.rating;
}

socket.on("timerUpdate",(t)=>{
  document.getElementById("timer").innerText = t;
});

function bid(){
  let current = parseInt(document.getElementById("bid").innerText) || 1;

  socket.emit("bid",{
    roomCode:room,
    name,
    amount:current+1
  });
}

socket.on("bidUpdate",(r)=>{
  document.getElementById("bid").innerText = r.currentBid;
  document.getElementById("myBudget").innerText = r.budget[name];
});

socket.on("newPlayer",(r)=>{
  showPlayer(r.currentPlayer);
});

</script>

</body>
</html>
`);
});

server.listen(process.env.PORT || 3000);
