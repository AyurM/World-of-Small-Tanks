const moveCommandsMap = new Map([
  ["left", onMoveLeft],
  ["right", onMoveRight],
  ["up", onMoveUp],
  ["down", onMoveDown],
]);

function onMoveLeft(player, gameSettings) {
  player.rotation = -90;
  if (player.left > gameSettings.playerSpeed) {
    player.left -= gameSettings.playerSpeed;
  }
}

function onMoveRight(player, gameSettings) {
  player.rotation = 90;
  if (player.left < gameSettings.boardWidth - gameSettings.playerSize) {
    player.left += gameSettings.playerSpeed;
  }
}

function onMoveUp(player, gameSettings) {
  player.rotation = 0;
  if (player.top > gameSettings.playerSpeed) {
    player.top -= gameSettings.playerSpeed;
  }
}

function onMoveDown(player, gameSettings) {
  player.rotation = 180;
  if (player.top < gameSettings.boardHeight - gameSettings.playerSize) {
    player.top += gameSettings.playerSpeed;
  }
}

module.exports = moveCommandsMap;
