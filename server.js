const http = require("http");
const express = require("express");
const socketio = require("socket.io");
const path = require("path");
const nunjucks = require("nunjucks");
const { v4: uuidv4 } = require("uuid");
const favicon = require("serve-favicon");

const rooms = {};
const users = {};

const app = express();

app.set("views", path.join(__dirname, "views"));
nunjucks.configure("views", {
  autoescape: true,
  express: app,
});
app.set("view engine", "html");

app.use(favicon(path.join(__dirname, "public", "favicon.ico")));

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  const room = uuidv4();
  res.redirect(`/${room}`);
});

app.get("/:room", (req, res) => {
  res.render("index", { room: req.params.room });
});

const server = http.createServer(app);
const io = socketio(server);

io.on("connection", (socket) => {
  socket.on("leave", (roomId) => {
    try {
      rooms[roomId] = rooms[roomId].filter((id) => id != socket.id);
      delete users[socket.id];
      if (!rooms[roomId]) {
        delete rooms[roomId];
      } else {
        socket.broadcast.to(roomId).emit("notify", { status: "left" });
      }
    } catch (err) {
      console.log({ rooms, users, err });
    }
  });

  socket.on("join", (data) => {
    const { roomId, user } = data;
    let numberOfClients = 0;
    try {
      numberOfClients = rooms[roomId].length;
    } catch (err) {
      rooms[roomId] = [];
    }

    if (numberOfClients == 0) {
      socket.join(roomId);
      rooms[roomId].push(socket.id);
      users[socket.id] = user;
      socket.emit("room_created");
    } else if (numberOfClients == 1) {
      const host = users[rooms[roomId][0]];
      socket.join(roomId);
      rooms[roomId].push(socket.id);
      users[socket.id] = user;
      socket.emit("room_joined", host);
      socket.broadcast.to(roomId).emit("notify", { status: "join", user });
    } else {
      socket.emit("room_full");
    }
  });

  socket.on("start_call", (roomId) => {
    socket.broadcast.to(roomId).emit("start_call");
  });

  socket.on("webrtc_offer", (event) => {
    socket.broadcast.to(event.roomId).emit("webrtc_offer", event.sdp);
  });

  socket.on("webrtc_answer", (event) => {
    socket.broadcast.to(event.roomId).emit("webrtc_answer", event.sdp);
  });

  socket.on("webrtc_ice_candidate", (event) => {
    socket.broadcast.to(event.roomId).emit("webrtc_ice_candidate", event);
  });
});

server.listen(5000, "0.0.0.0", () => {
  console.log("Server listening on http://localhost:5000");
});
