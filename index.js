const http = require("http");
const express = require("express");
const webSocketServer = require("websocket").server;

const app = express();
app.use(express.static("public"));

//Настройки игры
const gameSettings = {
  playerSpeed: 10,
  playerSize: 48,
  bulletSize: 16,
  bulletSpeed: 500,
  maxBulletsPerPlayer: 3,
  boardWidth: 1000,
  boardHeight: 667,
  tickDuration: 17,
};

let bulletTravelDistancePerTick = Math.round(
  (gameSettings.bulletSpeed * gameSettings.tickDuration) / 1000
);
const bulletSpawnDirection = new Map();
bulletSpawnDirection.set(0, [-1, 1]);
bulletSpawnDirection.set(90, [1, 3]);
bulletSpawnDirection.set(-90, [1, -1]);
bulletSpawnDirection.set(180, [3, 1]);

const bulletTravelDirection = new Map();
bulletTravelDirection.set(0, [-1, 0]);
bulletTravelDirection.set(90, [0, 1]);
bulletTravelDirection.set(-90, [0, -1]);
bulletTravelDirection.set(180, [1, 0]);

const colors = ["blue", "green", "yellow", "purple", "red", "darkblue"];
const players = [];
const bullets = [];
const bulletCounters = [];

//Создать сервер
const server = http.createServer(app);
let wsServer = new webSocketServer({
  httpServer: server,
});

//WebSocket сервер
wsServer.on("request", function (request) {
  console.log(new Date() + " Connection from " + request.origin);
  let connection = request.accept(null, request.origin);

  let player = createNewPlayer();

  //Добавить созданного игрока к состоянию игры
  players.push(player);
  bullets.push({ [player.color]: [] });
  bulletCounters.push({ [player.color]: 0 });
  //Разослать обновленные позиции игроков всем игрокам
  sendPlayerPositions();

  //Обработчик сообщений от игрока
  connection.on("message", (message) => {
    // console.log("From: " + player.color + "; Msg: " + message.utf8Data);
    handleCommand(player, message.utf8Data); //обработать команду
    sendPlayerPositions(); //разослать обновленное состояние игры всем игрокам
  });

  //Пользователь отсоединился
  connection.on("close", (connection) => {
    onPlayerDisconnect(player);
  });
});

server.listen(3000, () => {
  console.log("Server is listening on 3000...");
});

function sendPlayerPositions() {
  wsServer.connections.forEach((connection) => {
    connection.send(JSON.stringify({ players: players }));
  });
}

function sendBulletsPositions() {
  wsServer.connections.forEach((connection) => {
    connection.send(JSON.stringify({ bullets: bullets }));
  });
}

function sendPlayerDisconnected(color) {
  wsServer.connections.forEach((connection) => {
    connection.send(JSON.stringify({ disconnected: color }));
  });
}

function handleCommand(player, command) {
  if (command === "left") {
    player.rotation = -90;
    if (player.left > gameSettings.playerSpeed) {
      player.left -= gameSettings.playerSpeed;
    }
  } else if (command === "right") {
    player.rotation = 90;
    if (player.left < gameSettings.boardWidth - gameSettings.playerSize) {
      player.left += gameSettings.playerSpeed;
    }
  } else if (command === "up") {
    player.rotation = 0;
    if (player.top > gameSettings.playerSpeed) {
      player.top -= gameSettings.playerSpeed;
    }
  } else if (command === "down") {
    player.rotation = 180;
    if (player.top < gameSettings.boardHeight - gameSettings.playerSize) {
      player.top += gameSettings.playerSpeed;
    }
  } else if (command === "fire") {
    onPlayerFire(player);
  }
}

//Создание нового игрока со случайным цветом и стартовой позицией
function createNewPlayer() {
  let newPlayer = {
    left: Math.floor(Math.random() * gameSettings.boardWidth),
    top: Math.floor(Math.random() * gameSettings.boardHeight),
    rotation: 0,
    bullets: 0,
    color: colors.shift(),
  };

  return newPlayer;
}

function onPlayerDisconnect(disconnectedPlayer) {
  console.log(
    new Date() + " Player " + disconnectedPlayer.color + " disconnected"
  );
  //Убрать игрока из состояния игры
  players.splice(players.indexOf(disconnectedPlayer), 1);
  let bIndex = bullets.findIndex((element) => {
    return element.hasOwnProperty(disconnectedPlayer.color);
  });

  bullets.splice(bIndex, 1);
  bulletCounters.splice(bIndex, 1);
  //Разослать сообщение о дисконнекте игрока
  sendPlayerDisconnected(disconnectedPlayer.color);
  //Вернуть цвет игрока в общий массив цветов
  colors.push(disconnectedPlayer.color);
}

function onPlayerFire(player) {
  let index = bullets.findIndex((element) => {
    return element.hasOwnProperty(player.color);
  });

  let bulletArray = bullets[index][player.color];

  //Ограничение на максимальное количество снарядов, выпускаемых одним игроком
  if (bulletArray.length >= gameSettings.maxBulletsPerPlayer) {
    return;
  }

  let newBullet = {
    top:
      player.top +
      gameSettings.bulletSize * bulletSpawnDirection.get(player.rotation)[0],
    left:
      player.left +
      gameSettings.bulletSize * bulletSpawnDirection.get(player.rotation)[1],
    rotation: player.rotation,
    id: `${player.color}-${bulletCounters[index][player.color]}`,
  };
  bulletCounters[index][player.color]++;
  bulletArray.push(newBullet);
}

function updateBullets() {
  bullets.forEach((element) => {
    let color = Object.keys(element)[0];

    //Убрать снаряды, вылетевшие за пределы игровой зоны
    element[color] = element[color].filter((bullet) => {
      return isBulletInGameArea(bullet);
    });

    //Обновить координаты снарядов
    element[color].forEach((bullet) => {
      bullet.top +=
        bulletTravelDistancePerTick *
        bulletTravelDirection.get(bullet.rotation)[0];
      bullet.left +=
        bulletTravelDistancePerTick *
        bulletTravelDirection.get(bullet.rotation)[1];
    });
  });

  sendBulletsPositions();
}

function isBulletInGameArea(bullet) {
  return (
    bullet.top >= 0 &&
    bullet.top <= gameSettings.boardHeight &&
    bullet.left >= 0 &&
    bullet.left <= gameSettings.boardWidth
  );
}

setInterval(updateBullets, gameSettings.tickDuration);
