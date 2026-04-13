/**
 * AR 横版兔子射击游戏
 * 使用MediaPipe进行人脸和手势检测
 * 兔子从右侧出现，向左移动，扔萝卜攻击玩家
 */

// ==================== 游戏状态 ====================
const GameState = {
    score: 0,
    health: 100,
    maxHealth: 100,
    ammo: 5,
    isPlaying: false,
    isLoading: false,
    faceDetected: false,
    gunDetected: false,
    canFire: false,
    lastFireTime: 0,
    fireCooldown: 400,
    bullets: [],
    rabbits: [],
    carrots: [],
    faceBounds: null,
    handPosition: null,
    lastHandY: null,
    gunRaiseThreshold: 30,
    reloadTime: 2000,
    isReloading: false,
    gameTime: 0,
    rabbitSpawnTimer: 0,
    rabbitSpawnInterval: 2000,
    difficulty: 1
};

// ==================== DOM元素 ====================
const elements = {
    video: document.getElementById('video'),
    canvas: document.getElementById('gameCanvas'),
    startScreen: document.getElementById('startScreen'),
    loadingScreen: document.getElementById('loadingScreen'),
    startBtn: document.getElementById('startBtn'),
    score: document.getElementById('score'),
    health: document.getElementById('health'),
    healthBar: document.getElementById('healthBar'),
    gunDetected: document.getElementById('gunDetected'),
    fireReady: document.getElementById('fireReady'),
    ammo: document.getElementById('ammo'),
    gunStatus: document.getElementById('gunStatus'),
    fireStatus: document.getElementById('fireStatus')
};

const ctx = elements.canvas.getContext('2d');

// ==================== 初始化画布 ====================
function resizeCanvas() {
    elements.canvas.width = window.innerWidth;
    elements.canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ==================== 音效系统 ====================
const AudioSys = {
    ctx: null,
    init() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    },
    playShoot() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.frequency.setValueAtTime(800, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    },
    playHit() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.frequency.setValueAtTime(400, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.15);
    },
    playCarrotHit() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(100, this.ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.3);
    },
    playReload() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.frequency.setValueAtTime(400, this.ctx.currentTime);
        osc.frequency.setValueAtTime(600, this.ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.3);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.3);
    },
    playRabbitSpawn() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(600, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }
};

// ==================== MediaPipe 人脸检测 ====================
let faceDetection = null;

