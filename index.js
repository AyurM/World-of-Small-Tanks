const http = require("http");
const express = require("express");
const webSocketServer = require("websocket").server;

const MoveCommandsMap = require("./movement_commands");

const app = express();
app.use(express.static("public"));

//Настройки игры
const gameSettings = {
  playerSpeed: 10,
  playerSize: 48,
  playerHealth: 3,
  bulletSize: 16,
  bulletSpeed: 500,
  maxBulletsPerPlayer: 3,
  boardWidth: 1000,
  boardHeight: 667,
  tickDuration: 17,
  respawnDelay: 4000,
};

let bulletTravelDistancePerTick = Math.round(
  (gameSettings.bulletSpeed * gameSettings.tickDuration) / 1000
);
const bulletSpawnDirection = new Map([
  [0, [-1, 1]],
  [90, [1, 3]],
  [-90, [1, -1]],
  [180, [3, 1]],
]);

const bulletTravelDirection = new Map([
  [0, [-1, 0]],
  [90, [0, 1]],
  [-90, [0, -1]],
  [180, [1, 0]],
]);

const connectionMap = new Map();

const colors = ["blue", "green", "yellow", "purple", "red", "darkblue"];
const players = [];
const hitPoints = new Map();
const bulletMap = new Map();
const bulletCounters = new Map();

//Создать сервер
const server = http.createServer(app);
let wsServer = new webSocketServer({
  httpServer: server,
});

