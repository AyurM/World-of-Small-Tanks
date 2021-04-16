window.onload = init;

const WS_SERVER_ADDRESS = "ws://192.168.0.4:3000";

let gameArea, socket;
const boardWidth = 1000;
const boardHeight = 667;

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
    console.log(message.data);
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
  bullets.forEach((element) => {
    let color = Object.keys(element)[0];
    element[color].forEach((bullet) => {
      updateBulletPosition(bullet, color);
    });
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

  //Удалить снаряды, вылетевшие за пределы игровой зоны
  if (
    !(
      bullet.top >= 0 &&
      bullet.top <= boardHeight &&
      bullet.left >= 0 &&
      bullet.left <= boardWidth
    )
  ) {
    bulletDiv.parentNode.removeChild(bulletDiv);
    return;
  }

  bulletDiv.style.top = bullet.top + "px";
  bulletDiv.style.left = bullet.left + "px";
  bulletDiv.style.transform = `rotate(${bullet.rotation}deg)`;
  gameArea.appendChild(bulletDiv);
}

function onPlayerDisconnected(color) {
  let plDiv = document.getElementById(color);
  if (!plDiv) {
    return;
  }
  plDiv.parentNode.removeChild(plDiv);
}
