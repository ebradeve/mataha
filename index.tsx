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
type Particle = {
    x: number; y: number;
    vx: number; vy: number;
    size: number;
    color: string;
    life: number;
};

const PLAYER_COLOR = '#007BFF';
const EXIT_COLOR = '#8B4513';
const WALL_COLOR = '#4CAF50';
const STAR_COLOR = '#FFD700';
const ANIMATION_SPEED = 0.25; 
const TOTAL_STARS = 3;

let level = 1;
let maze: MazeCell[][];
let player: Position;
let playerRenderPos: Position;
let exit: Position;
let stars: Position[] = [];
let collectedStars = 0;
let cellSize = 20;
let mazeSize = 10;
let gameState: 'start' | 'playing' | 'celebrating' = 'start';
let isAnimating = false;
let frameCount = 0;
let audioCtx: AudioContext | null = null;
let confettiParticles: Particle[] = [];
const keysDown = {
    up: false,
    down: false,
    left: false,
    right: false,
};

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
    isAnimating = false;
    collectedStars = 0;
    confettiParticles = [];
    
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

        if (current.y > 0 && !maze[current.y - 1][current.x].visited) neighbors.push({ pos: { x: current.x, y: current.y - 1 }, wall: 'top', oppositeWall: 'bottom' });
        if (current.x < mazeSize - 1 && !maze[current.y][current.x + 1].visited) neighbors.push({ pos: { x: current.x + 1, y: current.y }, wall: 'right', oppositeWall: 'left' });
        if (current.y < mazeSize - 1 && !maze[current.y + 1][current.x].visited) neighbors.push({ pos: { x: current.x, y: current.y + 1 }, wall: 'bottom', oppositeWall: 'top' });
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

function findShortestPath(startPos: Position, endPos: Position): Position[] {
    const queue: Position[] = [startPos];
    const visited = new Set<string>([`${startPos.x},${startPos.y}`]);
    const parentMap = new Map<string, Position>();

    while (queue.length > 0) {
        const current = queue.shift()!;
        if (current.x === endPos.x && current.y === endPos.y) {
            const path: Position[] = [];
            let curr: Position | undefined = endPos;
            while (curr) {
                path.unshift(curr);
                curr = parentMap.get(`${curr.x},${curr.y}`);
            }
            return path;
        }

        const { x, y } = current;
        const cell = maze[y][x];
        const neighbors: Position[] = [];
        if (!cell.top && y > 0) neighbors.push({ x, y: y - 1 });
        if (!cell.right && x < mazeSize - 1) neighbors.push({ x: x + 1, y });
        if (!cell.bottom && y < mazeSize - 1) neighbors.push({ x, y: y + 1 });
        if (!cell.left && x > 0) neighbors.push({ x: x - 1, y });

        for (const neighbor of neighbors) {
            const key = `${neighbor.x},${neighbor.y}`;
            if (!visited.has(key)) {
                visited.add(key);
                parentMap.set(key, current);
                queue.push(neighbor);
            }
        }
    }
    return [];
}

function generateStars() {
    stars = [];
    const solutionPath = findShortestPath({ x: 0, y: 0 }, exit);
    if (solutionPath.length <= 2) return;
    
    const possiblePositions = solutionPath.slice(1, -1);
    
    for (let i = possiblePositions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [possiblePositions[i], possiblePositions[j]] = [possiblePositions[j], possiblePositions[i]];
    }

    stars = possiblePositions.slice(0, TOTAL_STARS);
}

function createConfetti() {
    confettiParticles = [];
    const particleCount = 100;
    const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722'];
    for (let i = 0; i < particleCount; i++) {
        confettiParticles.push({
            x: playerRenderPos.x * cellSize + cellSize / 2,
            y: playerRenderPos.y * cellSize + cellSize / 2,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 8 - 5,
            size: Math.random() * 5 + 2,
            color: colors[Math.floor(Math.random() * colors.length)],
            life: 120,
        });
    }
}

function updateConfetti() {
    for (let i = confettiParticles.length - 1; i >= 0; i--) {
        const p = confettiParticles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1; // Gravity
        p.life--;
        if (p.life <= 0) {
            confettiParticles.splice(i, 1);
        }
    }
}

