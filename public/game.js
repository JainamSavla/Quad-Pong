const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const W = canvas.width;
const H = canvas.height;

const PADDLE_THICK = 15;
const PADDLE_LEN = 120;
const PADDLE_MARGIN = 20;

let P1_V, P1_H, P2_V, P2_H;
let ball = { x: 0, y: 0, r: 5, vx: 0, vy: 0 };
let scoreP1 = 0;
let scoreP2 = 0;

let gameMode = 'MENU'; // 'MENU', 'LOCAL_2P', 'LOCAL_AI', 'ONLINE', 'ONLINE_PLAY'

function initLocalPaddles() {
    P1_V = { x: PADDLE_MARGIN, y: H/2 - PADDLE_LEN/2, w: PADDLE_THICK, h: PADDLE_LEN };
    P1_H = { x: W/2 - PADDLE_LEN/2, y: H - PADDLE_MARGIN - PADDLE_THICK, w: PADDLE_LEN, h: PADDLE_THICK };
    P2_V = { x: W - PADDLE_MARGIN - PADDLE_THICK, y: H/2 - PADDLE_LEN/2, w: PADDLE_THICK, h: PADDLE_LEN };
    P2_H = { x: W/2 - PADDLE_LEN/2, y: PADDLE_MARGIN, w: PADDLE_LEN, h: PADDLE_THICK };
}

initLocalPaddles();

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    if (id !== 'none') {
        const el = document.getElementById('screen-' + id);
        if (el) el.classList.add('active');
    }
}

// Socket.io integration
let socket = null;
let playerNum = 0; 
let countdownText = '';

document.getElementById('btn-create').addEventListener('click', () => {
    socket = io();
    setupSocket();
    socket.emit('create-room');
});

document.getElementById('btn-join-screen').addEventListener('click', () => {
    showScreen('join');
});

document.getElementById('btn-join').addEventListener('click', () => {
    const code = document.getElementById('join-input').value.trim();
    if (code.length === 6) {
        if (!socket) socket = io();
        setupSocket();
        socket.emit('join-room', code);
    }
});

document.getElementById('btn-copy').addEventListener('click', () => {
    const code = document.getElementById('room-code-display').innerText;
    navigator.clipboard.writeText(code);
    const btn = document.getElementById('btn-copy');
    btn.innerText = "COPIED!";
    setTimeout(() => { btn.innerText = "Copy Code"; }, 2000);
});

function setupSocket() {
    socket.off();
    
    socket.on('room-created', (code) => {
        document.getElementById('room-code-display').innerText = code;
        showScreen('create');
        gameMode = 'ONLINE';
    });

    socket.on('room-joined', (num) => {
        playerNum = num;
        if (num === 2) {
            gameMode = 'ONLINE';
        }
    });

    socket.on('invalid-code', () => {
        const err = document.getElementById('join-error');
        err.style.display = 'block';
        setTimeout(() => { err.style.display = 'none'; }, 3000);
    });

    socket.on('game-start', () => {
        showScreen('none'); 
        gameMode = 'ONLINE_PLAY';
    });

    socket.on('countdown', (text) => {
        countdownText = text;
    });

    socket.on('game-state', (state) => {
        ball = state.ball;
        scoreP1 = state.scores.p1;
        scoreP2 = state.scores.p2;
        
        P1_V.y = state.p1.v_y;
        P1_H.x = state.p1.h_x;
        P2_V.y = state.p2.v_y;
        P2_H.x = state.p2.h_x;
    });
    
    socket.on('game-over', (winner) => {
        gameMode = 'MENU';
        showScreen('game-over');
        document.getElementById('game-over-text').innerText = winner;
        document.getElementById('game-over-sub').innerText = "";
        
        setTimeout(() => {
            showScreen('main');
            if (socket) { socket.disconnect(); socket = null; }
        }, 4000);
    });

    socket.on('opponent-disconnected', () => {
        gameMode = 'MENU';
        showScreen('game-over');
        document.getElementById('game-over-text').innerText = "YOU WIN!";
        document.getElementById('game-over-sub').innerText = "(Opponent Left)";
        
        setTimeout(() => {
            showScreen('main');
            if (socket) { socket.disconnect(); socket = null; }
        }, 3000);
    });
}

const KEY_MAP = {
    'KeyW': 'up', 'ArrowUp': 'up',
    'KeyS': 'down', 'ArrowDown': 'down',
    'KeyA': 'left', 'ArrowLeft': 'left',
    'KeyD': 'right', 'ArrowRight': 'right'
};

