const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(".")); // serves index.html

let rooms = {};

function generateCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

wss.on("connection", (ws) => {
  let roomCode = null;
  let playerName = null;

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    // CREATE ROOM
    if (data.type === "create") {
      roomCode = generateCode();
      playerName = data.name;

      rooms[roomCode] = {
        host: ws,
        players: [],
        pool: [],
        currentPlayer: null,
        timer: 10,
        bidding: false,
        highestBid: 0,
        highestBidder: null
      };

      rooms[roomCode].players.push({ name: playerName, ws, money: 100 });

      ws.send(JSON.stringify({ type: "room", code: roomCode }));
    }

    // JOIN ROOM
    if (data.type === "join") {
      roomCode = data.code;
      playerName = data.name;

      if (!rooms[roomCode]) return;

      rooms[roomCode].players.push({ name: playerName, ws, money: 100 });

      broadcast(roomCode);
    }

    // ADD PLAYER TO POOL
    if (data.type === "addPlayer") {
      if (!rooms[roomCode]) return;
      rooms[roomCode].pool.push(data.name);
      broadcast(roomCode);
    }

    // START AUCTION
    if (data.type === "start") {
      startAuction(roomCode);
    }

    // BID
    if (data.type === "bid") {
      let room = rooms[roomCode];
      if (!room || !room.bidding) return;

      room.highestBid += 1;
      room.highestBidder = playerName;
      room.timer = 10;

      broadcast(roomCode);
    }
  });

  ws.on("close", () => {
    if (!roomCode || !rooms[roomCode]) return;

    rooms[roomCode].players = rooms[roomCode].players.filter(p => p.ws !== ws);
    broadcast(roomCode);
  });
});

function broadcast(code) {
  let room = rooms[code];
  if (!room) return;

  room.players.forEach(p => {
    p.ws.send(JSON.stringify({
      type: "update",
      players: room.players.map(pl => pl.name),
      pool: room.pool,
      bid: room.highestBid,
      bidder: room.highestBidder
    }));
  });
}

function startAuction(code) {
  let room = rooms[code];
  if (!room) return;

  nextPlayer(code);

  setInterval(() => {
    if (!room.bidding) return;

    room.timer--;

    if (room.timer <= 0) {
      nextPlayer(code);
    }

    room.players.forEach(p => {
      p.ws.send(JSON.stringify({
        type: "timer",
        time: room.timer
      }));
    });

  }, 1000);
}

function nextPlayer(code) {
  let room = rooms[code];

  if (room.pool.length === 0) return;

  let player = room.pool.shift();

  room.currentPlayer = player;
  room.timer = 10;
  room.highestBid = 0;
  room.highestBidder = null;
  room.bidding = true;

  room.players.forEach(p => {
    p.ws.send(JSON.stringify({
      type: "auction",
      player: player
    }));
  });
}

server.listen(3000, () => console.log("Server running"));
