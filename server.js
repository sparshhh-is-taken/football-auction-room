const express = require("express");
const app = express();
const server = require("http").createServer(app);
const io = require("socket.io")(server);

let rooms = {};

// ===== ROOM CODE =====
function generateRoomCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    return Array.from({ length: 4 }, () =>
        chars[Math.floor(Math.random() * chars.length)]
    ).join("");
}

// ===== SOCKET =====
io.on("connection", (socket) => {

    socket.on("createRoom", ({ name }) => {
        const code = generateRoomCode();

        rooms[code] = {
            players: [name],
        };

        socket.join(code);
        socket.emit("roomCreated", code);
    });

    socket.on("joinRoom", ({ roomCode, name }) => {
        if (!rooms[roomCode]) return;

        rooms[roomCode].players.push(name);
        socket.join(roomCode);

        io.to(roomCode).emit("playerList", rooms[roomCode].players);
    });

});


// ===== FRONTEND =====
app.get("/", (req, res) => {
res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Auction Room</title>

<style>
body {
  margin:0;
  font-family: Arial;
  color:white;
  background: radial-gradient(circle at top, #0b2d1f, #02040a);
}

/* SCREENS */
.screen { padding:20px; }
.center { text-align:center; }

/* HOME */
.title {
  font-size:48px;
  font-weight:bold;
  margin-top:50px;
}

.subtitle {
  color:#aaa;
  margin-bottom:40px;
}

/* CARDS */
.card {
  background: rgba(255,255,255,0.05);
  border-radius:20px;
  padding:20px;
  margin:20px;
  cursor:pointer;
  transition:0.3s;
}

.card:hover {
  background: rgba(255,255,255,0.1);
}

.icon {
  width:40px;
  height:40px;
  border-radius:10px;
  display:flex;
  align-items:center;
  justify-content:center;
  margin-bottom:10px;
}

.green { background:#00c853; }
.gold { background:#c8a100; }

/* BOX */
.box {
  background: rgba(255,255,255,0.05);
  padding:20px;
  border-radius:20px;
}

/* INPUT */
input {
  width:100%;
  padding:12px;
  margin:10px 0;
  border:none;
  border-radius:10px;
  background:#111;
  color:white;
}

/* BUTTON */
.mainBtn {
  width:100%;
  padding:15px;
  background:#00c853;
  border:none;
  border-radius:10px;
  margin-top:20px;
  font-size:16px;
}

.back {
  background:none;
  border:none;
  color:white;
  font-size:16px;
}

/* PLAYER LIST */
.playerList {
  margin-top:20px;
  padding:10px;
  background: rgba(255,255,255,0.05);
  border-radius:10px;
}
</style>

</head>
<body>

<!-- HOME -->
<div id="homeScreen" class="screen center">
  <h1 class="title">AUCTION ROOM</h1>
  <p class="subtitle">LIVE MULTIPLAYER PLAYER DRAFT</p>

  <div class="card" onclick="showHost()">
    <div class="icon green">+</div>
    <h2>HOST A ROOM</h2>
    <p>Create a room and invite friends</p>
  </div>

  <div class="card" onclick="showJoin()">
    <div class="icon gold">👥</div>
    <h2>JOIN A ROOM</h2>
    <p>Enter a code and play</p>
  </div>
</div>

<!-- HOST -->
<div id="hostScreen" class="screen" style="display:none;">
  <button class="back" onclick="goHome()">← Back</button>

  <h2>HOST A ROOM</h2>

  <div class="box">
    <input id="hostName" placeholder="Your name">
    <button class="mainBtn" onclick="createRoom()">CREATE ROOM</button>
  </div>
</div>

<!-- JOIN -->
<div id="joinScreen" class="screen" style="display:none;">
  <button class="back" onclick="goHome()">← Back</button>

  <h2>JOIN A ROOM</h2>

  <div class="box">
    <input id="joinName" placeholder="Your name">
    <input id="joinCode" placeholder="Room code">
    <button class="mainBtn" onclick="joinRoom()">JOIN ROOM</button>
  </div>
</div>

<!-- GAME -->
<div id="gameScreen" class="screen" style="display:none;">
  <h2 id="roomTitle"></h2>

  <h3>Players in Room:</h3>
  <div id="players" class="playerList"></div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>

const socket = io();
let room, name;

// SCREEN NAV
function showHost(){
  homeScreen.style.display="none";
  hostScreen.style.display="block";
}

function showJoin(){
  homeScreen.style.display="none";
  joinScreen.style.display="block";
}

function goHome(){
  homeScreen.style.display="block";
  hostScreen.style.display="none";
  joinScreen.style.display="none";
}

function goGame(){
  hostScreen.style.display="none";
  joinScreen.style.display="none";
  gameScreen.style.display="block";
}

// CREATE
function createRoom(){
  name = document.getElementById("hostName").value;
  socket.emit("createRoom", { name });
}

// JOIN
function joinRoom(){
  name = document.getElementById("joinName").value;
  room = document.getElementById("joinCode").value;
  socket.emit("joinRoom", { roomCode: room, name });
}

// EVENTS
socket.on("roomCreated", (code)=>{
  room = code;
  goGame();
  document.getElementById("roomTitle").innerText = "Room Code: " + code;
});

socket.on("playerList", (players)=>{
  let div = document.getElementById("players");
  div.innerHTML = "";

  players.forEach(p=>{
    div.innerHTML += p + "<br>";
  });
});

</script>

</body>
</html>
`);
});

// ===== SERVER =====
const PORT = process.env.PORT || 3000;
server.listen(PORT);