const keys = {};
window.addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
    }
    if (!keys[e.code]) {
        keys[e.code] = true;
        if ((gameMode === 'ONLINE_PLAY' || gameMode === 'ONLINE') && socket) {
            const dir = KEY_MAP[e.code];
            if (dir) socket.emit('paddle-move', { dir, active: true });
        }
    }
}, {passive: false});

window.addEventListener('keyup', e => {
    keys[e.code] = false;
    if ((gameMode === 'ONLINE_PLAY' || gameMode === 'ONLINE') && socket) {
        const dir = KEY_MAP[e.code];
        if (dir) socket.emit('paddle-move', { dir, active: false });
    }
});

const PADDLE_SPEED = 6;
const MAX_SPEED = 15;
const SPEED_INC = 0.25;
const MAX_ANGLE = Math.PI / 3;
const WIN_SCORE = 7;
let localBallActive = false;

function resetLocalBall(scorer = 0) {
    localBallActive = false;
    ball.x = W / 2;
    ball.y = H / 2;
    
    setTimeout(() => {
        if (gameMode !== 'LOCAL_2P' && gameMode !== 'LOCAL_AI') return;
        let angle;
        if (scorer === 1) {
            angle = -(Math.PI/8) - Math.random() * (Math.PI/4); 
        } else if (scorer === 2) {
            angle = Math.PI/2 + (Math.PI/8) + Math.random() * (Math.PI/4); 
        } else {
            do {
                angle = Math.random() * Math.PI * 2;
            } while (
                Math.abs(Math.cos(angle)) < 0.2 || 
                Math.abs(Math.sin(angle)) < 0.2
            );
        }
        
        ball.vx = 4 * Math.cos(angle);
        ball.vy = 4 * Math.sin(angle);
        localBallActive = true;
    }, 1000);
}

window.startLocal = function(mode) {
    gameMode = mode === 1 ? 'LOCAL_2P' : 'LOCAL_AI';
    scoreP1 = 0;
    scoreP2 = 0;
    initLocalPaddles();
    resetLocalBall(0);
    showScreen('none');
};

window.resetLocal = function() {
    gameMode = 'MENU';
    document.getElementById('btn-return').style.display = 'none';
};

function rectIntersect(x1, y1, w1, h1, x2, y2, w2, h2) {
    return x2 < x1 + w1 && x2 + w2 > x1 && y2 < y1 + h1 && y2 + h2 > y1;
}