//WebSocket сервер
wsServer.on("request", function (request) {
  if (colors.length === 0) {
    request.reject();
    console.log(
      new Date() + " Connection from " + request.origin + " rejected"
    );
    return;
  }

  let connection = request.accept(null, request.origin);
  console.log(new Date() + " Connection from " + request.origin + " accepted");

  let player = createNewPlayer();

  //Добавить созданного игрока к состоянию игры
  initPlayer(player, connection);
  //Разослать обновленные позиции игроков всем игрокам
  sendPlayerPositions();
  connection.send(JSON.stringify({ yourColor: player.color }));
  //Обработчик сообщений от игрока
  connection.on("message", (message) => {
    // console.log("From: " + player.color + "; Msg: " + message.utf8Data);
    handleCommand(player, message.utf8Data); //обработать команду
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
    connection.send(
      JSON.stringify({ bulletMap: Array.from(bulletMap.entries()) })
    );
  });
}

function sendHitsData(hits) {
  if (hits.length > 0) {
    wsServer.connections.forEach((connection) => {
      connection.send(JSON.stringify({ hits: hits }));
    });
  }
}

function sendKillsData(killedPlayers) {
  if (killedPlayers.length > 0) {
    wsServer.connections.forEach((connection) => {
      connection.send(JSON.stringify({ killed: killedPlayers }));
    });
  }
}

function sendPlayerDisconnected(color) {
  wsServer.connections.forEach((connection) => {
    connection.send(JSON.stringify({ disconnected: color }));
  });
}

function handleCommand(player, command) {
  if (!players.includes(player)) {
    return;
  }

  if (MoveCommandsMap.has(command)) {
    MoveCommandsMap.get(command)(player, gameSettings);
    sendPlayerPositions();
  } else if (command === "fire") {
    onPlayerFire(player);
  }
}

//Создание нового игрока со случайным цветом и стартовой позицией
function createNewPlayer() {
  let newPlayer = {
    left: Math.floor(
      Math.random() * (gameSettings.boardWidth - gameSettings.playerSize)
    ),
    top: Math.floor(
      Math.random() * (gameSettings.boardHeight - gameSettings.playerSize)
    ),
    rotation: 0,
    color: colors.shift(),
  };

  return newPlayer;
}

function initPlayer(player, ws_conn) {
  players.push(player);
  hitPoints.set(player.color, gameSettings.playerHealth);
  bulletMap.set(player.color, []);
  bulletCounters.set(player.color, 0);
  connectionMap.set(player.color, ws_conn);
}

function onPlayerDisconnect(disconnectedPlayer) {
  console.log(
    new Date() + " Player " + disconnectedPlayer.color + " disconnected"
  );
  //Убрать игрока из состояния игры
  players.splice(players.indexOf(disconnectedPlayer), 1);
  hitPoints.delete(disconnectedPlayer.color);
  bulletMap.delete(disconnectedPlayer.color);
  bulletCounters.delete(disconnectedPlayer.color);
  connectionMap.delete(disconnectedPlayer.color);
  //Разослать сообщение о дисконнекте игрока
  sendPlayerDisconnected(disconnectedPlayer.color);
  //Вернуть цвет игрока в общий массив цветов
  colors.push(disconnectedPlayer.color);
}

function onPlayerFire(player) {
  //Ограничение на максимальное количество снарядов, выпускаемых одним игроком
  if (bulletMap.get(player.color).length >= gameSettings.maxBulletsPerPlayer) {
    return;
  }

  let bulletNumber = bulletCounters.get(player.color);
  let newBullet = createBullet(player, bulletNumber);
  bulletCounters.set(player.color, ++bulletNumber);
  bulletMap.get(player.color).push(newBullet);
}

function createBullet(player, bulletNumber) {
  let newBullet = {
    top:
      player.top +
      gameSettings.bulletSize * bulletSpawnDirection.get(player.rotation)[0],
    left:
      player.left +
      gameSettings.bulletSize * bulletSpawnDirection.get(player.rotation)[1],
    rotation: player.rotation,
    id: `${player.color}-${bulletNumber}`,
  };
  return newBullet;
}

function updateBullets() {
  const hits = [];
  const killedPlayers = [];

  bulletMap.forEach((bulletArray, playerColor) => {
    tempBulletArray = bulletArray.filter((bullet) => {
      return isBulletInGameArea(bullet);
    });

    //Обновить координаты снарядов
    tempBulletArray.forEach((bullet, bulletIndex) => {
      moveBullet(bullet);

      //Проверить попадания снарядов по игрокам
      players.forEach((otherPlayer) => {
        if (checkBulletHit(bullet, otherPlayer)) {
          let hp = getPlayerHpAfterHit(otherPlayer);
          if (hp <= 0) {
            killedPlayers.push(otherPlayer.color);
            onPlayerDeath(otherPlayer);
          } else {
            hits.push({
              hit: otherPlayer.color,
              hpLeft: hp,
              attacker: playerColor,
            });
          }
          tempBulletArray.splice(bulletIndex, 1);
        }
      });
    });

    bulletMap.set(playerColor, tempBulletArray);
  });

  sendHitsData(hits);
  sendKillsData(killedPlayers);
  sendBulletsPositions();
}

function isBulletInGameArea(bullet) {
  return (
    bullet.top >= 0 &&
    bullet.top <= gameSettings.boardHeight - gameSettings.bulletSize &&
    bullet.left >= 0 &&
    bullet.left <= gameSettings.boardWidth - gameSettings.bulletSize
  );
}

function moveBullet(bullet) {
  bullet.top +=
    bulletTravelDistancePerTick * bulletTravelDirection.get(bullet.rotation)[0];
  bullet.left +=
    bulletTravelDistancePerTick * bulletTravelDirection.get(bullet.rotation)[1];
}

function checkBulletHit(bullet, player) {
  return (
    bullet.top >= player.top &&
    bullet.top <= player.top + gameSettings.playerSize &&
    bullet.left >= player.left &&
    bullet.left <= player.left + gameSettings.playerSize
  );
}

function getPlayerHpAfterHit(player) {
  let result = hitPoints.get(player.color);
  hitPoints.set(player.color, --result);
  return result;
}

function onPlayerDeath(player) {
  players.splice(players.indexOf(player), 1);
  setTimeout(respawnPlayer, gameSettings.respawnDelay, player);
}

function respawnPlayer(player) {
  player.left = Math.floor(
    Math.random() * (gameSettings.boardWidth - gameSettings.playerSize)
  );
  player.top = Math.floor(
    Math.random() * (gameSettings.boardHeight - gameSettings.playerSize)
  );
  hitPoints.set(player.color, gameSettings.playerHealth);
  players.push(player);
  sendPlayerPositions();
  connectionMap
    .get(player.color)
    .send(JSON.stringify({ yourColor: player.color }));
}

setInterval(updateBullets, gameSettings.tickDuration);
