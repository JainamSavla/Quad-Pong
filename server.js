const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

// Constants
const W = 600;
const H = 600;
const PADDLE_THICK = 15;
const PADDLE_LEN = 120;
const PADDLE_MARGIN = 20;
const PADDLE_SPEED = 6;
const WIN_SCORE = 7;
const BASE_SPEED = 4;
const MAX_SPEED = 15;
const SPEED_INC = 0.25;
const MAX_ANGLE = Math.PI / 3;

// Rooms store
const rooms = {};

function generateCode() {
    let result = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function initGame(roomId) {
    const room = rooms[roomId];
    room.scoreP1 = 0;
    room.scoreP2 = 0;
    room.ballActive = false;
    room.ball = { x: W/2, y: H/2, r: 5, vx: 0, vy: 0 };
    room.p1 = {
        v_y: H/2 - PADDLE_LEN/2,
        h_x: W/2 - PADDLE_LEN/2
    };
    room.p2 = {
        v_y: H/2 - PADDLE_LEN/2,
        h_x: W/2 - PADDLE_LEN/2
    };
    room.p1_inputs = { up: false, down: false, left: false, right: false };
    room.p2_inputs = { up: false, down: false, left: false, right: false };
    resetBall(room, 0);
}

function rectIntersect(x1, y1, w1, h1, x2, y2, w2, h2) {
    return x2 < x1 + w1 && x2 + w2 > x1 && y2 < y1 + h1 && y2 + h2 > y1;
}

function resetBall(room, scorer = 0) {
    room.ballActive = false;
    room.ball.x = W/2;
    room.ball.y = H/2;
    room.ball.vx = 0;
    room.ball.vy = 0;
    
    setTimeout(() => {
        if (!rooms[room.id]) return; 
        
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
        
        room.ball.vx = BASE_SPEED * Math.cos(angle);
        room.ball.vy = BASE_SPEED * Math.sin(angle);
        room.ballActive = true;
    }, 1000);
}

function stopLoop(room) {
    if (room.loopInt) {
        clearInterval(room.loopInt);
        room.loopInt = null;
    }
}

function startLoop(room) {
    const FPS = 60;
    room.loopInt = setInterval(() => {
        if (!rooms[room.id]) return;
        
        // Update paddles
        if (room.p1_inputs.up) room.p1.v_y -= PADDLE_SPEED;
        if (room.p1_inputs.down) room.p1.v_y += PADDLE_SPEED;
        if (room.p1_inputs.left) room.p1.h_x -= PADDLE_SPEED;
        if (room.p1_inputs.right) room.p1.h_x += PADDLE_SPEED;
        
        if (room.p2_inputs.up) room.p2.v_y -= PADDLE_SPEED;
        if (room.p2_inputs.down) room.p2.v_y += PADDLE_SPEED;
        if (room.p2_inputs.left) room.p2.h_x -= PADDLE_SPEED;
        if (room.p2_inputs.right) room.p2.h_x += PADDLE_SPEED;
        
        // Clamp
        room.p1.v_y = Math.max(0, Math.min(H - PADDLE_LEN, room.p1.v_y));
        room.p1.h_x = Math.max(0, Math.min(W - PADDLE_LEN, room.p1.h_x));
        room.p2.v_y = Math.max(0, Math.min(H - PADDLE_LEN, room.p2.v_y));
        room.p2.h_x = Math.max(0, Math.min(W - PADDLE_LEN, room.p2.h_x));
        
        if (room.ballActive) {
            const b = room.ball;
            b.x += b.vx;
            b.y += b.vy;
            
            const r = b.r;
            
            const p1v = { x: PADDLE_MARGIN, y: room.p1.v_y, w: PADDLE_THICK, h: PADDLE_LEN };
            const p1h = { x: room.p1.h_x, y: H - PADDLE_MARGIN - PADDLE_THICK, w: PADDLE_LEN, h: PADDLE_THICK };
            const p2v = { x: W - PADDLE_MARGIN - PADDLE_THICK, y: room.p2.v_y, w: PADDLE_THICK, h: PADDLE_LEN };
            const p2h = { x: room.p2.h_x, y: PADDLE_MARGIN, w: PADDLE_LEN, h: PADDLE_THICK };
            
            // Collisions
            if (b.vx < 0 && rectIntersect(b.x - r, b.y - r, r*2, r*2, p1v.x, p1v.y, p1v.w, p1v.h)) {
                let offset = (b.y - (p1v.y + p1v.h/2)) / (p1v.h / 2);
                offset = Math.max(-1, Math.min(1, offset));
                let currentSpeed = Math.sqrt(b.vx*b.vx + b.vy*b.vy);
                let speed = Math.min(MAX_SPEED, currentSpeed + SPEED_INC);
                let angle = offset * MAX_ANGLE;
                b.vx = speed * Math.cos(angle);
                b.vy = speed * Math.sin(angle);
                b.x = p1v.x + p1v.w + r;
            }
            if (b.vx > 0 && rectIntersect(b.x - r, b.y - r, r*2, r*2, p2v.x, p2v.y, p2v.w, p2v.h)) {
                let offset = (b.y - (p2v.y + p2v.h/2)) / (p2v.h / 2);
                offset = Math.max(-1, Math.min(1, offset));
                let currentSpeed = Math.sqrt(b.vx*b.vx + b.vy*b.vy);
                let speed = Math.min(MAX_SPEED, currentSpeed + SPEED_INC);
                let angle = offset * MAX_ANGLE;
                b.vx = -speed * Math.cos(angle);
                b.vy = speed * Math.sin(angle);
                b.x = p2v.x - r;
            }
            if (b.vy > 0 && rectIntersect(b.x - r, b.y - r, r*2, r*2, p1h.x, p1h.y, p1h.w, p1h.h)) {
                let offset = (b.x - (p1h.x + p1h.w/2)) / (p1h.w / 2);
                offset = Math.max(-1, Math.min(1, offset));
                let currentSpeed = Math.sqrt(b.vx*b.vx + b.vy*b.vy);
                let speed = Math.min(MAX_SPEED, currentSpeed + SPEED_INC);
                let angle = offset * MAX_ANGLE;
                b.vy = -speed * Math.cos(angle);
                b.vx = speed * Math.sin(angle);
                b.y = p1h.y - r;
            }
            if (b.vy < 0 && rectIntersect(b.x - r, b.y - r, r*2, r*2, p2h.x, p2h.y, p2h.w, p2h.h)) {
                let offset = (b.x - (p2h.x + p2h.w/2)) / (p2h.w / 2);
                offset = Math.max(-1, Math.min(1, offset));
                let currentSpeed = Math.sqrt(b.vx*b.vx + b.vy*b.vy);
                let speed = Math.min(MAX_SPEED, currentSpeed + SPEED_INC);
                let angle = offset * MAX_ANGLE;
                b.vy = speed * Math.cos(angle);
                b.vx = speed * Math.sin(angle);
                b.y = p2h.y + p2h.h + r;
            }
            
            // Scoring
            if (b.x < 0 || b.y > H) {
                room.scoreP2++;
                if (room.scoreP2 >= WIN_SCORE) {
                    io.to(room.id).emit('game-over', 'PLAYER 2 WINS!');
                    stopLoop(room);
                    delete rooms[room.id];
                    return;
                } else {
                    resetBall(room, 2);
                }
            } else if (b.x > W || b.y < 0) {
                room.scoreP1++;
                if (room.scoreP1 >= WIN_SCORE) {
                    io.to(room.id).emit('game-over', 'PLAYER 1 WINS!');
                    stopLoop(room);
                    delete rooms[room.id];
                    return;
                } else {
                    resetBall(room, 1);
                }
            }
        }
        
        io.to(room.id).emit('game-state', {
            ball: room.ball,
            scores: { p1: room.scoreP1, p2: room.scoreP2 },
            p1: room.p1,
            p2: room.p2
        });
        
    }, 1000 / FPS);
}

io.on('connection', (socket) => {
    socket.on('create-room', () => {
        let code;
        do { code = generateCode(); } while (rooms[code]);
        
        rooms[code] = {
            id: code,
            players: [socket.id, null],
            loopInt: null
        };
        
        socket.join(code);
        socket.emit('room-created', code);
        socket.emit('room-joined', 1); // P1 assigns host to Bottom-Left
    });
    
    socket.on('join-room', (code) => {
        code = code.toUpperCase();
        const room = rooms[code];
        if (room && !room.players[1]) {
            room.players[1] = socket.id;
            socket.join(code);
            socket.emit('room-joined', 2); // P2 assigns joining user to Top-Right
            
            // Start game mechanics
            initGame(code);
            io.to(code).emit('game-start');
            
            // 3 seconds countdown
            let countdown = 3;
            let cdInt = setInterval(() => {
                if (countdown > 0) {
                    io.to(code).emit('countdown', countdown);
                    countdown--;
                } else {
                    io.to(code).emit('countdown', 'GO!');
                    clearInterval(cdInt);
                    setTimeout(() => {
                        if (rooms[code]) {
                            io.to(code).emit('countdown', '');
                            startLoop(rooms[code]);
                        }
                    }, 1000);
                }
            }, 1000);
            
        } else {
            socket.emit('invalid-code');
        }
    });
    
    socket.on('paddle-move', (data) => {
        // data: { dir: 'up'/'down'/'left'/'right', active: boolean }
        const room = Object.values(rooms).find(r => r.players.includes(socket.id));
        if (room) {
            const pIndex = room.players.indexOf(socket.id);
            if (pIndex === 0) room.p1_inputs[data.dir] = data.active;
            else if (pIndex === 1) room.p2_inputs[data.dir] = data.active;
        }
    });
    
    socket.on('disconnect', () => {
        const room = Object.values(rooms).find(r => r.players.includes(socket.id));
        if (room) {
            stopLoop(room);
            const remainingPlayer = room.players.find(id => id !== socket.id && id !== null);
            if (remainingPlayer) {
                // Determine disconnect winner automatically and notify remaining player
                io.to(room.id).emit('opponent-disconnected');
            }
            delete rooms[room.id];
        }
    });
});

server.listen(PORT, () => {
    console.log(`Quad Pong API server listening on http://localhost:${PORT}`);
});
