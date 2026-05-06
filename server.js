const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

let rooms = {};

function genCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

io.on("connection", socket => {

  socket.on("host", ({ name, color }) => {
    const code = genCode();

    rooms[code] = {
      players: [],
      pool: [],
      current: null,
      bid: 1,
      timer: 10,
      highest: null
    };

    rooms[code].players.push({ id: socket.id, name, color, money: 100, team: [] });

    socket.join(code);
    socket.emit("created", code);
  });

  socket.on("join", ({ code, name, color }) => {
    if (!rooms[code]) return;

    rooms[code].players.push({ id: socket.id, name, color, money: 100, team: [] });
    socket.join(code);

    io.to(code).emit("players", rooms[code].players);
  });

  socket.on("addPlayer", ({ code, player }) => {
    rooms[code].pool.push(player);
    io.to(code).emit("pool", rooms[code].pool);
  });

  socket.on("start", code => startAuction(code));

  socket.on("bid", code => {
    let r = rooms[code];
    r.bid++;
    r.timer = 10;
    r.highest = socket.id;

    io.to(code).emit("bid", r.bid);
  });

});

function startAuction(code) {
  let r = rooms[code];
  r.pool.sort(() => Math.random() - 0.5);
  next(code);
}

function next(code) {
  let r = rooms[code];
  if (!r.pool.length) return;

  r.current = r.pool.shift();
  r.bid = 1;
  r.timer = 10;
  r.highest = null;

  io.to(code).emit("new", r.current);

  let t = setInterval(() => {
    r.timer--;
    io.to(code).emit("timer", r.timer);

    if (r.timer <= 0) {
      clearInterval(t);

      if (r.highest) {
        let winner = r.players.find(p => p.id === r.highest);
        winner.team.push(r.current);
      }

      next(code);
    }
  }, 1000);
}

server.listen(3000);
