const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

window.focus();
canvas.focus();

// Two lane centers on a 1280x720 canvas
const lanes = [575, 705];
let carLane = 0; // 0 = Left lane, 1 = Right lane
let driverScore = 0;
let donkeyScore = 0;
let speed = 260; // pixels per second
let dashOffset = 0;

// Game state: "PLAYING", "PAUSED", "QUIT"
let gameState = "PLAYING";
const menuOptions = ["Resume", "Restart", "Quit"];
let selectedMenuIndex = 0;

const car = {
  width: 46,
  height: 80,
  y: 540
};

let donkey = {
  lane: 1,
  y: -60,
  width: 46,
  height: 38
};

function resetDonkey() {
  donkey.lane = Math.random() < 0.5 ? 0 : 1;
  donkey.y = -60;
  speed = Math.min(760, speed + 16);
}

function restartGame() {
  carLane = 0;
  driverScore = 0;
  donkeyScore = 0;
  speed = 260;
  dashOffset = 0;
  donkey.lane = 1;
  donkey.y = -60;
  selectedMenuIndex = 0;
  gameState = "PLAYING";
  lastTime = performance.now();
}

function quitGame() {
  gameState = "QUIT";
  if (window.tizen && tizen.application) {
    tizen.application.getCurrentApplication().exit();
  }
}

function moveLeft() {
  carLane = 0;
}

function moveRight() {
  carLane = 1;
}

function handleMenuSelection() {
  const choice = menuOptions[selectedMenuIndex];
  if (choice === "Resume") {
    gameState = "PLAYING";
    lastTime = performance.now();
  } else if (choice === "Restart") {
    restartGame();
  } else if (choice === "Quit") {
    quitGame();
  }
}

document.addEventListener("keydown", (e) => {
  const key = e.key;
  const code = e.keyCode;

  // Handle Quit screen
  if (gameState === "QUIT") {
    if (key === "Enter" || key === " " || code === 13 || code === 32) {
      e.preventDefault();
      restartGame();
    }
    return;
  }

  // Handle Paused menu navigation
  if (gameState === "PAUSED") {
    if (key === "ArrowUp" || code === 38) {
      e.preventDefault();
      selectedMenuIndex = (selectedMenuIndex - 1 + menuOptions.length) % menuOptions.length;
    } else if (key === "ArrowDown" || code === 40) {
      e.preventDefault();
      selectedMenuIndex = (selectedMenuIndex + 1) % menuOptions.length;
    } else if (key === "Enter" || key === " " || code === 13 || code === 32) {
      e.preventDefault();
      handleMenuSelection();
    } else if (code === 10009 || key === "Escape" || code === 27 || key === "p" || key === "P") {
      e.preventDefault();
      gameState = "PLAYING";
      lastTime = performance.now();
    }
    return;
  }

  // Handle Active Gameplay
  if (key === "ArrowLeft" || code === 37) {
    e.preventDefault();
    moveLeft();
  } else if (key === "ArrowRight" || code === 39) {
    e.preventDefault();
    moveRight();
  } else if (
    key === "Enter" ||
    key === " " ||
    code === 13 ||
    code === 32 ||
    code === 10009 ||
    key === "Escape" ||
    code === 27 ||
    key === "p" ||
    key === "P"
  ) {
    e.preventDefault();
    selectedMenuIndex = 0;
    gameState = "PAUSED";
  } else if (key === "q" || key === "Q") {
    e.preventDefault();
    quitGame();
  }
});

let lastTime = performance.now();

function update(dt) {
  if (gameState !== "PLAYING") return;

  dashOffset = (dashOffset + speed * dt) % 60;
  donkey.y += speed * dt;

  const sameLane = carLane === donkey.lane;
  const hitY = donkey.y + donkey.height > car.y && donkey.y < car.y + car.height;

  if (sameLane && hitY) {
    donkeyScore += 1;
    resetDonkey();
    return;
  }

  if (donkey.y > 670) {
    driverScore += 1;
    resetDonkey();
  }
}

