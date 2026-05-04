// ===== IMPORTS =====
const express = require("express");
const app = express();
const server = require("http").createServer(app);
const io = require("socket.io")(server);

// ===== MEMORY =====
let rooms = {};

// ===== ROOM CODE =====
function generateRoomCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

// ===== FORMATIONS =====
const formations = {
    "4-3-3": ["GK","LB","CB","CB","RB","CM","CM","CM","LW","ST","RW"],
    "4-4-2": ["GK","LB","CB","CB","RB","LM","CM","CM","RM","ST","ST"],
    "3-5-2": ["GK","CB","CB","CB","LM","CM","CM","CM","RM","ST","ST"]
};

// ===== SOCKET =====
io.on("connection", (socket) => {

    // CREATE ROOM
    socket.on("createRoom", ({ name }) => {
        let code = generateRoomCode();

        rooms[code] = {
            host: socket.id,
            players: [name],
            budget: { [name]: 100 },
            teams: {},
            playerPool: [],
            allPlayers: [],
            currentPlayer: null,
            currentBid: 0,
            highestBidder: null,
            timer: null,
            timeLeft: 10,
            optedOut: [],
            readyStatus: { [name]: false },
            playerSockets: { [name]: socket.id },
            allowedFormations: ["4-3-3","4-4-2","3-5-2"]
        };

        socket.join(code);
        socket.emit("roomCreated", code);
        io.to(code).emit("updateRoom", rooms[code]);
    });

    // JOIN ROOM
    socket.on("joinRoom", ({ roomCode, name }) => {
        let r = rooms[roomCode];
        if (!r) return socket.emit("errorMsg", "Room not found");

        if (r.players.includes(name)) {
            r.playerSockets[name] = socket.id;
            socket.join(roomCode);
            socket.emit("reconnected", r);
            return;
        }

        r.players.push(name);
        r.budget[name] = 100;
        r.readyStatus[name] = false;
        r.playerSockets[name] = socket.id;

        socket.join(roomCode);
        io.to(roomCode).emit("updateRoom", r);
    });

    // READY SYSTEM
    socket.on("toggleReady", ({ room, name }) => {
        let r = rooms[room];
        r.readyStatus[name] = !r.readyStatus[name];
        io.to(room).emit("readyUpdate", r.readyStatus);
    });

    // SET PLAYER POOL (HOST)
    socket.on("setPlayerPool", ({ room, pool }) => {
        let r = rooms[room];
        if (socket.id !== r.host) return;

        r.playerPool = pool;
        r.allPlayers = [...pool];

        io.to(room).emit("updateRoom", r);
    });

    // START GAME
    socket.on("startGame", (room) => {
        let r = rooms[room];

        if (!r.players.every(p => r.readyStatus[p])) return;

        r.currentPlayer = r.playerPool.shift();
        r.currentBid = r.currentPlayer.basePrice || 10;
        r.highestBidder = null;

        startTimer(room);
        io.to(room).emit("newRound", r);
    });

    // BID
    socket.on("bid", ({ room, name, amount }) => {
        let r = rooms[room];

        if (r.optedOut.includes(name)) return;

        if (amount > r.currentBid && r.budget[name] >= amount) {
            r.currentBid = amount;
            r.highestBidder = name;
            startTimer(room);
            io.to(room).emit("bidUpdate", r);
        }
    });

    // OPT OUT
    socket.on("optOut", ({ room, name }) => {
        let r = rooms[room];
        if (!r.optedOut.includes(name)) r.optedOut.push(name);
        io.to(room).emit("optUpdate", r.optedOut);
    });

});

// ===== TIMER =====
function startTimer(room) {
    let r = rooms[room];
    clearInterval(r.timer);

    r.timeLeft = 10;

    r.timer = setInterval(() => {
        r.timeLeft--;
        io.to(room).emit("timerUpdate", r.timeLeft);

        if (r.timeLeft <= 0) {
            clearInterval(r.timer);

            if (r.highestBidder) {
                let user = r.highestBidder;

                if (!r.teams[user]) r.teams[user] = [];
                r.teams[user].push(r.currentPlayer);
                r.budget[user] -= r.currentBid;
            }

            if (r.playerPool.length > 0) {
                r.currentPlayer = r.playerPool.shift();
                r.currentBid = r.currentPlayer.basePrice || 10;
                r.highestBidder = null;
                r.optedOut = [];

                startTimer(room);
            } else {
                io.to(room).emit("auctionEnded", r);
            }

            io.to(room).emit("newRound", r);
        }

    }, 1000);
}

// ===== FRONTEND =====
app.get("/", (req, res) => {
    res.send(`
    <html>
    <head>
    <title>Football Auction Game</title>
    <style>
    body { font-family: Arial; text-align: center; }
    #pitch { display:flex; flex-wrap:wrap; justify-content:center; }
    .slot {
        width:70px; height:70px;
        margin:5px; background:green;
        color:white; display:flex;
        align-items:center; justify-content:center;
    }
    .player {
        background:lightblue;
        margin:5px; padding:5px;
        cursor:grab;
    }
    </style>
    </head>

    <body>

    <h2>Create Room</h2>
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

    <script src="/socket.io/socket.io.js"></script>
    <script>
    const socket = io();
    let room, name, myTeam = [];
    const formations = ${JSON.stringify(formations)};

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

    socket.on("timerUpdate",(t)=>{
        document.getElementById("timer").innerText="Time: "+t;
    });

    socket.on("auctionEnded",(data)=>{
        myTeam=data.teams[name]||[];
        renderBench();
        loadFormations(data.allowedFormations);
    });

    function loadFormations(list){
        let s=document.getElementById("formation");
        s.innerHTML="";
        list.forEach(f=>{
            let o=document.createElement("option");
            o.value=f; o.innerText=f;
            s.appendChild(o);
        });
        s.onchange=renderPitch;
        renderPitch();
    }

    function renderPitch(){
        let f=document.getElementById("formation").value;
        let arr=formations[f];
        let pitch=document.getElementById("pitch");
        pitch.innerHTML="";
        arr.forEach(pos=>{
            let d=document.createElement("div");
            d.className="slot";
            d.dataset.pos=pos;
            d.innerText=pos;
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
            d.innerText=p.name+"("+p.positions+")";
            d.ondragstart=e=>e.dataTransfer.setData("p",JSON.stringify(p));
            b.appendChild(d);
        });
    }

    function drop(e,slot){
        let p=JSON.parse(e.dataTransfer.getData("p"));
        slot.innerText=p.name;
    }

    </script>
    </body>
    </html>
    `);
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Running on port", PORT));