const gameConfig = {
    defaultRows: 6,
    defaultCols: 12,
    defaultTurnTime: 15,
    defaultTotalTime: 300,
    maxPlayers: 4,
    playerColors: ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71']
};
const dom = {
    boardGrid: document.getElementById('board-grid'),
    playerTurn: document.getElementById('playerTurn'),
    playerTimer: document.getElementById('playerTimer'),
    gameTimer: document.getElementById('gameTimer'),
    scoreboard: document.getElementById('scoreboard'),
    player1Score: document.getElementById('player1Score'),
    player2Score: document.getElementById('player2Score'),
    moveHistory: document.getElementById('moveHistory'),
    startButton: document.getElementById('startButton'),
    pauseButton: document.getElementById('pauseButton'),
    resetButton: document.getElementById('resetButton'),
    bombButton: document.getElementById('bombButton'),
    timeBoostButton: document.getElementById('timeBoostButton'),
    bombCount: document.getElementById('bombCount'),
    timeBoostCount: document.getElementById('timeBoostCount'),
    boardRows: document.getElementById('boardRows'),
    boardCols: document.getElementById('boardCols'),
    playerCount: document.getElementById('playerCount'),
    botMode: document.getElementById('botMode'),
    replayStart: document.getElementById('replayStart'),
    replayPrev: document.getElementById('replayPrev'),
    replayPause: document.getElementById('replayPause'),
    replayNext: document.getElementById('replayNext'),
    overlay: document.getElementById('overlay'),
    overlayText: document.getElementById('overlayText')
};
const state = {
    rows: gameConfig.defaultRows,
    cols: gameConfig.defaultCols,
    board: [],
    players: [],
    currentPlayer: 0,
    totalSeconds: gameConfig.defaultTotalTime,
    turnSeconds: gameConfig.defaultTurnTime,
    timerInterval: null,
    replayInterval: null,
    running: false,
    paused: false,
    moveCount: 0,
    history: [],
    historyIndex: -1,
    replayMode: false,
    awaitingBombTarget: false,
    savedState: null
};
const overlay = document.getElementById("overlay");
const overlayCard = overlay.querySelector(".overlay-card");
overlay.addEventListener("click", (e) => {
    if (!overlayCard.contains(e.target)) {
        overlay.classList.add("hidden");
    }
});
function createPlayer(index, isBot = false) {
    return {
        id: index + 1,
        name: `Player ${index + 1}`,
        score: 0,
        bombs: 1,
        boosts: 1,
        isBot,
        eliminated: false
    };
}
function createCell(r, c) {
    return {
        r,
        c,
        count: 0,
        owner: null,
        capacity: calculateCapacity(r, c),
        portal: null
    };
}
const audioContext = window.AudioContext
    ? new window.AudioContext()
    : null;