function initFaceDetection() {
    faceDetection = new FaceDetection({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`;
        }
    });
    
    faceDetection.setOptions({
        model: 'short',
        minDetectionConfidence: 0.5
    });
    
    faceDetection.onResults((results) => {
        GameState.faceDetected = results.detections.length > 0;
        if (results.detections.length > 0) {
            const detection = results.detections[0];
            const { xMin, yMin, width, height } = detection.boundingBox;
            
            const canvasWidth = elements.canvas.width;
            const canvasHeight = elements.canvas.height;
            
            const videoAspect = elements.video.videoWidth / elements.video.videoHeight;
            const screenAspect = canvasWidth / canvasHeight;
            
            let scaleX, scaleY, offsetX = 0, offsetY = 0;
            
            if (videoAspect > screenAspect) {
                scaleY = canvasHeight;
                scaleX = scaleY * videoAspect;
                offsetX = (canvasWidth - scaleX) / 2;
            } else {
                scaleX = canvasWidth;
                scaleY = scaleX / videoAspect;
                offsetY = (canvasHeight - scaleY) / 2;
            }
            
            // 镜像翻转x坐标
            const faceX = offsetX + (1 - xMin - width) * scaleX;
            const faceY = offsetY + yMin * scaleY;
            const faceW = width * scaleX;
            const faceH = height * scaleY;
            
            // 缩小人脸判定区域（只检测中心区域）
            const padding = -10;
            GameState.faceBounds = {
                x: faceX - padding,
                y: faceY - padding,
                width: faceW + padding * 2,
                height: faceH + padding * 2,
                centerX: faceX + faceW / 2,
                centerY: faceY + faceH / 2
            };
        } else {
            GameState.faceBounds = null;
        }
    });
}

// ==================== MediaPipe 手势检测 ====================
let hands = null;

function initHands() {
    hands = new Hands({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
    });
    
    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    
    hands.onResults((results) => {
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            detectGunGesture(landmarks);
            
            const wrist = landmarks[0];
            const canvasHeight = elements.canvas.height;
            const currentY = wrist.y * canvasHeight;
            
            if (GameState.lastHandY !== null) {
                const deltaY = GameState.lastHandY - currentY;
                if (GameState.gunDetected && deltaY > GameState.gunRaiseThreshold) {
                    tryFire();
                }
            }
            GameState.lastHandY = currentY;
            GameState.handPosition = { x: wrist.x, y: wrist.y };
        } else {
            GameState.gunDetected = false;
            GameState.canFire = false;
            GameState.lastHandY = null;
            GameState.handPosition = null;
        }
        updateUI();
    });
}

// ==================== 枪势检测 ====================
function detectGunGesture(landmarks) {
    const thumbTip = landmarks[4];
    const thumbIp = landmarks[3];
    const indexTip = landmarks[8];
    const indexPip = landmarks[6];
    const middleTip = landmarks[12];
    const middlePip = landmarks[10];
    const ringTip = landmarks[16];
    const ringPip = landmarks[14];
    const pinkyTip = landmarks[20];
    const pinkyPip = landmarks[18];
    const wrist = landmarks[0];
    
    const isThumbExtended = distance(thumbTip, wrist) > distance(thumbIp, wrist) * 1.2;
    const isIndexExtended = distance(indexTip, wrist) > distance(indexPip, wrist) * 1.3;
    const isMiddleFolded = distance(middleTip, wrist) < distance(middlePip, wrist) * 1.2;
    const isRingFolded = distance(ringTip, wrist) < distance(ringPip, wrist) * 1.2;
    const isPinkyFolded = distance(pinkyTip, wrist) < distance(pinkyPip, wrist) * 1.2;
    
    const gunBarrelDistance = distance(thumbTip, indexTip);
    const isGunShape = gunBarrelDistance > 0.05 && gunBarrelDistance < 0.25;
    
    GameState.gunDetected = isThumbExtended && isIndexExtended && 
                           (isMiddleFolded || isRingFolded || isPinkyFolded) &&
                           isGunShape;
    
    GameState.canFire = GameState.gunDetected && !GameState.isReloading;
}

function distance(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

// ==================== 射击逻辑 ====================
function tryFire() {
    const now = Date.now();
    if (!GameState.canFire || GameState.isReloading) return;
    if (now - GameState.lastFireTime < GameState.fireCooldown) return;
    
    if (GameState.ammo <= 0) {
        reload();
        return;
    }
    
    GameState.ammo--;
    GameState.lastFireTime = now;
    
    createBullet();
    AudioSys.playShoot();
    updateUI();
    
    if (GameState.ammo <= 0) {
        setTimeout(reload, 300);
    }
}

function reload() {
    if (GameState.isReloading) return;
    GameState.isReloading = true;
    updateUI();
    
    setTimeout(() => {
        GameState.ammo = 5;
        GameState.isReloading = false;
        AudioSys.playReload();
        updateUI();
    }, GameState.reloadTime);
}

// ==================== 子弹系统 ====================
function createBullet() {
    // 从屏幕底部中央发射，向右上方射向兔子
    const startX = elements.canvas.width / 2;
    const startY = elements.canvas.height - 100;
    
    GameState.bullets.push({
        x: startX,
        y: startY,
        vx: 8 + Math.random() * 4,
        vy: -3 - Math.random() * 2,
        width: 8,
        height: 20,
        active: true
    });
}

function updateBullets() {
    for (let i = GameState.bullets.length - 1; i >= 0; i--) {
        const bullet = GameState.bullets[i];
        bullet.x += bullet.vx;
        bullet.y += bullet.vy;
        
        // 检测是否击中兔子
        if (checkBulletHitRabbit(bullet)) {
            bullet.active = false;
        }
        
        // 移除超出屏幕的子弹
        if (bullet.x > elements.canvas.width + 50 || bullet.y < -50 || !bullet.active) {
            GameState.bullets.splice(i, 1);
        }
    }
}

function checkBulletHitRabbit(bullet) {
    for (let i = GameState.rabbits.length - 1; i >= 0; i--) {
        const rabbit = GameState.rabbits[i];
        const dx = bullet.x - rabbit.x;
        const dy = bullet.y - rabbit.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < rabbit.size + bullet.width) {
            // 击中兔子
            GameState.score += 10;
            rabbit.health--;
            
            if (rabbit.health <= 0) {
                GameState.rabbits.splice(i, 1);
                GameState.score += 20;
                showHitEffect(rabbit.x, rabbit.y, 'kill');
            } else {
                showHitEffect(rabbit.x, rabbit.y, 'hit');
            }
            
            AudioSys.playHit();
            updateUI();
            return true;
        }
    }
    return false;
}

// ==================== 兔子系统 ====================
function spawnRabbit() {
    const now = Date.now();
    if (now - GameState.rabbitSpawnTimer < GameState.rabbitSpawnInterval) return;
    
    GameState.rabbitSpawnTimer = now;
    
    // 随着时间增加难度
    GameState.difficulty = 1 + Math.floor(GameState.score / 100) * 0.2;
    GameState.rabbitSpawnInterval = Math.max(800, 2000 - GameState.score * 5);
    
    const canvasWidth = elements.canvas.width;
    const canvasHeight = elements.canvas.height;
    
    // 兔子从右侧出现，高度随机
    const y = Math.random() * (canvasHeight * 0.6) + canvasHeight * 0.1;
    const size = 40 + Math.random() * 20;
    const speed = (2 + Math.random() * 2) * GameState.difficulty;
    
    GameState.rabbits.push({
        x: canvasWidth + size,
        y: y,
        size: size,
        speed: speed,
        health: Math.floor(GameState.difficulty),
        maxHealth: Math.floor(GameState.difficulty),
        lastThrowTime: 0,
        throwInterval: 1500 + Math.random() * 1000,
        hopOffset: Math.random() * Math.PI * 2,
        hopSpeed: 0.1 + Math.random() * 0.1,
        hopHeight: 10 + Math.random() * 10
    });
    
    AudioSys.playRabbitSpawn();
}

function updateRabbits() {
    const now = Date.now();
    
    for (let i = GameState.rabbits.length - 1; i >= 0; i--) {
        const rabbit = GameState.rabbits[i];
        
        // 向左移动
        rabbit.x -= rabbit.speed;
        
        // 跳跃动画
        rabbit.hopOffset += rabbit.hopSpeed;
        const hopY = Math.sin(rabbit.hopOffset) * rabbit.hopHeight;
        
        // 扔萝卜
        if (now - rabbit.lastThrowTime > rabbit.throwInterval) {
            rabbit.lastThrowTime = now;
            throwCarrot(rabbit);
        }
        
        // 移除离开屏幕的兔子
        if (rabbit.x < -rabbit.size * 2) {
            GameState.rabbits.splice(i, 1);
        }
    }
}

// ==================== 萝卜系统 ====================
function throwCarrot(rabbit) {
    if (!GameState.faceBounds) return;
    
    const fb = GameState.faceBounds;
    const targetX = fb.centerX;
    const targetY = fb.centerY;
    
    const dx = targetX - rabbit.x;
    const dy = targetY - (rabbit.y + Math.sin(rabbit.hopOffset) * rabbit.hopHeight);
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    const speed = 5 * GameState.difficulty;
    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;
    
    GameState.carrots.push({
        x: rabbit.x,
        y: rabbit.y + Math.sin(rabbit.hopOffset) * rabbit.hopHeight,
        vx: vx,
        vy: vy,
        size: 15,
        rotation: 0,
        rotationSpeed: 0.1 + Math.random() * 0.1
    });
}

function updateCarrots() {
    for (let i = GameState.carrots.length - 1; i >= 0; i--) {
        const carrot = GameState.carrots[i];
        
        carrot.x += carrot.vx;
        carrot.y += carrot.vy;
        carrot.rotation += carrot.rotationSpeed;
        
        // 检测是否击中人脸
        if (checkCarrotHitFace(carrot)) {
            GameState.carrots.splice(i, 1);
            continue;
        }
        
        // 移除离开屏幕的萝卜
        if (carrot.x < -50 || carrot.x > elements.canvas.width + 50 ||
            carrot.y < -50 || carrot.y > elements.canvas.height + 50) {
            GameState.carrots.splice(i, 1);
        }
    }
}

function checkCarrotHitFace(carrot) {
    if (!GameState.faceBounds) return false;
    
    const fb = GameState.faceBounds;
    const dx = carrot.x - fb.centerX;
    const dy = carrot.y - fb.centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    // 萝卜击中人脸判定区域
    if (dist < fb.width / 2 + carrot.size) {
        GameState.health = Math.max(0, GameState.health - 15);
        AudioSys.playCarrotHit();
        showHitEffect(fb.centerX, fb.centerY, 'damage');
        updateUI();
        
        // 检查游戏结束
        if (GameState.health <= 0) {
            gameOver();
        }
        
        return true;
    }
    
    return false;
}

// ==================== 游戏结束 ====================
function gameOver() {
    GameState.isPlaying = false;
    
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, elements.canvas.width, elements.canvas.height);
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 60px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('游戏结束', elements.canvas.width / 2, elements.canvas.height / 2 - 50);
    
    ctx.font = '30px Arial';
    ctx.fillText(`最终得分: ${GameState.score}`, elements.canvas.width / 2, elements.canvas.height / 2 + 20);
    
    ctx.font = '20px Arial';
    ctx.fillText('点击重新开始', elements.canvas.width / 2, elements.canvas.height / 2 + 80);
    ctx.restore();
    
    // 5秒后返回开始界面
    setTimeout(() => {
        resetGame();
        elements.startScreen.style.display = 'flex';
    }, 5000);
}

function resetGame() {
    GameState.score = 0;
    GameState.health = GameState.maxHealth;
    GameState.ammo = 5;
    GameState.bullets = [];
    GameState.rabbits = [];
    GameState.carrots = [];
    GameState.isReloading = false;
    GameState.difficulty = 1;
    GameState.rabbitSpawnInterval = 2000;
    updateUI();
}

// ==================== 渲染 ====================
function draw() {
    ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
    
    // 绘制背景网格（横版游戏风格）
    drawBackground();
    
    // 绘制人脸区域
    if (GameState.faceBounds) {
        drawFaceArea();
    }
    
    // 绘制兔子
    drawRabbits();
    
    // 绘制萝卜
    drawCarrots();
    
    // 绘制子弹
    drawBullets();
    
    // 绘制准星
    drawCrosshair();
}

function drawBackground() {
    // 绘制简单的横版游戏背景
    const canvasWidth = elements.canvas.width;
    const canvasHeight = elements.canvas.height;
    
    // 渐变背景
    const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
    gradient.addColorStop(0, '#87CEEB');
    gradient.addColorStop(0.7, '#E0F6FF');
    gradient.addColorStop(0.7, '#90EE90');
    gradient.addColorStop(1, '#228B22');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // 绘制草地细节
    ctx.strokeStyle = '#1a6b1a';
    ctx.lineWidth = 2;
    for (let i = 0; i < canvasWidth; i += 50) {
        const x = (i + GameState.gameTime * 0.5) % canvasWidth;
        ctx.beginPath();
        ctx.moveTo(x, canvasHeight - 20);
        ctx.lineTo(x - 5, canvasHeight - 40);
        ctx.lineTo(x + 5, canvasHeight - 40);
        ctx.lineTo(x + 10, canvasHeight - 20);
        ctx.stroke();
    }
}

function drawFaceArea() {
    const fb = GameState.faceBounds;
    
    ctx.save();
    
    // 绘制人脸保护区域
    ctx.strokeStyle = `rgba(0, 150, 255, ${0.5 + Math.sin(GameState.gameTime * 0.1) * 0.2})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.ellipse(
        fb.centerX,
        fb.centerY,
        fb.width / 2,
        fb.height / 2,
        0, 0, Math.PI * 2
    );
    ctx.stroke();
    
    // 绘制护盾图标
    ctx.fillStyle = 'rgba(0, 150, 255, 0.3)';
    ctx.beginPath();
    ctx.ellipse(
        fb.centerX,
        fb.centerY,
        fb.width / 2,
        fb.height / 2,
        0, 0, Math.PI * 2
    );
    ctx.fill();
    
    ctx.restore();
}

function drawRabbits() {
    for (const rabbit of GameState.rabbits) {
        const hopY = Math.sin(rabbit.hopOffset) * rabbit.hopHeight;
        const x = rabbit.x;
        const y = rabbit.y + hopY;
        const size = rabbit.size;
        
        ctx.save();
        
        // 阴影
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.beginPath();
        ctx.ellipse(x, rabbit.y + size, size * 0.6, size * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // 兔子身体（圆形）
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(x, y, size * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#DDD';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // 耳朵
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.ellipse(x - size * 0.3, y - size * 0.8, size * 0.2, size * 0.5, -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(x + size * 0.3, y - size * 0.8, size * 0.2, size * 0.5, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // 耳朵内部（粉色）
        ctx.fillStyle = '#FFB6C1';
        ctx.beginPath();
        ctx.ellipse(x - size * 0.3, y - size * 0.8, size * 0.1, size * 0.3, -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + size * 0.3, y - size * 0.8, size * 0.1, size * 0.3, 0.2, 0, Math.PI * 2);
        ctx.fill();
        
        // 眼睛
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.arc(x - size * 0.2, y - size * 0.1, size * 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + size * 0.2, y - size * 0.1, size * 0.1, 0, Math.PI * 2);
        ctx.fill();
        
        // 眼睛高光
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(x - size * 0.15, y - size * 0.15, size * 0.03, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + size * 0.25, y - size * 0.15, size * 0.03, 0, Math.PI * 2);
        ctx.fill();
        
        // 鼻子
        ctx.fillStyle = '#FFB6C1';
        ctx.beginPath();
        ctx.arc(x, y + size * 0.1, size * 0.08, 0, Math.PI * 2);
        ctx.fill();
        
        // 血条
        if (rabbit.maxHealth > 1) {
            const barWidth = size * 1.2;
            const barHeight = 6;
            const healthRatio = rabbit.health / rabbit.maxHealth;
            
            ctx.fillStyle = '#333';
            ctx.fillRect(x - barWidth / 2, y - size - 15, barWidth, barHeight);
            
            ctx.fillStyle = healthRatio > 0.5 ? '#4CAF50' : '#FF5722';
            ctx.fillRect(x - barWidth / 2, y - size - 15, barWidth * healthRatio, barHeight);
        }
        
        ctx.restore();
    }
}

function drawCarrots() {
    for (const carrot of GameState.carrots) {
        ctx.save();
        ctx.translate(carrot.x, carrot.y);
        ctx.rotate(carrot.rotation);
        
        const size = carrot.size;
        
        // 萝卜身体（橙色三角形）
        ctx.fillStyle = '#FF8C00';
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.lineTo(-size * 0.5, size * 0.5);
        ctx.lineTo(size * 0.5, size * 0.5);
        ctx.closePath();
        ctx.fill();
        
        // 萝卜叶子（绿色）
        ctx.fillStyle = '#228B22';
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.lineTo(-size * 0.3, -size * 1.5);
        ctx.lineTo(0, -size * 1.2);
        ctx.lineTo(size * 0.3, -size * 1.5);
        ctx.closePath();
        ctx.fill();
        
        // 萝卜纹理
        ctx.strokeStyle = '#E65100';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -size * 0.5);
        ctx.lineTo(0, size * 0.3);
        ctx.stroke();
        
        ctx.restore();
    }
}

function drawBullets() {
    for (const bullet of GameState.bullets) {
        ctx.save();
        
        // 子弹光晕
        const gradient = ctx.createRadialGradient(
            bullet.x, bullet.y, 0,
            bullet.x, bullet.y, 20
        );
        gradient.addColorStop(0, 'rgba(255, 235, 59, 0.8)');
        gradient.addColorStop(0.5, 'rgba(255, 152, 0, 0.4)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, 20, 0, Math.PI * 2);
        ctx.fill();
        
        // 子弹主体
        ctx.fillStyle = '#ffeb3b';
        ctx.shadowColor = '#ff9800';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.roundRect(bullet.x - bullet.width/2, bullet.y - bullet.height/2, bullet.width, bullet.height, 3);
        ctx.fill();
        
        ctx.restore();
    }
}

function drawCrosshair() {
    if (!GameState.canFire) return;
    
    const x = elements.canvas.width / 2;
    const y = elements.canvas.height - 150;
    
    ctx.save();
    ctx.strokeStyle = GameState.gunDetected ? '#4CAF50' : '#ff9800';
    ctx.lineWidth = 2;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 10;
    
    const size = 20;
    
    // 十字准星
    ctx.beginPath();
    ctx.moveTo(x - size, y);
    ctx.lineTo(x + size, y);
    ctx.moveTo(x, y - size);
    ctx.lineTo(x, y + size);
    ctx.stroke();
    
    // 圆圈
    ctx.beginPath();
    ctx.arc(x, y, size * 0.7, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.restore();
}

// ==================== 击中效果 ====================
const hitEffects = [];

function showHitEffect(x, y, type) {
    let text, color;
    
    switch(type) {
        case 'hit':
            text = '命中!';
            color = '#4CAF50';
            break;
        case 'kill':
            text = '消灭!';
            color = '#FFD700';
            break;
        case 'damage':
            text = '-15 HP';
            color = '#f44336';
            break;
        default:
            text = '';
            color = '#fff';
    }
    
    hitEffects.push({
        x, y,
        text,
        color,
        startTime: Date.now(),
        duration: 800,
        vy: -2
    });
}

function updateHitEffects() {
    const now = Date.now();
    
    for (let i = hitEffects.length - 1; i >= 0; i--) {
        const effect = hitEffects[i];
        const age = now - effect.startTime;
        const progress = age / effect.duration;
        
        if (progress >= 1) {
            hitEffects.splice(i, 1);
            continue;
        }
        
        effect.y += effect.vy;
        const alpha = 1 - progress;
        
        ctx.save();
        ctx.fillStyle = effect.color;
        ctx.globalAlpha = alpha;
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(effect.text, effect.x, effect.y);
        ctx.restore();
    }
}

// ==================== UI更新 ====================
function updateUI() {
    elements.score.textContent = GameState.score;
    elements.health.textContent = GameState.health;
    elements.healthBar.style.width = (GameState.health / GameState.maxHealth * 100) + '%';
    
    // 根据血量改变颜色
    if (GameState.health > 60) {
        elements.healthBar.style.backgroundColor = '#4CAF50';
    } else if (GameState.health > 30) {
        elements.healthBar.style.backgroundColor = '#FF9800';
    } else {
        elements.healthBar.style.backgroundColor = '#f44336';
    }
    
    elements.gunDetected.textContent = GameState.gunDetected ? '已检测 ✓' : '未检测';
    elements.fireReady.textContent = GameState.isReloading ? '换弹中...' : 
                                     GameState.canFire ? '就绪!' : '准备';
    
    elements.gunStatus.className = GameState.gunDetected ? 'active' : '';
    elements.fireStatus.className = (GameState.canFire && !GameState.isReloading) ? 'active' : '';
    
    let ammoStr = '';
    for (let i = 0; i < 5; i++) {
        ammoStr += i < GameState.ammo ? '🔫' : '⚫';
    }
    elements.ammo.textContent = ammoStr;
}

// ==================== 相机初始化 ====================
async function initCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'user',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        });
        
        elements.video.srcObject = stream;
        
        return new Promise((resolve) => {
            elements.video.onloadedmetadata = () => {
                elements.video.play();
                resolve();
            };
        });
    } catch (err) {
        alert('无法访问摄像头，请确保已授予摄像头权限：' + err.message);
        throw err;
    }
}

// ==================== 游戏循环 ====================
function gameLoop() {
    if (!GameState.isPlaying) return;
    
    GameState.gameTime++;
    
    // 处理MediaPipe输入
    if (elements.video.readyState >= 2) {
        faceDetection.send({ image: elements.video });
        hands.send({ image: elements.video });
    }
    
    // 更新游戏状态
    spawnRabbit();
    updateRabbits();
    updateCarrots();
    updateBullets();
    
    // 渲染
    draw();
    updateHitEffects();
    
    requestAnimationFrame(gameLoop);
}

// ==================== 游戏控制 ====================
async function startGame() {
    elements.startScreen.style.display = 'none';
    elements.loadingScreen.classList.add('show');
    GameState.isLoading = true;
    
    try {
        AudioSys.init();
        await initCamera();
        initFaceDetection();
        initHands();
        
        // 极速启动
        await new Promise(r => setTimeout(r, 500));
        
        GameState.isLoading = false;
        GameState.isPlaying = true;
        elements.loadingScreen.classList.remove('show');
        
        resetGame();
        gameLoop();
        
    } catch (err) {
        console.error('游戏启动失败:', err);
        elements.loadingScreen.classList.remove('show');
        elements.startScreen.style.display = 'flex';
        alert('游戏启动失败，请刷新页面重试');
    }
}

// ==================== 事件监听 ====================
elements.startBtn.addEventListener('click', startGame);

document.addEventListener('touchmove', (e) => {
    e.preventDefault();
}, { passive: false });

elements.canvas.addEventListener('click', () => {
    if (GameState.isPlaying && GameState.ammo > 0 && !GameState.isReloading) {
        tryFire();
    }
});
