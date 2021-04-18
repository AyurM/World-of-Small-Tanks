window.onload = init;

const WS_SERVER_ADDRESS = "ws://192.168.0.4:3000";

let gameArea, socket;
const boardWidth = 1000;
const boardHeight = 667;
const bulletSize = 16;

const commands = new Map();
commands.set("ArrowLeft", "left");
commands.set("ArrowUp", "up");
commands.set("ArrowRight", "right");
commands.set("ArrowDown", "down");
commands.set(" ", "fire");

function init() {
  gameArea = document.getElementById("game-area");

  socket = new WebSocket(WS_SERVER_ADDRESS);

  socket.onopen = function () {
    alert("Соединение установлено");
    document.addEventListener("keydown", handleKeyPress);
  };

  socket.onclose = function (event) {
    alert("Соединение закрыто");
  };

  //Обработчик сообщений от сервера
  socket.onmessage = function (message) {
    // console.log(message.data);
    let gameObject = JSON.parse(message.data);

    if (gameObject.hasOwnProperty("players")) {
      //Сообщение с обновленными позициями игроков
      onPlayersPositionUpdate(gameObject.players);
    } else if (gameObject.hasOwnProperty("bullets")) {
      //Сообщение с обновленными позициями снарядов игроков
      onBulletsPositionUpdate(gameObject.bullets);
    } else if (gameObject.hasOwnProperty("disconnected")) {
      //В пришедшем сообщении указан цвет отсоединившегося игрока
      onPlayerDisconnected(gameObject.disconnected);
    } else if (gameObject.hasOwnProperty("hits")) {
      onHitMessage(gameObject.hits);
    }
  };
}

function handleKeyPress(e) {
  socket.send(commands.get(e.key));
}

function onPlayersPositionUpdate(players) {
  players.forEach((player) => {
    let plDiv = document.getElementById(player.color);
    if (!plDiv) {
      //Игрок только что подключился, создать его на поле
      plDiv = document.createElement("div");
      plDiv.setAttribute("id", player.color);
      plDiv.setAttribute("class", "player");
      plImg = document.createElement("img");
      plImg.src = "./images/tank_" + player.color + ".png";
      plDiv.appendChild(plImg);
    }
    plDiv.style.top = player.top + "px";
    plDiv.style.left = player.left + "px";
    plDiv.style.transform = `rotate(${player.rotation}deg)`;
    gameArea.appendChild(plDiv);
  });
}

function onBulletsPositionUpdate(bullets) {
  let allRenderedBullets = document.querySelectorAll(".bullet");
  allRenderedBullets = Array.prototype.slice.call(allRenderedBullets);

  bullets.forEach((element) => {
    let playerColor = Object.keys(element)[0];
    const existingBulletsIds = [];
    element[playerColor].forEach((bullet) => {
      existingBulletsIds.push(bullet.id);
      updateBulletPosition(bullet, playerColor);
    });

    deleteBulletsNotExistingOnServer(
      allRenderedBullets,
      existingBulletsIds,
      playerColor
    );
  });
}

function updateBulletPosition(bullet, color) {
  let bulletDiv = document.getElementById(bullet.id);
  if (!bulletDiv) {
    //Создание нового снаряда
    bulletDiv = document.createElement("div");
    bulletDiv.setAttribute("class", "bullet");
    bulletDiv.setAttribute("id", bullet.id);
    let img = document.createElement("img");
    img.src = `./images/bullet_${color}.png`;
    bulletDiv.appendChild(img);
  }

  //Обновить позицию снаряда
  bulletDiv.style.top = bullet.top + "px";
  bulletDiv.style.left = bullet.left + "px";
  bulletDiv.style.transform = `rotate(${bullet.rotation}deg)`;
  gameArea.appendChild(bulletDiv);
}

function deleteBulletsNotExistingOnServer(
  allRenderedBullets,
  existingBulletsIds,
  playerColor
) {
  let currentPlayerBulletsOnClient = allRenderedBullets.filter((bulletDiv) => {
    return bulletDiv.id.startsWith(playerColor);
  });

  let bulletsNotExistingOnServer = currentPlayerBulletsOnClient.filter(
    (bulletDiv) => {
      return !existingBulletsIds.includes(bulletDiv.id);
    }
  );
  bulletsNotExistingOnServer.forEach((bulletDiv) => {
    bulletDiv.parentNode.removeChild(bulletDiv);
  });
}

function onHitMessage(hits) {
  hits.forEach((hitData) => {
    let plImg = document.querySelector(`#${hitData.hit} img`);
    plImg.src = "./images/tank_hit.png";
    setTimeout(() => {
      plImg.src = `./images/tank_${hitData.hit}.png`;
    }, 200);
  });
}

function onPlayerDisconnected(color) {
  let plDiv = document.getElementById(color);
  if (!plDiv) {
    return;
  }
  plDiv.parentNode.removeChild(plDiv);
}
