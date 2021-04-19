const http = require("http");
const express = require("express");
const webSocketServer = require("websocket").server;

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
  respawnDelay: 3000,
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

const colors = ["blue", "green", "yellow", "purple", "red", "darkblue"];
const players = [];
const hitPoints = [];
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
  hitPoints.push({ [player.color]: gameSettings.playerHealth });
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
  hitPoints.splice(bIndex, 1);
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
  const hits = [];
  const killedPlayers = [];
  bullets.forEach((element) => {
    let color = Object.keys(element)[0];

    //Убрать снаряды, вылетевшие за пределы игровой зоны
    element[color] = element[color].filter((bullet) => {
      return isBulletInGameArea(bullet);
    });

    //Обновить координаты снарядов
    element[color].forEach((bullet, bulletIndex) => {
      moveBullet(bullet);

      //Проверить попадания снарядов по игрокам
      players.forEach((player) => {
        if (checkBulletHit(bullet, player)) {
          let hp = --hitPoints.find((hpElement) => {
            return hpElement.hasOwnProperty(player.color);
          })[player.color];
          if (hp <= 0) {
            killedPlayers.push(player.color);
            onPlayerDeath(player);
          } else {
            hits.push({ hit: player.color, hpLeft: hp, attacker: color });
          }
          element[color].splice(bulletIndex, 1);
        }
      });
    });
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

function onPlayerDeath(player) {
  players.splice(players.indexOf(player), 1);
  setTimeout(() => {
    player.left = Math.floor(
      Math.random() * (gameSettings.boardWidth - gameSettings.playerSize)
    );
    player.top = Math.floor(
      Math.random() * (gameSettings.boardHeight - gameSettings.playerSize)
    );
    hitPoints.find((element) => {
      return element.hasOwnProperty(player.color);
    })[player.color] = gameSettings.playerHealth;
    players.push(player);
    sendPlayerPositions();
  }, gameSettings.respawnDelay);
}

setInterval(updateBullets, gameSettings.tickDuration);