function updateLocal() {
    if (keys['KeyW']) P1_V.y -= PADDLE_SPEED;
    if (keys['KeyS']) P1_V.y += PADDLE_SPEED;
    if (keys['KeyA']) P1_H.x -= PADDLE_SPEED;
    if (keys['KeyD']) P1_H.x += PADDLE_SPEED;
    
    if (gameMode === 'LOCAL_2P') {
        if (keys['ArrowUp']) P2_V.y -= PADDLE_SPEED;
        if (keys['ArrowDown']) P2_V.y += PADDLE_SPEED;
        if (keys['ArrowLeft']) P2_H.x -= PADDLE_SPEED;
        if (keys['ArrowRight']) P2_H.x += PADDLE_SPEED;
    } else if (gameMode === 'LOCAL_AI') {
        const AI_SPEED = 4.5;
        if (ball.x < P2_H.x + P2_H.w/2 - 10) P2_H.x -= AI_SPEED;
        else if (ball.x > P2_H.x + P2_H.w/2 + 10) P2_H.x += AI_SPEED;
        if (ball.y < P2_V.y + P2_V.h/2 - 10) P2_V.y -= AI_SPEED;
        else if (ball.y > P2_V.y + P2_V.h/2 + 10) P2_V.y += AI_SPEED;
    }
    
    P1_V.y = Math.max(0, Math.min(H - P1_V.h, P1_V.y));
    P1_H.x = Math.max(0, Math.min(W - P1_H.w, P1_H.x));
    P2_V.y = Math.max(0, Math.min(H - P2_V.h, P2_V.y));
    P2_H.x = Math.max(0, Math.min(W - P2_H.w, P2_H.x));
    
    if (localBallActive) {
        ball.x += ball.vx;
        ball.y += ball.vy;
        
        const r = ball.r;
        
        if (ball.vx < 0 && rectIntersect(ball.x - r, ball.y - r, r*2, r*2, P1_V.x, P1_V.y, P1_V.w, P1_V.h)) {
            let offset = (ball.y - (P1_V.y + P1_V.h/2)) / (P1_V.h / 2);
            offset = Math.max(-1, Math.min(1, offset));
            let speed = Math.min(MAX_SPEED, Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy) + SPEED_INC);
            let angle = offset * MAX_ANGLE;
            ball.vx = speed * Math.cos(angle);
            ball.vy = speed * Math.sin(angle);
            ball.x = P1_V.x + P1_V.w + r;
        }
        
        if (ball.vx > 0 && rectIntersect(ball.x - r, ball.y - r, r*2, r*2, P2_V.x, P2_V.y, P2_V.w, P2_V.h)) {
            let offset = (ball.y - (P2_V.y + P2_V.h/2)) / (P2_V.h / 2);
            offset = Math.max(-1, Math.min(1, offset));
            let speed = Math.min(MAX_SPEED, Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy) + SPEED_INC);
            let angle = offset * MAX_ANGLE;
            ball.vx = -speed * Math.cos(angle);
            ball.vy = speed * Math.sin(angle);
            ball.x = P2_V.x - r;
        }
        
        if (ball.vy > 0 && rectIntersect(ball.x - r, ball.y - r, r*2, r*2, P1_H.x, P1_H.y, P1_H.w, P1_H.h)) {
            let offset = (ball.x - (P1_H.x + P1_H.w/2)) / (P1_H.w / 2);
            offset = Math.max(-1, Math.min(1, offset));
            let speed = Math.min(MAX_SPEED, Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy) + SPEED_INC);
            let angle = offset * MAX_ANGLE;
            ball.vy = -speed * Math.cos(angle);
            ball.vx = speed * Math.sin(angle);
            ball.y = P1_H.y - r;
        }
        
        if (ball.vy < 0 && rectIntersect(ball.x - r, ball.y - r, r*2, r*2, P2_H.x, P2_H.y, P2_H.w, P2_H.h)) {
            let offset = (ball.x - (P2_H.x + P2_H.w/2)) / (P2_H.w / 2);
            offset = Math.max(-1, Math.min(1, offset));
            let speed = Math.min(MAX_SPEED, Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy) + SPEED_INC);
            let angle = offset * MAX_ANGLE;
            ball.vy = speed * Math.cos(angle);
            ball.vx = speed * Math.sin(angle);
            ball.y = P2_H.y + P2_H.h + r;
        }
        
        if (ball.x < 0 || ball.y > H) {
            scoreP2++;
            if (scoreP2 >= WIN_SCORE) {
                gameMode = 'MENU';
                showScreen('game-over');
                document.getElementById('game-over-text').innerText = "PLAYER 2 WINS!";
                document.getElementById('btn-return').style.display = 'block';
            } else {
                resetLocalBall(2);
            }
        } else if (ball.x > W || ball.y < 0) {
            scoreP1++;
            if (scoreP1 >= WIN_SCORE) {
                gameMode = 'MENU';
                showScreen('game-over');
                document.getElementById('game-over-text').innerText = "PLAYER 1 WINS!";
                document.getElementById('btn-return').style.display = 'block';
            } else {
                resetLocalBall(1);
            }
        }
    }
}

function draw() {
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, W, H);
    
    if (gameMode === 'LOCAL_2P' || gameMode === 'LOCAL_AI' || gameMode === 'ONLINE_PLAY') {
        ctx.strokeStyle = 'white';
        ctx.setLineDash([15, 20]);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(W, H);
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.font = '60px "Press Start 2P", monospace';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.fillText(scoreP1, W/4, H - 60);
        ctx.fillText(scoreP2, 3*W/4, 90);
        
        ctx.fillStyle = 'white';
        ctx.fillRect(P1_V.x, P1_V.y, P1_V.w, P1_V.h);
        ctx.fillRect(P1_H.x, P1_H.y, P1_H.w, P1_H.h);
        ctx.fillRect(P2_V.x, P2_V.y, P2_V.w, P2_V.h);
        ctx.fillRect(P2_H.x, P2_H.y, P2_H.w, P2_H.h);
        
        ctx.fillRect(ball.x - ball.r, ball.y - ball.r, ball.r*2, ball.r*2);

        if (countdownText) {
            ctx.fillStyle = 'white';
            ctx.font = '80px "Press Start 2P", monospace';
            ctx.fillText(countdownText, W/2, H/2 + 30);
        }
    }
}

function loop() {
    if (gameMode === 'LOCAL_2P' || gameMode === 'LOCAL_AI') {
        updateLocal();
    }
    draw();
    requestAnimationFrame(loop);
}

loop();
