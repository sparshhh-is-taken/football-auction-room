const express = require("express");
const app = express();
const server = require("http").createServer(app);
const io = require("socket.io")(server);

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
      currentBid:0,
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
    rooms[roomCode].playerPool = pool;
    io.to(roomCode).emit("updatePool",pool);
  });

  socket.on("setBudget",({roomCode,amount})=>{
    let r = rooms[roomCode];
    r.players.forEach(p=>{
      r.budget[p]=amount;
      r.teams[p]=[];
    });
  });

  socket.on("startAuction",(roomCode)=>{
    let r = rooms[roomCode];

    r.playerPool.sort(()=>Math.random()-0.5);

    r.currentPlayer = r.playerPool.shift();
    r.currentBid = 1;

    startTimer(roomCode);

    io.to(roomCode).emit("auctionStart",r);
  });

  socket.on("bid",({roomCode,name,amount})=>{
    let r = rooms[roomCode];

    if(amount > r.currentBid && r.budget[name] >= amount){
      r.currentBid = amount;
      r.highestBidder = name;

      startTimer(roomCode);

      io.to(roomCode).emit("bidUpdate",r);
    }
  });

  socket.on("submitTeam",({roomCode,name,team,ovr})=>{
    let r = rooms[roomCode];
    r.finalTeams = r.finalTeams || {};
    r.finalTeams[name] = {team,ovr};

    io.to(roomCode).emit("updateFinalTeams",r.finalTeams);
  });

});

function startTimer(roomCode){
  let r = rooms[roomCode];

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
        r.highestBidder=null;

        startTimer(roomCode);
        io.to(roomCode).emit("newPlayer",r);

      } else {
        io.to(roomCode).emit("goToFormation",r);
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

body{background:#02040a;color:white;font-family:Arial;padding:20px;}

button{padding:10px;border:none;background:#00c853;color:white;border-radius:8px;}

.screen{display:none}
.active{display:block}

.playerCard{border:2px solid gold;padding:20px;border-radius:15px}

</style>
</head>
<body>

<!-- HOME -->
<div id="home" class="active">
<h1>Auction Room</h1>
<button onclick="showHost()">Host</button>
<button onclick="showJoin()">Join</button>
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

<button onclick="editPool()">Add Player</button>

<div id="pool"></div>
<div id="players"></div>
</div>

<!-- AUCTION -->
<div id="auction" class="screen">
<div class="playerCard">
<h2 id="pName"></h2>
<p id="pInfo"></p>
</div>

<h2 id="timer">10</h2>
<h3 id="bid"></h3>
<h3 id="myBudget"></h3>

<button onclick="bid()">BID +1</button>

<div id="managers"></div>
</div>

<!-- FORMATION -->
<div id="formation" class="screen">
<h2>Build Team</h2>

<select id="form" onchange="renderPitch()">
<option value="433">4-3-3</option>
<option value="442">4-4-2</option>
</select>

<div id="pitch"></div>
<div id="bench"></div>

<button onclick="submitTeam()">Submit</button>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>

let socket = io();
let room,name,myPlayers=[],team={},selected=null;

function showHost(){home.classList.remove("active");host.classList.add("active")}
function showJoin(){home.classList.remove("active");join.classList.add("active")}

function createRoom(){
 name=hName.value;
 socket.emit("createRoom",{name});
}

function joinRoom(){
 name=jName.value;
 room=jCode.value;
 socket.emit("joinRoom",{roomCode:room,name});
}

socket.on("roomCreated",(c)=>{
 room=c;
 host.classList.remove("active");
 lobby.classList.add("active");
 roomCode.innerText="Room: "+c;
});

socket.on("playerList",(p)=>{
 players.innerHTML=p.join("<br>");
});

function editPool(){
 let n=prompt("name"),r=prompt("rating"),p=prompt("2 positions comma");
 socket.emit("setPlayerPool",{roomCode:room,pool:[{name:n,rating:r,positions:p.split(",")}]});
}

socket.on("updatePool",(pool)=>{
 poolDiv="";
 pool.forEach(p=>poolDiv+=p.name+"<br>");
 pool.innerHTML=poolDiv;
});

function setBudget(){
 socket.emit("setBudget",{roomCode:room,amount:+budgetInput.value});
}

function startAuction(){
 socket.emit("startAuction",room);
}

socket.on("auctionStart",(r)=>{
 lobby.classList.remove("active");
 auction.classList.add("active");
 showPlayer(r.currentPlayer);
});

function showPlayer(p){
 pName.innerText=p.name;
 pInfo.innerText=p.positions.join("/")+" "+p.rating;
}

socket.on("timerUpdate",(t)=>timer.innerText=t);

function bid(){
 let val = parseInt(bid.innerText)||0;
 socket.emit("bid",{roomCode:room,name,amount:val+1});
}

socket.on("bidUpdate",(r)=>{
 bid.innerText=r.currentBid;
 myBudget.innerText=r.budget[name];
});

socket.on("newPlayer",(r)=>{
 showPlayer(r.currentPlayer);
});

socket.on("goToFormation",(r)=>{
 auction.classList.remove("active");
 formation.classList.add("active");

 myPlayers=r.teams[name];
 renderBench();
 renderPitch();
});

function renderBench(){
 bench.innerHTML="";
 myPlayers.forEach((p,i)=>{
 bench.innerHTML+=\`<div onclick="select(${i})">\${p.name}</div>\`;
 });
}

function select(i){selected=myPlayers[i]}

const forms={
"433":["GK","LB","CB","CB","RB","CM","CM","CM","LW","ST","RW"],
"442":["GK","LB","CB","CB","RB","LM","CM","CM","RM","ST","ST"]
};

function renderPitch(){
 let f=forms[form.value];
 pitch.innerHTML="";
 f.forEach((pos,i)=>{
 pitch.innerHTML+=\`<div onclick="place(\${i},'\${pos}')">\${pos}</div>\`;
 });
}

function place(i,pos){
 if(!selected)return;
 team[i]={...selected,assignedPos:pos};
 renderPitch();
}

function calc(){
 let t=0,c=0;
 Object.values(team).forEach(p=>{
 let r=p.rating;
 if(!p.positions.includes(p.assignedPos)) r-=10;
 t+=r;c++;
 });
 return Math.round(t/c);
}

function submitTeam(){
 let ovr=calc();
 socket.emit("submitTeam",{roomCode:room,name,team,ovr});
 alert("OVR "+ovr);
}

</script>
</body>
</html>
`);
});

server.listen(process.env.PORT||3000);