function drawDonkey(x, y) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x - 18, y + 8, 36, 18);
  ctx.fillRect(x + 12, y + 2, 12, 12);
  ctx.fillRect(x + 14, y - 6, 4, 8);
  ctx.fillRect(x + 20, y - 6, 4, 8);
  ctx.fillRect(x - 16, y + 26, 6, 10);
  ctx.fillRect(x + 10, y + 26, 6, 10);
  ctx.fillRect(x - 24, y + 10, 6, 4);
}

function drawCar(x, y) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x - 23, y + 10, 7, 18);
  ctx.fillRect(x + 16, y + 10, 7, 18);
  ctx.fillRect(x - 23, y + 50, 7, 18);
  ctx.fillRect(x + 16, y + 50, 7, 18);
  ctx.fillRect(x - 14, y + 4, 28, 72);
  ctx.fillRect(x - 7, y - 6, 14, 12);
}

function drawPauseOverlay() {
  ctx.fillStyle = "rgba(0, 0, 0, 0.78)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#111111";
  ctx.strokeStyle = "#48e5ff";
  ctx.lineWidth = 4;
  ctx.fillRect(440, 170, 400, 360);
  ctx.strokeRect(440, 170, 400, 360);

  ctx.fillStyle = "#48e5ff";
  ctx.font = "bold 34px monospace";
  ctx.textAlign = "center";
  ctx.fillText("GAME PAUSED", 640, 235);

  menuOptions.forEach((label, index) => {
    const y = 305 + index * 65;
    const isSelected = index === selectedMenuIndex;

    if (isSelected) {
      ctx.fillStyle = "#48e5ff";
      ctx.fillRect(490, y - 32, 300, 46);
      ctx.fillStyle = "#000000";
    } else {
      ctx.fillStyle = "#ffffff";
    }

    ctx.font = "bold 26px monospace";
    ctx.fillText(isSelected ? `> ${label} <` : label, 640, y);
  });

  ctx.fillStyle = "#aaaaaa";
  ctx.font = "18px monospace";
  ctx.fillText("UP/DOWN to select • ENTER to confirm", 640, 505);
}

function drawQuitOverlay() {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#48e5ff";
  ctx.font = "bold 36px monospace";
  ctx.textAlign = "center";
  ctx.fillText("GAME STOPPED", 640, 310);

  ctx.fillStyle = "#ffffff";
  ctx.font = "22px monospace";
  ctx.fillText("You can close this browser tab now.", 640, 365);
  ctx.fillText("Press ENTER to play again.", 640, 410);
}

function draw() {
  if (gameState === "QUIT") {
    drawQuitOverlay();
    return;
  }

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Left & right cyan score panels
  ctx.fillStyle = "#48e5ff";
  ctx.fillRect(210, 40, 270, 640);
  ctx.fillRect(800, 40, 270, 640);

  // Center road
  ctx.fillStyle = "#5a5a5a";
  ctx.fillRect(480, 40, 320, 640);

  // Road edge lines
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(480, 40, 4, 640);
  ctx.fillRect(796, 40, 4, 640);

  // Dashed lane divider
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.setLineDash([25, 35]);
  ctx.lineDashOffset = -dashOffset;
  ctx.beginPath();
  ctx.moveTo(640, 40);
  ctx.lineTo(640, 680);
  ctx.stroke();
  ctx.setLineDash([]);

  // Score labels
  ctx.fillStyle = "#000000";
  ctx.font = "bold 30px monospace";
  ctx.textAlign = "center";
  ctx.fillText("Donkey:", 345, 110);
  ctx.fillText(String(donkeyScore), 345, 155);

  ctx.fillText("Driver:", 935, 110);
  ctx.fillText(String(driverScore), 935, 155);

  // Controls hint on right panel
  ctx.font = "bold 19px monospace";
  ctx.fillText("LEFT / RIGHT: Steer", 935, 490);
  ctx.fillText("ENTER / ESC: Pause", 935, 525);
  ctx.fillText("Q: Quit", 935, 560);

  // Draw sprites
  drawDonkey(lanes[donkey.lane], donkey.y);
  drawCar(lanes[carLane], car.y);

  if (gameState === "PAUSED") {
    drawPauseOverlay();
  }
}

function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
