/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

const canvas = document.getElementById('maze-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
const levelDisplay = document.getElementById('level-display');
const messageDisplay = document.getElementById('message-display');
const starDisplay = document.getElementById('star-display');
const upButton = document.getElementById('up-btn');
const downButton = document.getElementById('down-btn');
const leftButton = document.getElementById('left-btn');
const rightButton = document.getElementById('right-btn');

type Position = { x: number; y: number };
type MazeCell = {
    top: boolean; right: boolean; bottom: boolean; left: boolean;
    visited: boolean;
};

const PLAYER_COLOR = '#007BFF';
const EXIT_COLOR = '#8B4513';
const WALL_COLOR = '#4CAF50';
const STAR_COLOR = '#FFD700';
const ANIMATION_SPEED = 0.15;
const TOTAL_STARS = 3;

let level = 1;
let maze: MazeCell[][];
let player: Position; // Logical grid position
let playerRenderPos: Position; // Rendered position (can be float for animation)
let exit: Position;
let stars: Position[] = [];
let collectedStars = 0;
let cellSize = 20;
let mazeSize = 10;
let gameState: 'start' | 'playing' | 'won' = 'start';
let isMoving = false;
let frameCount = 0;
let audioCtx: AudioContext | null = null;


function initAudio() {
    if (audioCtx) return;
    try {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
        console.error("Web Audio API is not supported in this browser");
    }
}

function playMoveSound() {
    if (!audioCtx) return;
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(500, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.1);

    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.1);
}

function playWinSound() {
    if (!audioCtx) return;
    const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
    const noteDuration = 0.12;

    notes.forEach((note, index) => {
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(note, audioCtx.currentTime + index * noteDuration);
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime + index * noteDuration);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + (index + 0.9) * noteDuration);

        oscillator.start(audioCtx.currentTime + index * noteDuration);
        oscillator.stop(audioCtx.currentTime + (index + 1) * noteDuration);
    });
}

function playStarSound() {
    if (!audioCtx) return;
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(783.99, audioCtx.currentTime); // G5
    gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.3);

    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.3);
}

function updateStarDisplay() {
    if (starDisplay) {
        starDisplay.textContent = `⭐ ${collectedStars}/${TOTAL_STARS}`;
    }
}

function setupLevel(newLevel: number) {
    level = newLevel;
    gameState = 'playing';
    isMoving = false;
    collectedStars = 0;
    
    if (level <= 2) mazeSize = 10;
    else if (level <= 5) mazeSize = 15;
    else if (level <= 8) mazeSize = 20;
    else mazeSize = 25;

    const canvasContainer = document.getElementById('canvas-wrapper')!;
    const canvasSize = Math.min(window.innerWidth * 0.95, window.innerHeight * 0.70);
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    cellSize = canvas.width / mazeSize;

    player = { x: 0, y: 0 };
    playerRenderPos = { x: 0, y: 0 };
    exit = { x: mazeSize - 1, y: Math.floor(Math.random() * mazeSize) };
    
    levelDisplay.textContent = `المستوى: ${level}`;
    messageDisplay.textContent = 'اعثر على المخرج!';
    
    generateMaze();
    generateStars();
    updateStarDisplay();
}

function generateMaze() {
    maze = Array.from({ length: mazeSize }, () =>
        Array.from({ length: mazeSize }, () => ({
            top: true, right: true, bottom: true, left: true, visited: false,
        }))
    );

    const stack: Position[] = [];
    const start = { x: 0, y: 0 };
    maze[start.y][start.x].visited = true;
    stack.push(start);

    while (stack.length > 0) {
        const current = stack[stack.length - 1];
        const neighbors: { pos: Position; wall: 'top' | 'right' | 'bottom' | 'left'; oppositeWall: 'bottom' | 'left' | 'top' | 'right' }[] = [];

        // Top
        if (current.y > 0 && !maze[current.y - 1][current.x].visited) neighbors.push({ pos: { x: current.x, y: current.y - 1 }, wall: 'top', oppositeWall: 'bottom' });
        // Right
        if (current.x < mazeSize - 1 && !maze[current.y][current.x + 1].visited) neighbors.push({ pos: { x: current.x + 1, y: current.y }, wall: 'right', oppositeWall: 'left' });
        // Bottom
        if (current.y < mazeSize - 1 && !maze[current.y + 1][current.x].visited) neighbors.push({ pos: { x: current.x, y: current.y + 1 }, wall: 'bottom', oppositeWall: 'top' });
        // Left
        if (current.x > 0 && !maze[current.y][current.x - 1].visited) neighbors.push({ pos: { x: current.x - 1, y: current.y }, wall: 'left', oppositeWall: 'right' });

        if (neighbors.length > 0) {
            const { pos: next, wall, oppositeWall } = neighbors[Math.floor(Math.random() * neighbors.length)];
            maze[current.y][current.x][wall] = false;
            maze[next.y][next.x][oppositeWall] = false;
            maze[next.y][next.x].visited = true;
            stack.push(next);
        } else {
            stack.pop();
        }
    }
}

function generateStars() {
    stars = [];
    const possiblePositions: Position[] = [];
    for (let y = 0; y < mazeSize; y++) {
        for (let x = 0; x < mazeSize; x++) {
            if ((x === player.x && y === player.y) || (x === exit.x && y === exit.y)) {
                continue;
            }
            possiblePositions.push({ x, y });
        }
    }

    for (let i = possiblePositions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [possiblePositions[i], possiblePositions[j]] = [possiblePositions[j], possiblePositions[i]];
    }

    stars = possiblePositions.slice(0, TOTAL_STARS);
}

