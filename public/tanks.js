window.onload = init;

const WS_SERVER_ADDRESS = "ws://192.168.0.4:3000";

let gameArea, scoreboard, socket, thisPlayerColor;
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
  scoreboard = document.getElementById("scoreboard");

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
    } else if (gameObject.hasOwnProperty("bulletMap")) {
      //Сообщение с обновленными позициями снарядов игроков
      onBulletsPositionUpdate(new Map(gameObject.bulletMap));
    } else if (gameObject.hasOwnProperty("disconnected")) {
      //В пришедшем сообщении указан цвет отсоединившегося игрока
      onPlayerDisconnected(gameObject.disconnected);
    } else if (gameObject.hasOwnProperty("hits")) {
      onHitMessage(gameObject);
    } else if (gameObject.hasOwnProperty("killed")) {
      onKilledPlayersMessage(gameObject);
    } else if (gameObject.hasOwnProperty("yourColor")) {
      highlightPlayer(gameObject.yourColor);
    } else if (gameObject.hasOwnProperty("score")) {
      onScoreUpdate(gameObject.score);
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
      plDiv.id = player.color;
      plDiv.className = "player";
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
  healthbar.className = "healthbar";
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

function highlightPlayer(yourColor) {
  thisPlayerColor = yourColor;
  let playerDiv = document.querySelector(`#${thisPlayerColor}`);
  playerDiv.classList.add("this-player");
  let scoreDiv = document.querySelector(`#scoreboard .${thisPlayerColor}`);
  scoreDiv.classList.add("this-player-score");
}

function onScoreUpdate(scores) {
  scoreboard.innerHTML = "";
  scores.sort((a, b) => {
    return b[1] - a[1];
  });
  let scoreMap = new Map(scores);
  scoreMap.forEach((score, playerColor) => {
    createScoreBoardItem(score, playerColor);
  });
}

function createScoreBoardItem(score, playerColor) {
  let scoreDiv = document.createElement("div");
  scoreDiv.classList.add("score-item", playerColor);
  let span = document.createElement("span");
  span.innerHTML = playerColor;
  scoreDiv.appendChild(span);
  scoreDiv.innerHTML += ` ${score}`;
  if (thisPlayerColor == playerColor) {
    scoreDiv.classList.add("this-player-score");
  }
  scoreboard.appendChild(scoreDiv);
}

function onBulletsPositionUpdate(bulletMap) {
  let allRenderedBullets = document.querySelectorAll(".bullet");
  allRenderedBullets = Array.prototype.slice.call(allRenderedBullets);

  bulletMap.forEach((bullets, playerColor) => {
    const existingBulletsIds = [];
    bullets.forEach((bullet) => {
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
    bulletDiv.className = "bullet";
    bulletDiv.id = bullet.id;
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
    animateTakenDamage(hitData.hit, hitData.hpLeft);
    onHpUpdate(hitData.hit, hitData.hpLeft);
  });
}

function onKilledPlayersMessage(message) {
  message.killed.forEach((killedPlayerColor) => {
    animatePlayerDeath(killedPlayerColor);

    //чтобы анимация получения урона не накладывалась на анимацию смерти
    clearTimeout(animTimeoutIds.get(killedPlayerColor));

    setTimeout(removeDeadPlayer, explosionAnimDuration, killedPlayerColor);
  });
}

function animateTakenDamage(damagePlayerColor, hpLeft) {
  let plImg = document.querySelector(`#${damagePlayerColor} img`);
  plImg.src = "./images/tank_hit.png";
  if (hpLeft > 0) {
    let tId = setTimeout(() => {
      plImg.src = `./images/tank_${damagePlayerColor}.png`;
    }, 200);
    animTimeoutIds.set(damagePlayerColor, tId);
  }
}

function animatePlayerDeath(killedPlayerColor) {
  let killedPlayerDiv = document.querySelector(`#${killedPlayerColor}`);
  let img = document.querySelector(`#${killedPlayerColor} img`);

  //Убрать контур игрока, мешающий воспроизведению gif
  if (killedPlayerColor == thisPlayerColor) {
    killedPlayerDiv.classList.remove("this-player");
  }

  img.src = "./images/explosion.gif";
  let healthbar = document.querySelector(`#${killedPlayerColor} .healthbar`);
  healthbar.style.display = "none";
}

function removeDeadPlayer(killedPlayerColor) {
  let killedPlayerDiv = document.querySelector(`#${killedPlayerColor}`);
  if (!killedPlayerDiv) {
    return;
  }
  killedPlayerDiv.parentNode.removeChild(killedPlayerDiv);
}

function onPlayerDisconnected(color) {
  animTimeoutIds.delete(color);
  let plDiv = document.getElementById(color);
  if (!plDiv) {
    return;
  }
  plDiv.parentNode.removeChild(plDiv);

  let scoreDiv = document.querySelector(`#scoreboard .${color}`);
  scoreDiv.parentNode.removeChild(scoreDiv);
}