function drawConfetti() {
    if (!ctx) return;
    for (const p of confettiParticles) {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
    }
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

    ctx.fillStyle = EXIT_COLOR;
    const pulse = Math.sin(frameCount * 0.05) * (cellSize * 0.05);
    const exitSize = cellSize * 0.8 + pulse;
    const exitOffset = (cellSize - exitSize) / 2;
    ctx.fillRect(exit.x * cellSize + exitOffset, exit.y * cellSize + exitOffset, exitSize, exitSize);
    
    ctx.fillStyle = PLAYER_COLOR;
    let breath = 0;
    const isMoving = keysDown.up || keysDown.down || keysDown.left || keysDown.right;
    if (!isMoving && !isAnimating) {
        breath = Math.sin(frameCount * 0.1) * (cellSize * 0.04);
    }
    const playerRadius = cellSize / 3 + breath;
    ctx.beginPath();
    ctx.arc(playerRenderPos.x * cellSize + cellSize / 2, playerRenderPos.y * cellSize + cellSize / 2, playerRadius, 0, 2 * Math.PI);
    ctx.fill();

    if (gameState === 'celebrating') {
        drawConfetti();
    }
}

function canMove(pos: Position, dir: { dx: number, dy: number }): boolean {
    const { x, y } = pos;
    const cell = maze[y]?.[x];
    if (!cell) return false;

    if (dir.dx === 1 && !cell.right) return true;
    if (dir.dx === -1 && !cell.left) return true;
    if (dir.dy === 1 && !cell.bottom) return true;
    if (dir.dy === -1 && !cell.top) return true;
    return false;
}

function checkGameStatus() {
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

    if (gameState === 'playing' && player.x === exit.x && player.y === exit.y) {
        gameState = 'celebrating';
        messageDisplay.textContent = 'لقد فزت! 🎉';
        playWinSound();
        createConfetti();
        setTimeout(() => {
            if (gameState === 'celebrating') {
               setupLevel(level + 1);
            }
        }, 2000);
    }
}

function update() {
    frameCount++;

    if (gameState === 'celebrating') {
        updateConfetti();
        return;
    }
    if (gameState !== 'playing') return;

    if (isAnimating) {
        const rdx = player.x - playerRenderPos.x;
        const rdy = player.y - playerRenderPos.y;
        const dist = Math.sqrt(rdx * rdx + rdy * rdy);

        if (dist < 0.01) {
            playerRenderPos.x = player.x;
            playerRenderPos.y = player.y;
            isAnimating = false;
            checkGameStatus();
        } else {
            playerRenderPos.x += rdx * ANIMATION_SPEED;
            playerRenderPos.y += rdy * ANIMATION_SPEED;
        }
        return;
    }
    
    const moveDir = { dx: 0, dy: 0 };
    if (keysDown.up) moveDir.dy = -1;
    else if (keysDown.down) moveDir.dy = 1;
    else if (keysDown.left) moveDir.dx = -1;
    else if (keysDown.right) moveDir.dx = 1;

    if ((moveDir.dx !== 0 || moveDir.dy !== 0) && canMove(player, moveDir)) {
        player.x += moveDir.dx;
        player.y += moveDir.dy;
        isAnimating = true;
        playMoveSound();
        checkGameStatus();
    }
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

function handleKeyDown(key: string) {
    switch (key) {
        case 'ArrowUp': case 'w': keysDown.up = true; break;
        case 'ArrowDown': case 's': keysDown.down = true; break;
        case 'ArrowLeft': case 'a': keysDown.left = true; break;
        case 'ArrowRight': case 'd': keysDown.right = true; break;
    }
}

function handleKeyUp(key: string) {
    switch (key) {
        case 'ArrowUp': case 'w': keysDown.up = false; break;
        case 'ArrowDown': case 's': keysDown.down = false; break;
        case 'ArrowLeft': case 'a': keysDown.left = false; break;
        case 'ArrowRight': case 'd': keysDown.right = false; break;
    }
}

window.addEventListener('keydown', (e) => {
    if (gameState === 'playing') {
        e.preventDefault();
        initAudio();
        handleKeyDown(e.key);
    }
});
window.addEventListener('keyup', (e) => {
    if (gameState === 'playing') {
        e.preventDefault();
        handleKeyUp(e.key);
    }
});

function setupButtonEvents(button: HTMLElement | null, direction: 'up' | 'down' | 'left' | 'right') {
    if (!button) return;
    button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        initAudio();
        keysDown[direction] = true;
    });
    button.addEventListener('pointerup', () => keysDown[direction] = false);
    button.addEventListener('pointerleave', () => keysDown[direction] = false);
}

setupButtonEvents(upButton, 'up');
setupButtonEvents(downButton, 'down');
setupButtonEvents(leftButton, 'left');
setupButtonEvents(rightButton, 'right');

window.addEventListener('resize', () => {
    if (gameState === 'playing' || gameState === 'start') {
        setupLevel(level);
    }
});

setupLevel(1);
gameLoop();