function playSound(type) {
    if (!audioContext) return;
    const duration = 0.08;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    switch (type) {
        case 'place':
            oscillator.frequency.value = 440;
            gain.gain.value = 0.15;
            break;
        case 'explode':
            oscillator.frequency.value = 220;
            gain.gain.value = 0.2;
            break;
        case 'power':
            oscillator.frequency.value = 560;
            gain.gain.value = 0.18;
            break;
        case 'win':
            oscillator.frequency.value = 720;
            gain.gain.value = 0.22;
            break;
        default:
            oscillator.frequency.value = 330;
            gain.gain.value = 0.12;
    }
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
}
function calculateCapacity(r, c) {
    return [[-1, 0], [1, 0], [0, -1], [0, 1]].reduce((count, [dr, dc]) => {
        const rr = r + dr;
        const cc = c + dc;
        return count + (rr >= 0 && rr < state.rows && cc >= 0 && cc < state.cols ? 1 : 0);
    }, 0);
}
function buildBoard() {
    state.board = Array.from({ length: state.rows }, (_, r) =>
        Array.from({ length: state.cols }, (_, c) => createCell(r, c))
    );
    attachPortals();
}
function attachPortals() {
    const pairs = [];
    if (state.rows >= 6 && state.cols >= 10) {
        pairs.push([
            { r: 0, c: 1 },
            { r: state.rows - 1, c: state.cols - 2 }
        ]);
        pairs.push([
            { r: 1, c: state.cols - 1 },
            { r: state.rows - 2, c: 0 }
        ]);
    }
    pairs.forEach((pair, index) => {
        const [source, target] = pair;
        if (state.board[source.r] && state.board[source.r][source.c]) {
            state.board[source.r][source.c].portal = { r: target.r, c: target.c, label: `P${index + 1}` };
        }
        if (state.board[target.r] && state.board[target.r][target.c]) {
            state.board[target.r][target.c].portal = { r: source.r, c: source.c, label: `P${index + 1}` };
        }
    });
}
function buildPlayers() {
    const count = Math.min(gameConfig.maxPlayers, Math.max(2, Number(dom.playerCount.value)));
    const botEnabled = dom.botMode.checked;
    state.players = Array.from({ length: count }, (_, index) => createPlayer(index, botEnabled && index === 1));
}
function renderBoard() {
    dom.boardGrid.style.setProperty('--cols', state.cols);
    dom.boardGrid.innerHTML = '';
    state.board.forEach(row => {
        row.forEach(cell => {
            const tile = document.createElement('button');
            tile.type = 'button';
            tile.className = 'cell';
            tile.id = `cell-${cell.r}-${cell.c}`;
            if (cell.owner !== null) {
                tile.classList.add(
                    `owner-${cell.owner}`
                );
            }
            if (cell.portal) {
                tile.classList.add('portal');
            }
            let orbHTML = '';
            const visibleCount = Math.min(cell.count, 4);
            for (let i = 0; i < visibleCount; i++) {
                orbHTML += `
                    <div class="orb orb-${i}"></div>
                `;
            }
            tile.innerHTML = `
                <div class="orb-container">
                    ${orbHTML}
                </div>
                ${
                    cell.count > 4
                    ? `<span class="count-number">${cell.count}</span>`
                    : ''
                }
                ${
                    cell.portal
                    ? `
                    <span class="portal-label">
                        ${cell.portal.label}
                    </span>
                    `
                    : ''
                }
            `;
            tile.addEventListener(
                'click',
                () => handleCellClick(cell.r, cell.c)
            );
            dom.boardGrid.appendChild(tile);
        });
    });
}
async function handleCellClick(r, c) {
    if (!state.running || state.paused) return;
    if (state.replayMode) return;
    if (state.awaitingBombTarget) {
        activateBomb(r, c);
        return;
    }
    const cell = state.board[r][c];
    if (!isValidMove(cell)) {
        flashInvalid(cell);
        return;
    }
    await makeMove(r, c);
}
function isValidMove(cell) {
    return (
        cell.owner === null ||
        cell.owner === getCurrentPlayer().id
    );
}
function flashInvalid(cell) {
    const el = document.getElementById(`cell-${cell.r}-${cell.c}`);
    if (!el) return;
    el.classList.add('selected');
    setTimeout(() => el.classList.remove('selected'), 240);
}
function getCurrentPlayer() {
    return state.players[state.currentPlayer];
}
async function makeMove(r, c) {
    const player = getCurrentPlayer();
    const cell = state.board[r][c];
    cell.count += 1;
    cell.owner = player.id;
    playSound('place');
    renderBoard();
    await resolveExplosions([{ r, c }]);
    pushHistory(
        `${player.name} placed on (${r + 1},${c + 1})`
    );
    state.moveCount += 1;
    renderBoard();
    updateHUD();
    if (!checkGameEnd()) {

        nextTurn();
    }
}
async function resolveExplosions(queue) {
    const player = getCurrentPlayer();
    const processing = new Set();
    while (queue.length) {
        const { r, c } = queue.shift();
        const key = `${r}-${c}`;
        if (processing.has(key)) continue;
        const cell = state.board[r][c];
        if (cell.count < cell.capacity) continue;
        processing.add(key);
        animateExplosion(r, c);
        playSound('explode');
        renderBoard();
        await new Promise(resolve =>
            setTimeout(resolve, 120)
        );
        cell.count -= cell.capacity;
        if (cell.count <= 0) {
            cell.count = 0;
            cell.owner = null;
        }
        let targets = [];
        if (cell.portal) {
            const portalTarget =
                state.board[cell.portal.r][cell.portal.c];
            targets.push(portalTarget);
        } else {
            targets = getNeighbors(r, c);
        }
        for (const target of targets) {
            target.count += 1;
            target.owner = player.id;
            renderBoard();
            await new Promise(resolve =>
                setTimeout(resolve, 40)
            );
            if (target.count >= target.capacity) {
                queue.push({
                    r: target.r,
                    c: target.c
                });
            }
        }
        processing.delete(key);
        await new Promise(resolve =>
            setTimeout(resolve, 80)
        );
    }
}
function animateExplosion(r, c) {
    const element = document.getElementById(`cell-${r}-${c}`);
    if (!element) return;
    element.classList.add('explode');
    setTimeout(() => element.classList.remove('explode'), 400);
}
function getNeighbors(r, c) {
    return [[-1, 0], [1, 0], [0, -1], [0, 1]].reduce((cells, [dr, dc]) => {
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && rr < state.rows && cc >= 0 && cc < state.cols) {
            cells.push(state.board[rr][cc]);
        }
        return cells;
    }, []);
}
function pushHistory(description, reaction = {}) {
    if (state.replayMode) return;
    const snapshot = {
        board: state.board.map(row => row.map(cell => ({ ...cell }))),
        players: state.players.map(player => ({ ...player })),
        currentPlayer: state.currentPlayer,
        totalSeconds: state.totalSeconds,
        turnSeconds: state.turnSeconds,
        moveCount: state.moveCount,
        description,
        reaction
    };
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push(snapshot);
    state.historyIndex = state.history.length - 1;
    renderHistory();
    updateReplayButtons();
}
function renderHistory() {
    dom.moveHistory.innerHTML = state.history.map((item, index) => {
        const activeClass = index === state.historyIndex ? 'active' : '';
        const reactionText = item.reaction.chainExplosions ? ` � ${item.reaction.chainExplosions} explosion(s)` : '';
        const captureText = item.reaction.capturedPieces ? ` � ${item.reaction.capturedPieces} captured` : '';
        return `<div class="history-item ${activeClass}"><strong>${item.description}</strong><br>${reactionText}${captureText}</div>`;
    }).join('');
}
function nextTurn() {
    if (!state.running) return;
    let candidate = state.currentPlayer;
    for (let attempt = 0; attempt < state.players.length; attempt += 1) {
        candidate = (candidate + 1) % state.players.length;
        if (!state.players[candidate].eliminated) {
            state.currentPlayer = candidate;
            break;
        }
    }
    state.turnSeconds = gameConfig.defaultTurnTime;
    updateHUD();
    if (!checkGameEnd() && getCurrentPlayer().isBot) {
        window.setTimeout(executeBotMove, 650);
    }
}
function executeBotMove() {
    if (!state.running || state.paused || state.replayMode) return;
    const bot = getCurrentPlayer();
    const options = [];
    state.board.forEach(row => row.forEach(cell => {
        if (
            cell.owner === null ||
            cell.owner === bot.id
        ) {
            options.push(cell);
        }
    }));
    if (!options.length) {
        nextTurn();
        return;
    }
    options.sort(
        (a, b) =>
            (b.count - a.count) ||
            (b.capacity - a.capacity)
    );
    makeMove(options[0].r, options[0].c);
}
function checkGameEnd() {
    if (state.moveCount < state.players.length) {
        return false;
    }
    const alivePlayers = new Set();
    state.board.flat().forEach(cell => {
        if (
            cell.owner !== null &&
            cell.count > 0
        ) {
            alivePlayers.add(cell.owner);
        }
    });
    state.players.forEach(player => {
        if (!alivePlayers.has(player.id)) {
            player.eliminated = true;
        } else {
            player.eliminated = false;
        }
    });
    if (alivePlayers.size === 1) {
        const winnerId = [...alivePlayers][0];
        finishGame(
            `Player ${winnerId} wins!`
        );
        return true;
    }
    return false;
}
function finishGame(message) {
    stopTimer();
    state.running = false;
    state.paused = true;
    dom.overlayText.textContent = message;
    dom.overlay.classList.remove('hidden');
    dom.pauseButton.disabled = true;
    dom.startButton.disabled = false;
    dom.bombButton.disabled = true;
    dom.timeBoostButton.disabled = true;
    playSound('win');
}
function startTimer() {
    stopTimer();
    state.timerInterval = window.setInterval(() => {
        if (state.paused || state.replayMode || !state.running) return;
        state.turnSeconds -= 1;
        state.totalSeconds -= 1;
        if (state.turnSeconds <= 0) {
            nextTurn();
        }
        if (state.totalSeconds <= 0) {
            finishGame('Time up!');
        }
        updateHUD();
    }, 1000);
}
function stopTimer() {
    if (state.timerInterval) {
        window.clearInterval(state.timerInterval);
        state.timerInterval = null;
    }
}
function togglePause() {
    if (!state.running) return;
    state.paused = !state.paused;
    if (state.paused) {
        dom.overlayText.textContent = 'Paused';
        dom.overlay.classList.remove('hidden');
        stopTimer();
    } else {
        dom.overlay.classList.add('hidden');
        startTimer();
    }
    updateHUD();
}
function resetGame() {
    stopTimer();
    if (state.replayInterval) {
        window.clearInterval(state.replayInterval);
        state.replayInterval = null;
    }
    state.running = false;
    state.paused = false;
    state.replayMode = false;
    state.awaitingBombTarget = false;
    state.savedState = null;
    state.rows = Math.max(4, Math.min(10, Number(dom.boardRows.value)));
    state.cols = Math.max(8, Math.min(14, Number(dom.boardCols.value)));
    buildPlayers();
    buildBoard();
    renderBoard();
    state.totalSeconds = gameConfig.defaultTotalTime;
    state.turnSeconds = gameConfig.defaultTurnTime;
    state.currentPlayer = 0;
    state.moveCount = 0;
    state.history = [];
    state.historyIndex = -1;
    dom.overlay.classList.add('hidden');
    updateHUD();
    renderHistory();
    updateReplayButtons();
}
function startGame() {
    resetGame();
    state.running = true;
    state.paused = false;
    dom.overlay.classList.add('hidden');
    dom.startButton.disabled = true;
    dom.pauseButton.disabled = false;
    startTimer();
    updateHUD();
}
function renderScoreboard() {
    dom.scoreboard.innerHTML = state.players.map(player => {
        return `<p>${player.name}: <strong>${player.score}</strong>${player.isBot ? ' (Bot)' : ''}</p>`;
    }).join('');
}
function updateHUD() {
    const player = getCurrentPlayer();
    dom.playerTurn.textContent = player.name;
    dom.playerTimer.textContent = Math.max(state.turnSeconds, 0);
    dom.gameTimer.textContent = formatTime(state.totalSeconds);
    dom.player1Score.textContent = state.players[0] ? state.players[0].score : '0';
    dom.player2Score.textContent = state.players[1] ? state.players[1].score : '0';
    dom.bombCount.textContent = player.bombs;
    dom.timeBoostCount.textContent = player.boosts;
    dom.bombButton.disabled = !state.running || state.paused || player.bombs <= 0 || state.replayMode;
    dom.timeBoostButton.disabled = !state.running || state.paused || player.boosts <= 0 || state.replayMode;
    dom.pauseButton.textContent = state.paused ? 'Resume' : 'Pause';
    renderScoreboard();
}
function formatTime(seconds) {
    const mins = Math.floor(Math.max(seconds, 0) / 60).toString().padStart(2, '0');
    const secs = Math.floor(Math.max(seconds, 0) % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
}
async function activateBomb(r, c) {
    const player = getCurrentPlayer();
    const targets = getAreaCells(r, c, 1);
    let cleared = 0;
    playSound('power');
    state.awaitingBombTarget = false;
    dom.overlay.classList.add('hidden');
    for (const target of targets) {
        const el = document.getElementById(
            `cell-${target.r}-${target.c}`
        );
        if (el) {
            el.classList.add('explode');
        }
        if (target.count > 0) {
            cleared += target.count;
        }
        target.count = 0;
        target.owner = null;
        renderBoard();
        await new Promise(resolve =>
            setTimeout(resolve, 60)
        );
    }
    player.bombs -= 1;
    player.score += cleared;
    pushHistory(
        `${player.name} used Bomb at (${r + 1},${c + 1})`,
        {
            chainExplosions: 0,
            capturedPieces: cleared
        }
    );
    renderBoard();
    updateHUD();
    nextTurn();
}
function getAreaCells(r, c, radius) {
    const cells = [];
    for (let dr = -radius; dr <= radius; dr += 1) {
        for (let dc = -radius; dc <= radius; dc += 1) {
            const rr = r + dr;
            const cc = c + dc;
            if (rr >= 0 && rr < state.rows && cc >= 0 && cc < state.cols) {
                cells.push(state.board[rr][cc]);
            }
        }
    }
    return cells;
}
function requestBomb() {
    if (
        !state.running ||
        state.paused ||
        state.replayMode
    ) return;
    const player = getCurrentPlayer();
    if (player.bombs <= 0) return;
    state.awaitingBombTarget = true;
    dom.overlay.classList.remove('hidden');
    dom.overlayText.textContent =
        'Select ANY cell to bomb';
}
function requestTimeBoost() {
    if (!state.running || state.paused || state.replayMode) return;
    const player = getCurrentPlayer();
    if (player.boosts <= 0) return;
    player.boosts -= 1;
    state.turnSeconds += 8;
    state.totalSeconds += 10;
    playSound('power');
    pushHistory(`${player.name} used Time Boost`, { chainExplosions: 0, capturedPieces: 0 });
    updateHUD();
}
function startReplay() {
    if (!state.history.length) return;
    if (state.replayMode) return;
    state.savedState = {
        board: state.board.map(row => row.map(cell => ({ ...cell }))),
        players: state.players.map(player => ({ ...player })),
        currentPlayer: state.currentPlayer,
        totalSeconds: state.totalSeconds,
        turnSeconds: state.turnSeconds,
        moveCount: state.moveCount
    };
    state.replayMode = true;
    state.paused = true;
    stopTimer();
    state.historyIndex = 0;
    loadSnapshot(state.history[0]);
    dom.replayPrev.disabled = false;
    dom.replayNext.disabled = false;
    dom.replayPause.disabled = false;
    dom.replayStart.disabled = true;
    dom.overlay.classList.remove('hidden');
    dom.overlayText.textContent = 'Replay mode';
}
function pauseReplay() {
    if (!state.replayMode) return;
    if (state.replayInterval) {
        window.clearInterval(state.replayInterval);
        state.replayInterval = null;
        dom.replayPause.textContent = 'Resume';
        return;
    }
    state.replayInterval = window.setInterval(stepReplayForward, 1200);
    dom.replayPause.textContent = 'Pause';
}
function stepReplayForward() {
    if (state.historyIndex >= state.history.length - 1) return;
    state.historyIndex += 1;
    loadSnapshot(state.history[state.historyIndex]);
}
function stepReplayBackward() {
    if (state.historyIndex <= 0) return;
    state.historyIndex -= 1;
    loadSnapshot(state.history[state.historyIndex]);
}
function loadSnapshot(snapshot) {
    state.board = snapshot.board.map(row => row.map(cell => ({ ...cell })));
    state.players = snapshot.players.map(player => ({ ...player }));
    state.currentPlayer = snapshot.currentPlayer;
    state.totalSeconds = snapshot.totalSeconds;
    state.turnSeconds = snapshot.turnSeconds;
    state.moveCount = snapshot.moveCount;
    renderBoard();
    updateHUD();
    renderHistory();
}
function stopReplay() {
    if (!state.replayMode) return;
    state.replayMode = false;
    if (state.replayInterval) {
        window.clearInterval(state.replayInterval);
        state.replayInterval = null;
    }
    if (state.savedState) {
        state.board = state.savedState.board.map(row => row.map(cell => ({ ...cell })));
        state.players = state.savedState.players.map(player => ({ ...player }));
        state.currentPlayer = state.savedState.currentPlayer;
        state.totalSeconds = state.savedState.totalSeconds;
        state.turnSeconds = state.savedState.turnSeconds;
        state.moveCount = state.savedState.moveCount;
        state.savedState = null;
    }
    dom.replayStart.disabled = false;
    dom.replayPrev.disabled = true;
    dom.replayPause.disabled = true;
    dom.replayNext.disabled = true;
    dom.replayPause.textContent = 'Pause';
    dom.overlay.classList.add('hidden');
    renderBoard();
    updateHUD();
}
function updateReplayButtons() {
    dom.replayStart.disabled = state.history.length === 0;
    dom.replayPrev.disabled = true;
    dom.replayNext.disabled = true;
    dom.replayPause.disabled = true;
}
function setupEvents() {
    dom.startButton.addEventListener('click', startGame);
    dom.pauseButton.addEventListener('click', togglePause);
    dom.resetButton.addEventListener('click', resetGame);
    dom.bombButton.addEventListener('click', requestBomb);
    dom.timeBoostButton.addEventListener('click', requestTimeBoost);
    dom.replayStart.addEventListener('click', startReplay);
    dom.replayPause.addEventListener('click', pauseReplay);
    dom.replayPrev.addEventListener('click', stepReplayBackward);
    dom.replayNext.addEventListener('click', stepReplayForward);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && state.awaitingBombTarget) {
            state.awaitingBombTarget = false;
            dom.overlay.classList.add('hidden');
        }
    });
}
function initGame() {
    setupEvents();
    resetGame();
    updateReplayButtons();
}

initGame();