function drawStar(cx: number, cy: number, spikes: number, outerRadius: number, innerRadius: number) {
    if (!ctx) return;
    let rot = Math.PI / 2 * 3;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
        x = cx + Math.cos(rot) * outerRadius;
        y = cy + Math.sin(rot) * outerRadius;
        ctx.lineTo(x, y);
        rot += step;

        x = cx + Math.cos(rot) * innerRadius;
        y = cy + Math.sin(rot) * innerRadius;
        ctx.lineTo(x, y);
        rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
    ctx.fill();
}

function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw maze
    ctx.strokeStyle = WALL_COLOR;
    ctx.lineWidth = 4;
    for (let y = 0; y < mazeSize; y++) {
        for (let x = 0; x < mazeSize; x++) {
            const cell = maze[y][x];
            if (cell.top) ctx.strokeRect(x * cellSize, y * cellSize, cellSize, 0);
            if (cell.right) ctx.strokeRect((x + 1) * cellSize, y * cellSize, 0, cellSize);
            if (cell.bottom) ctx.strokeRect(x * cellSize, (y + 1) * cellSize, cellSize, 0);
            if (cell.left) ctx.strokeRect(x * cellSize, y * cellSize, 0, cellSize);
        }
    }
    
    // Draw Stars (with twinkling animation)
    ctx.fillStyle = STAR_COLOR;
    const twinkle = Math.sin(frameCount * 0.08) * (cellSize * 0.03);
    const starOuterRadius = (cellSize / 4) + twinkle;
    const starInnerRadius = starOuterRadius / 2;

    stars.forEach(star => {
        drawStar(
            star.x * cellSize + cellSize / 2,
            star.y * cellSize + cellSize / 2,
            5,
            starOuterRadius,
            starInnerRadius
        );
    });

    // Draw exit (with pulsing animation)
    ctx.fillStyle = EXIT_COLOR;
    const pulse = Math.sin(frameCount * 0.05) * (cellSize * 0.05);
    const exitSize = cellSize * 0.8 + pulse;
    const exitOffset = (cellSize - exitSize) / 2;
    ctx.fillRect(exit.x * cellSize + exitOffset, exit.y * cellSize + exitOffset, exitSize, exitSize);
    
    // Draw player (with breathing animation)
    ctx.fillStyle = PLAYER_COLOR;
    let breath = 0;
    if (!isMoving) {
        breath = Math.sin(frameCount * 0.1) * (cellSize * 0.04);
    }
    const playerRadius = cellSize / 3 + breath;
    ctx.beginPath();
    ctx.arc(playerRenderPos.x * cellSize + cellSize / 2, playerRenderPos.y * cellSize + cellSize / 2, playerRadius, 0, 2 * Math.PI);
    ctx.fill();
}

function movePlayer(dx: number, dy: number) {
    initAudio();
    if (gameState !== 'playing' || isMoving) return;
    
    const { x, y } = player;
    let canMove = false;
    if (dx === 1 && !maze[y][x].right) canMove = true;
    if (dx === -1 && !maze[y][x].left) canMove = true;
    if (dy === 1 && !maze[y][x].bottom) canMove = true;
    if (dy === -1 && !maze[y][x].top) canMove = true;

    if (canMove) {
        player.x += dx;
        player.y += dy;
        isMoving = true;
        playMoveSound();
    }
}

function checkGameStatus() {
    // Star collection
    const starIndex = stars.findIndex(star => star.x === player.x && star.y === player.y);
    if (starIndex > -1) {
        stars.splice(starIndex, 1);
        collectedStars++;
        updateStarDisplay();
        playStarSound();
        if (collectedStars === TOTAL_STARS) {
            messageDisplay.textContent = 'أحسنت!';
        }
    }

    // Win condition
    if (player.x === exit.x && player.y === exit.y) {
        gameState = 'won';
        messageDisplay.textContent = 'لقد فزت! 🎉';
        playWinSound();
        setTimeout(() => setupLevel(level + 1), 1500);
    }
}

function update() {
    if (!isMoving) return;

    const dx = player.x - playerRenderPos.x;
    const dy = player.y - playerRenderPos.y;

    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
        playerRenderPos.x = player.x;
        playerRenderPos.y = player.y;
        isMoving = false;
        checkGameStatus();
    } else {
        playerRenderPos.x += dx * ANIMATION_SPEED;
        playerRenderPos.y += dy * ANIMATION_SPEED;
    }
}

function gameLoop() {
    frameCount++;
    update();
    draw();
    requestAnimationFrame(gameLoop);
}


window.addEventListener('keydown', (e) => {
    if (gameState === 'playing') {
        e.preventDefault();
        switch (e.key) {
            case 'ArrowUp':
            case 'w':
                movePlayer(0, -1);
                break;
            case 'ArrowDown':
            case 's':
                movePlayer(0, 1);
                break;
            case 'ArrowLeft':
            case 'a':
                movePlayer(-1, 0);
                break;
            case 'ArrowRight':
            case 'd':
                movePlayer(1, 0);
                break;
        }
    }
});

upButton?.addEventListener('click', () => movePlayer(0, -1));
downButton?.addEventListener('click', () => movePlayer(0, 1));
leftButton?.addEventListener('click', () => movePlayer(-1, 0));
rightButton?.addEventListener('click', () => movePlayer(1, 0));


window.addEventListener('resize', () => {
    if (gameState === 'playing' || gameState === 'start') {
        setupLevel(level);
    }
});

// Initial setup
setupLevel(1);
gameLoop(); // Start the main game loop