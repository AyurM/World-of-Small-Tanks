window.onload = init;

const WS_SERVER_ADDRESS = "ws://192.168.0.4:3000";

let gameArea, socket;
const boardWidth = 1000;
const boardHeight = 667;
const bulletSize = 16;
const playerHealth = 3;
const explosionAnimDuration = 1200;

const commands = new Map([
  ["ArrowLeft", "left"],
  ["ArrowUp", "up"],
  ["ArrowRight", "right"],
  ["ArrowDown", "down"],
  [" ", "fire"],
]);

//для корректной смены спрайтов повреждения/уничтожения
const animTimeoutIds = new Map();

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
      console.log(message.data);
      onHitMessage(gameObject);
    } else if (gameObject.hasOwnProperty("killed")) {
      console.log(message.data);
      onKilledPlayersMessage(gameObject);
    }
  };
}

function handleKeyPress(e) {
  socket.send(commands.get(e.key));
}

function onPlayersPositionUpdate(players) {
  players.forEach((player) => {
    let plDiv = document.getElementById(player.color);
    let plImg = document.querySelector(`#${player.color} img`);
    if (!plDiv) {
      //Игрок только что подключился, создать его на поле
      plDiv = document.createElement("div");
      plDiv.setAttribute("id", player.color);
      plDiv.setAttribute("class", "player");
      plImg = document.createElement("img");
      plImg.src = "./images/tank_" + player.color + ".png";
      plDiv.appendChild(plImg);
      drawHP(plDiv);
      animTimeoutIds.set(player.color, null);
    }
    plDiv.style.top = player.top + "px";
    plDiv.style.left = player.left + "px";
    plImg.style.transform = `rotate(${player.rotation}deg)`;

    gameArea.appendChild(plDiv);
  });
}

function drawHP(plDiv) {
  let healthbar = document.createElement("div");
  healthbar.classList.add("healthbar");
  for (let i = 0; i < playerHealth; i++) {
    let healthTick = document.createElement("div");
    healthTick.classList.add("health-tick");
    healthTick.classList.add("full");
    healthbar.appendChild(healthTick);
  }
  plDiv.appendChild(healthbar);
}

function onHpUpdate(playerColor, hitPoints) {
  let healthTicks = document.querySelectorAll(`#${playerColor} .health-tick`);
  healthTicks.forEach((healthTick, index) => {
    if (index <= hitPoints - 1) {
      healthTick.classList.remove("low");
      healthTick.classList.add("full");
    } else {
      healthTick.classList.remove("full");
      healthTick.classList.add("low");
    }
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

function onHitMessage(message) {
  message.hits.forEach((hitData) => {
    let plImg = document.querySelector(`#${hitData.hit} img`);
    plImg.src = "./images/tank_hit.png";
    if (hitData.hpLeft > 0) {
      let tId = setTimeout(() => {
        plImg.src = `./images/tank_${hitData.hit}.png`;
      }, 200);
      animTimeoutIds.set(hitData.hit, tId);
    }
    onHpUpdate(hitData.hit, hitData.hpLeft);
  });
}

function onKilledPlayersMessage(message) {
  message.killed.forEach((killedPlayerColor) => {
    let killedPlayerDiv = document.querySelector(`#${killedPlayerColor}`);
    let img = document.querySelector(`#${killedPlayerColor} img`);
    img.src = "./images/explosion.gif";
    let healthbar = document.querySelector(`#${killedPlayerColor} .healthbar`);
    healthbar.style.display = "none";
    clearTimeout(animTimeoutIds.get(killedPlayerColor));
    setTimeout(() => {
      killedPlayerDiv.parentNode.removeChild(killedPlayerDiv);
    }, explosionAnimDuration);
  });
}

function onPlayerDisconnected(color) {
  animTimeoutIds.delete(color);
  let plDiv = document.getElementById(color);
  if (!plDiv) {
    return;
  }
  plDiv.parentNode.removeChild(plDiv);
}
