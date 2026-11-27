(function () {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    // Cross-version rounded rectangle path helper (avoids ctx.roundRect incompatibility on Tizen)
    function drawRoundedRectPath(context, x, y, w, h, r) {
        const radius = Math.max(0, Math.min(r, w / 2, h / 2));
        context.beginPath();
        context.moveTo(x + radius, y);
        context.arcTo(x + w, y, x + w, y + h, radius);
        context.arcTo(x + w, y + h, x, y + h, radius);
        context.arcTo(x, y + h, x, y, radius);
        context.arcTo(x, y, x + w, y, radius);
        context.closePath();
    }

    // HUD Elements
    const hudBall = document.getElementById('hud-ball');
    const hudScore = document.getElementById('hud-score');
    const hudStage = document.getElementById('hud-stage');
    const hudMode = document.getElementById('hud-mode');

    // Overlay Elements
    const overlay = document.getElementById('overlay');
    const overlayTitle = document.getElementById('overlay-title');
    const overlaySubtitle = document.getElementById('overlay-subtitle');
    const menuButtonsContainer = document.getElementById('menu-buttons');
    const hudButtons = Array.from(document.querySelectorAll('#hud .tv-btn'));

    // Register Samsung TV Remote Keys
    if (typeof tizen !== 'undefined' && tizen.tvinputdevice) {
        const keys = ['MediaPlayPause', 'MediaStop', 'MediaPause', 'MediaPlay'];
        keys.forEach(k => {
            try { tizen.tvinputdevice.registerKey(k); } catch (e) {}
        });
    }

    // Web Audio Synthesizer for Modern Sound Effects
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    let audioCtx = null;
    let soundEnabled = true;

    function playSound(type) {
        if (!soundEnabled || !AudioCtx) return;
        try {
            if (!audioCtx) audioCtx = new AudioCtx();
            if (audioCtx.state === 'suspended') audioCtx.resume();

            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);

            const now = audioCtx.currentTime;
            if (type === 'paddle') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(320, now);
                osc.frequency.exponentialRampToValueAtTime(520, now + 0.08);
                gain.gain.setValueAtTime(0.25, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
                osc.start(now);
                osc.stop(now + 0.08);
            } else if (type === 'brick') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(580, now);
                osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
                gain.gain.setValueAtTime(0.28, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.start(now);
                osc.stop(now + 0.1);
            } else if (type === 'wall') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(240, now);
                gain.gain.setValueAtTime(0.18, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
                osc.start(now);
                osc.stop(now + 0.05);
            } else if (type === 'lose') {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(220, now);
                osc.frequency.linearRampToValueAtTime(90, now + 0.35);
                gain.gain.setValueAtTime(0.25, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
                osc.start(now);
                osc.stop(now + 0.35);
            } else if (type === 'stage') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(440, now);
                osc.frequency.setValueAtTime(554, now + 0.1);
                osc.frequency.setValueAtTime(659, now + 0.2);
                osc.frequency.setValueAtTime(880, now + 0.3);
                gain.gain.setValueAtTime(0.25, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
                osc.start(now);
                osc.stop(now + 0.45);
            }
        } catch (e) {}
    }

    // Difficulty Settings (inspired by 1984 Bricks: Player, Expert, Master)
    const MODES = {
        PLAYER: { label: 'PLAYER', speed: 8.5, paddleWidth: 210, paddleSpeed: 15 },
        EXPERT: { label: 'EXPERT', speed: 11.5, paddleWidth: 165, paddleSpeed: 17 },
        MASTER: { label: 'MASTER', speed: 14.5, paddleWidth: 130, paddleSpeed: 19 }
    };

    // Brick Row Configurations (Real textured brick palettes + original point values)
    const ROW_THEMES = [
        { name: 'Glazed Cyan', base: '#0284c7', light: '#38bdf8', dark: '#0369a1', mortar: '#0c4a6e', points: 160 },
        { name: 'Terracotta Red', base: '#b91c1c', light: '#ef4444', dark: '#7f1d1d', mortar: '#450a0a', points: 80 },
        { name: 'Royal Amethyst', base: '#7e22ce', light: '#a855f7', dark: '#581c87', mortar: '#3b0764', points: 40 },
        { name: 'Sandstone Gold', base: '#b45309', light: '#f59e0b', dark: '#78350f', mortar: '#451a03', points: 20 }
    ];

    // Game State
    let state = 'MENU'; // MENU, READY, PLAYING, PAUSED, GAMEOVER
    let currentMode = 'EXPERT';
    let score = 0;
    let ballNumber = 1;
    const maxBalls = 3;
    let stage = 1;

    // Navigation Focus State
    let focusArea = 'OVERLAY'; // OVERLAY, HUD, or GAME
    let overlayBtnIndex = 1; // Default to Expert
    let hudBtnIndex = 0;

    // Entities
    const paddle = {
        x: canvas.width / 2 - 82,
        y: canvas.height - 55,
        width: 165,
        height: 22,
        vx: 0
    };

    const ball = {
        x: canvas.width / 2,
        y: paddle.y - 16,
        radius: 13,
        vx: 0,
        vy: 0,
        speed: 11.5,
        trail: []
    };

    let bricks = [];
    let particles = [];
    const keysPressed = { left: false, right: false };

    // Build Realistic Brick Wall (4 rows x 14 columns, staggered like real masonry)
    function initBricks() {
        bricks = [];
        const rows = 4;
        const cols = 14;
        const padding = 8;
        const sideMargin = 48;
        const topOffset = 80;
        const brickWidth = (canvas.width - sideMargin * 2 - padding * (cols - 1)) / cols;
        const brickHeight = 42;

        for (let r = 0; r < rows; r++) {
            const theme = ROW_THEMES[r % ROW_THEMES.length];
            const stagger = (r % 2 === 1) ? 18 : 0; // Masonry bond offset
            for (let c = 0; c < cols; c++) {
                const bx = sideMargin + c * (brickWidth + padding) + (stagger - 9);
                const by = topOffset + r * (brickHeight + padding);
                bricks.push({
                    x: bx,
                    y: by,
                    width: brickWidth,
                    height: brickHeight,
                    theme: theme,
                    alive: true,
                    hp: stage > 1 && r === 0 ? 2 : 1 // Top row reinforced on Stage 2+
                });
            }
        }
    }

    function resetBallOnPaddle() {
        const cfg = MODES[currentMode];
        paddle.width = cfg.paddleWidth;
        paddle.x = (canvas.width - paddle.width) / 2;
        ball.x = paddle.x + paddle.width / 2;
        ball.y = paddle.y - ball.radius - 2;
        ball.vx = 0;
        ball.vy = 0;
        ball.speed = cfg.speed + (stage - 1) * 0.8;
        ball.trail = [];
    }

    function launchBall() {
        if (state !== 'READY') return;
        const angle = (-Math.PI / 2) + (Math.random() * 0.5 - 0.25);
        ball.vx = Math.cos(angle) * ball.speed;
        ball.vy = Math.sin(angle) * ball.speed;
        state = 'PLAYING';
        playSound('paddle');
    }

    function startNewGame(modeKey) {
        currentMode = modeKey;
        score = 0;
        ballNumber = 1;
        stage = 1;
        particles = [];
        initBricks();
        resetBallOnPaddle();
        updateHUD();
        state = 'READY';
        hideOverlay();
    }

    function updateHUD() {
        hudBall.textContent = `${ballNumber} / ${maxBalls}`;
        hudScore.textContent = String(score).padStart(5, '0');
        hudStage.textContent = stage;
        hudMode.textContent = MODES[currentMode].label;
    }

    // Spawn Brick Debris Particles
    function spawnParticles(x, y, color) {
        for (let i = 0; i < 14; i++) {
            particles.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                size: Math.random() * 6 + 3,
                color: color,
                alpha: 1
            });
        }
    }

    // Draw a Realistic Textured Brick
    function drawRealBrick(b) {
        const { x, y, width, height, theme, hp } = b;

        // Drop shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        drawRoundedRectPath(ctx, x + 3, y + 4, width, height, 4);
        ctx.fill();

        // Main brick body gradient
        const grad = ctx.createLinearGradient(x, y, x, y + height);
        grad.addColorStop(0, theme.light);
        grad.addColorStop(0.25, theme.base);
        grad.addColorStop(1, theme.dark);

        ctx.fillStyle = grad;
        drawRoundedRectPath(ctx, x, y, width, height, 4);
        ctx.fill();

        // Subtle clay/stone surface grain lines
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillRect(x + 6, y + 6, width - 12, 3);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
        ctx.fillRect(x + 4, y + height - 5, width - 8, 3);

        // Bevel border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);

        // Reinforced armor indicator if HP > 1
        if (hp > 1) {
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 2.5;
            ctx.strokeRect(x + 5, y + 5, width - 10, height - 10);
        }
    }

    // Draw Modern Metallic & Energy Paddle
    function drawPaddle() {
        const { x, y, width, height } = paddle;

        // Glow under paddle
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 18;

        // Metallic body
        const grad = ctx.createLinearGradient(x, y, x, y + height);
        grad.addColorStop(0, '#f8fafc');
        grad.addColorStop(0.4, '#94a3b8');
        grad.addColorStop(1, '#334155');

        ctx.fillStyle = grad;
        drawRoundedRectPath(ctx, x, y, width, height, 11);
        ctx.fill();

        ctx.shadowBlur = 0;

        // Center Cyan Energy Core
        ctx.fillStyle = '#0ea5e9';
        drawRoundedRectPath(ctx, x + 24, y + 6, Math.max(0, width - 48), height - 12, 5);
        ctx.fill();

        // Highlighted Deflection Bumper Tips (Left & Right ends)
        ctx.fillStyle = '#f43f5e';
        drawRoundedRectPath(ctx, x + 2, y + 3, 18, height - 6, 8);
        ctx.fill();
        drawRoundedRectPath(ctx, x + width - 20, y + 3, 18, height - 6, 8);
        ctx.fill();
    }

    // Draw 3D-Shaded Sphere Ball + Motion Trail
    function drawBall() {
        // Motion trail
        ball.trail.forEach((pos, idx) => {
            const ratio = (idx + 1) / ball.trail.length;
            ctx.fillStyle = `rgba(56, 189, 248, ${ratio * 0.25})`;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, ball.radius * ratio * 0.85, 0, Math.PI * 2);
            ctx.fill();
        });

        // 3D Radial Sphere Gradient
        const grad = ctx.createRadialGradient(
            ball.x - ball.radius * 0.35,
            ball.y - ball.radius * 0.35,
            2,
            ball.x,
            ball.y,
            ball.radius
        );
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.35, '#bae6fd');
        grad.addColorStop(0.85, '#0284c7');
        grad.addColorStop(1, '#0c4a6e');

        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 15;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    // Physics & Update Loop
    function update() {
        const cfg = MODES[currentMode];

        // Move Paddle
        if (state === 'READY' || state === 'PLAYING') {
            if (keysPressed.left) paddle.x -= cfg.paddleSpeed;
            if (keysPressed.right) paddle.x += cfg.paddleSpeed;
            paddle.x = Math.max(10, Math.min(canvas.width - paddle.width - 10, paddle.x));
        }

        if (state === 'READY') {
            ball.x = paddle.x + paddle.width / 2;
            ball.y = paddle.y - ball.radius - 2;
        }

        if (state === 'PLAYING') {
            // Save trail
            ball.trail.push({ x: ball.x, y: ball.y });
            if (ball.trail.length > 8) ball.trail.shift();

            ball.x += ball.vx;
            ball.y += ball.vy;

            // Left / Right Wall Bounce
            if (ball.x - ball.radius <= 0) {
                ball.x = ball.radius;
                ball.vx = Math.abs(ball.vx);
                playSound('wall');
            } else if (ball.x + ball.radius >= canvas.width) {
                ball.x = canvas.width - ball.radius;
                ball.vx = -Math.abs(ball.vx);
                playSound('wall');
            }

            // Top Wall Bounce
            if (ball.y - ball.radius <= 0) {
                ball.y = ball.radius;
                ball.vy = Math.abs(ball.vy);
                playSound('wall');
            }

            // Paddle Collision (with original edge deflection physics)
            if (
                ball.vy > 0 &&
                ball.y + ball.radius >= paddle.y &&
                ball.y - ball.radius <= paddle.y + paddle.height &&
                ball.x >= paddle.x - ball.radius &&
                ball.x <= paddle.x + paddle.width + ball.radius
            ) {
                const hitOffset = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
                const clampedOffset = Math.max(-1, Math.min(1, hitOffset));
                const maxBounceAngle = (65 * Math.PI) / 180;
                const bounceAngle = clampedOffset * maxBounceAngle;

                ball.vx = ball.speed * Math.sin(bounceAngle);
                ball.vy = -ball.speed * Math.cos(bounceAngle);
                ball.y = paddle.y - ball.radius - 1;
                playSound('paddle');
            }

            // Brick Collisions
            for (let i = 0; i < bricks.length; i++) {
                const b = bricks[i];
                if (!b.alive) continue;

                if (
                    ball.x + ball.radius > b.x &&
                    ball.x - ball.radius < b.x + b.width &&
                    ball.y + ball.radius > b.y &&
                    ball.y - ball.radius < b.y + b.height
                ) {
                    const overlapLeft = ball.x + ball.radius - b.x;
                    const overlapRight = b.x + b.width - (ball.x - ball.radius);
                    const overlapTop = ball.y + ball.radius - b.y;
                    const overlapBottom = b.y + b.height - (ball.y - ball.radius);
                    const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

                    if (minOverlap === overlapLeft || minOverlap === overlapRight) {
                        ball.vx = -ball.vx;
                    } else {
                        ball.vy = -ball.vy;
                    }

                    b.hp -= 1;
                    if (b.hp <= 0) {
                        b.alive = false;
                        score += b.theme.points;
                        spawnParticles(b.x + b.width / 2, b.y + b.height / 2, b.theme.light);
                    } else {
                        score += 20;
                    }
                    updateHUD();
                    playSound('brick');
                    break;
                }
            }

            // Check Stage Clear
            if (bricks.every(b => !b.alive)) {
                stage += 1;
                playSound('stage');
                initBricks();
                resetBallOnPaddle();
                updateHUD();
                state = 'READY';
            }

            // Missed Ball (Bottom Edge)
            if (ball.y - ball.radius > canvas.height) {
                playSound('lose');
                if (ballNumber < maxBalls) {
                    ballNumber += 1;
                    updateHUD();
                    resetBallOnPaddle();
                    state = 'READY';
                } else {
                    state = 'GAMEOVER';
                    showGameOverOverlay();
                }
            }
        }

        // Update Particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.alpha -= 0.03;
            if (p.alpha <= 0) particles.splice(i, 1);
        }
    }

    function render() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Subtle architectural grid background
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 1;
        for (let x = 0; x < canvas.width; x += 60) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }

        bricks.forEach(b => { if (b.alive) drawRealBrick(b); });
        drawPaddle();
        drawBall();

        // Draw Particles
        particles.forEach(p => {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.alpha;
            ctx.fillRect(p.x, p.y, p.size, p.size);
        });
        ctx.globalAlpha = 1;

        // Ready Prompt on Canvas
        if (state === 'READY') {
            ctx.fillStyle = 'rgba(248, 250, 252, 0.9)';
            ctx.font = 'bold 34px Segoe UI, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`READY ${MODES[currentMode].label}? Press ENTER to Launch`, canvas.width / 2, canvas.height / 2 + 80);
        }

        requestAnimationFrame(() => {
            update();
            render();
        });
    }

    // Overlay & Menu Helpers
    function showStartOverlay() {
        state = 'MENU';
        focusArea = 'OVERLAY';
        overlayTitle.textContent = 'MODERN BRICKS';
        overlaySubtitle.textContent = 'Select Challenge Mode';
        menuButtonsContainer.innerHTML = `
            <button class="menu-btn" data-mode="PLAYER">1. Player</button>
            <button class="menu-btn focused" data-mode="EXPERT">2. Expert</button>
            <button class="menu-btn" data-mode="MASTER">3. Master</button>
        `;
        overlayBtnIndex = 1;
        overlay.classList.remove('hidden');
        updateFocusVisuals();
    }

    function showPauseOverlay() {
        state = 'PAUSED';
        focusArea = 'OVERLAY';
        overlayTitle.textContent = 'GAME PAUSED';
        overlaySubtitle.textContent = `Score: ${score}  |  Stage: ${stage}`;
        menuButtonsContainer.innerHTML = `
            <button class="menu-btn focused" data-action="resume">Resume</button>
            <button class="menu-btn" data-action="restart">Restart</button>
            <button class="menu-btn" data-action="quit">Quit App</button>
        `;
        overlayBtnIndex = 0;
        overlay.classList.remove('hidden');
        updateFocusVisuals();
    }

    function showGameOverOverlay() {
        focusArea = 'OVERLAY';
        overlayTitle.textContent = 'GAME OVER';
        overlaySubtitle.textContent = `Final Score: ${score}  |  Reached Stage ${stage}`;
        menuButtonsContainer.innerHTML = `
            <button class="menu-btn focused" data-mode="${currentMode}">Play Again</button>
            <button class="menu-btn" data-action="menu">Change Mode</button>
            <button class="menu-btn" data-action="quit">Quit App</button>
        `;
        overlayBtnIndex = 0;
        overlay.classList.remove('hidden');
        updateFocusVisuals();
    }

    function hideOverlay() {
        overlay.classList.add('hidden');
        focusArea = 'GAME';
        updateFocusVisuals();
    }

    function updateFocusVisuals() {
        const overlayBtns = Array.from(menuButtonsContainer.querySelectorAll('.menu-btn'));
        overlayBtns.forEach((btn, idx) => {
            btn.classList.toggle('focused', focusArea === 'OVERLAY' && idx === overlayBtnIndex);
        });
        hudButtons.forEach((btn, idx) => {
            btn.classList.toggle('focused', focusArea === 'HUD' && idx === hudBtnIndex);
        });
    }

    function executeHudAction(action) {
        if (action === 'pause') {
            if (state === 'PLAYING' || state === 'READY') showPauseOverlay();
            else if (state === 'PAUSED') { state = 'PLAYING'; hideOverlay(); }
        } else if (action === 'stop') {
            showStartOverlay();
        } else if (action === 'sound') {
            soundEnabled = !soundEnabled;
            document.getElementById('btn-sound').textContent = `Sound: ${soundEnabled ? 'ON' : 'OFF'}`;
        } else if (action === 'quit') {
            quitApp();
        }
    }

    function quitApp() {
        if (typeof tizen !== 'undefined' && tizen.application) {
            try { tizen.application.getCurrentApplication().exit(); } catch (e) {}
        } else {
            showStartOverlay();
        }
    }

    // TV Remote & Keyboard Event Listeners
    document.addEventListener('keydown', (e) => {
        const code = e.keyCode;

        // Left Arrow (37) / Right Arrow (39)
        if (code === 37) {
            if (focusArea === 'OVERLAY') {
                const btns = menuButtonsContainer.querySelectorAll('.menu-btn');
                overlayBtnIndex = (overlayBtnIndex - 1 + btns.length) % btns.length;
                updateFocusVisuals();
            } else if (focusArea === 'HUD') {
                hudBtnIndex = (hudBtnIndex - 1 + hudButtons.length) % hudButtons.length;
                updateFocusVisuals();
            } else {
                keysPressed.left = true;
            }
        } else if (code === 39) {
            if (focusArea === 'OVERLAY') {
                const btns = menuButtonsContainer.querySelectorAll('.menu-btn');
                overlayBtnIndex = (overlayBtnIndex + 1) % btns.length;
                updateFocusVisuals();
            } else if (focusArea === 'HUD') {
                hudBtnIndex = (hudBtnIndex + 1) % hudButtons.length;
                updateFocusVisuals();
            } else {
                keysPressed.right = true;
            }
        }

        // Up Arrow (38) -> Focus Top HUD (Pause / Stop / Sound / Quit)
        if (code === 38 && overlay.classList.contains('hidden')) {
            focusArea = 'HUD';
            updateFocusVisuals();
        }

        // Down Arrow (40) -> Return focus from HUD back to Paddle
        if (code === 40 && focusArea === 'HUD') {
            focusArea = 'GAME';
            updateFocusVisuals();
        }

        // Enter / Select (13)
        if (code === 13) {
            if (focusArea === 'OVERLAY') {
                const activeBtn = menuButtonsContainer.querySelectorAll('.menu-btn')[overlayBtnIndex];
                if (!activeBtn) return;
                if (activeBtn.dataset.mode) startNewGame(activeBtn.dataset.mode);
                else if (activeBtn.dataset.action === 'resume') { state = 'PLAYING'; hideOverlay(); }
                else if (activeBtn.dataset.action === 'restart') startNewGame(currentMode);
                else if (activeBtn.dataset.action === 'menu') showStartOverlay();
                else if (activeBtn.dataset.action === 'quit') quitApp();
            } else if (focusArea === 'HUD') {
                const activeHud = hudButtons[hudBtnIndex];
                if (activeHud) executeHudAction(activeHud.dataset.action);
            } else if (state === 'READY') {
                launchBall();
            }
        }

        // Samsung TV Dedicated Media Keys
        if (code === 10252 || code === 19) { // Play/Pause
            executeHudAction('pause');
        } else if (code === 413) { // Stop
            executeHudAction('stop');
        } else if (code === 10009 || code === 27) { // Return / Esc
            if (state === 'PLAYING' || state === 'READY') showPauseOverlay();
            else quitApp();
        }
    });

    document.addEventListener('keyup', (e) => {
        if (e.keyCode === 37) keysPressed.left = false;
        if (e.keyCode === 39) keysPressed.right = false;
    });

    // Mouse / Pointer fallback for testing in VS Code / Browser
    hudButtons.forEach(btn => {
        btn.addEventListener('click', () => executeHudAction(btn.dataset.action));
    });

    menuButtonsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.menu-btn');
        if (!btn) return;
        if (btn.dataset.mode) startNewGame(btn.dataset.mode);
        else if (btn.dataset.action === 'resume') { state = 'PLAYING'; hideOverlay(); }
        else if (btn.dataset.action === 'restart') startNewGame(currentMode);
        else if (btn.dataset.action === 'menu') showStartOverlay();
        else if (btn.dataset.action === 'quit') quitApp();
    });

    // Initialize Board Behind Start Menu & Start Loop
    initBricks();
    resetBallOnPaddle();
    updateFocusVisuals();
    render();
})();
