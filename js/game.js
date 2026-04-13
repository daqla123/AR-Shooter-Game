/**
 * AR 兔子躲避游戏
 * 使用MediaPipe检测人脸位置
 * 人脸变小1/4，兔子从四周出现扔萝卜，玩家移动脸部躲避
 */

// ==================== 游戏状态 ====================
const GameState = {
    score: 0,
    health: 100,
    maxHealth: 100,
    isPlaying: false,
    isLoading: false,
    faceDetected: false,
    rabbits: [],
    carrots: [],
    faceBounds: null,
    fingerPosition: null,  // 食指指尖位置
    fingerOnRabbit: null,  // 手指正在指向的兔子
    fingerStartTime: 0,    // 手指放上兔子的开始时间
    gameTime: 0,
    rabbitSpawnTimer: 0,
    rabbitSpawnInterval: 2000
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
    ammo: document.getElementById('ammo')
};

const ctx = elements.canvas.getContext('2d');

// ==================== 初始化画布 ====================
function resizeCanvas() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    elements.canvas.width = width;
    elements.canvas.height = height;
    
    // 同时调整视频尺寸
    if (elements.video) {
        elements.video.style.width = width + 'px';
        elements.video.style.height = height + 'px';
    }
}

// 监听屏幕旋转和尺寸变化
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => {
    setTimeout(resizeCanvas, 100);
});

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
    },
    playCarrotThrow() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.frequency.setValueAtTime(300, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.2);
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
            
            // 人脸区域缩小到原来的1/4（宽高各缩小一半）
            const scale = 0.5;
            const smallW = faceW * scale;
            const smallH = faceH * scale;
            const smallX = faceX + (faceW - smallW) / 2;
            const smallY = faceY + (faceH - smallH) / 2;
            
            GameState.faceBounds = {
                x: smallX,
                y: smallY,
                width: smallW,
                height: smallH,
                centerX: smallX + smallW / 2,
                centerY: smallY + smallH / 2
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
            const indexTip = landmarks[8]; // 食指指尖
            
            // 转换为屏幕坐标（考虑镜像）
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
            GameState.fingerPosition = {
                x: offsetX + (1 - indexTip.x) * scaleX,
                y: offsetY + indexTip.y * scaleY
            };
            
            checkFingerOnRabbit();
        } else {
            GameState.fingerPosition = null;
            GameState.fingerOnRabbit = null;
        }
    });
}

// ==================== 手指停留检测 ====================
function checkFingerOnRabbit() {
    if (!GameState.fingerPosition) return;
    
    const fx = GameState.fingerPosition.x;
    const fy = GameState.fingerPosition.y;
    let targetRabbit = null;
    
    // 查找手指下方的兔子
    for (const rabbit of GameState.rabbits) {
        const dx = fx - rabbit.x;
        const dy = fy - rabbit.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < rabbit.size * 1.5) {
            targetRabbit = rabbit;
            break;
        }
    }
    
    const now = Date.now();
    
    if (targetRabbit) {
        if (GameState.fingerOnRabbit !== targetRabbit) {
            // 手指移到新兔子上，重置计时
            GameState.fingerOnRabbit = targetRabbit;
            GameState.fingerStartTime = now;
        } else {
            // 手指停留在同一只兔子上，检查是否满0.5秒
            if (now - GameState.fingerStartTime >= 500) {
                killRabbit(targetRabbit);
                GameState.fingerOnRabbit = null;
            }
        }
    } else {
        GameState.fingerOnRabbit = null;
    }
}

function killRabbit(rabbit) {
    const index = GameState.rabbits.indexOf(rabbit);
    if (index > -1) {
        GameState.rabbits.splice(index, 1);
        GameState.score += 100;
        AudioSys.playHit();
        showHitEffect(rabbit.x, rabbit.y, 'kill');
        updateUI();
    }
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
    // 从人脸位置发射子弹（横版向右飞行）
    let startX, startY;
    
    if (GameState.faceBounds) {
        // 从人脸中心发射
        startX = GameState.faceBounds.centerX;
        startY = GameState.faceBounds.centerY;
    } else {
        // 默认从左侧发射
        startX = 60;
        startY = elements.canvas.height / 2;
    }
    
    GameState.bullets.push({
        x: startX,
        y: startY,
        vx: 12, // 向右飞
        vy: 0,  // 水平直线
        width: 20,
        height: 6,
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
        
        // 移除超出屏幕的子弹（向右飞出屏幕）
        if (bullet.x > elements.canvas.width + 50 || !bullet.active) {
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
        spawnTime: now,
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
        
        // 计算兔子存活时间（秒）
        const aliveTime = (now - rabbit.spawnTime) / 1000;
        
        // 根据存活时间增加扔萝卜频率和数量
        // 每5秒增加一个难度等级
        const difficultyLevel = Math.floor(aliveTime / 5) + 1;
        const throwCount = Math.min(difficultyLevel, 3); // 最多一次扔3个
        const throwInterval = Math.max(500, 1500 - difficultyLevel * 200); // 最快0.5秒扔一次
        
        // 扔萝卜
        if (now - rabbit.lastThrowTime > throwInterval) {
            rabbit.lastThrowTime = now;
            // 连续扔多个萝卜
            for (let j = 0; j < throwCount; j++) {
                setTimeout(() => throwCarrot(rabbit), j * 100);
            }
        }
        
        // 移除离开屏幕的兔子
        if (rabbit.x < -rabbit.size * 2) {
            GameState.rabbits.splice(i, 1);
        }
    }
}

// ==================== 萝卜系统 ====================
function spawnCarrotFromEdge() {
    // 从屏幕四周生成萝卜，飞向人脸
    const canvasWidth = elements.canvas.width;
    const canvasHeight = elements.canvas.height;
    
    // 获取人脸位置（默认屏幕中央）
    let targetX = canvasWidth / 2;
    let targetY = canvasHeight / 2;
    if (GameState.faceBounds) {
        targetX = GameState.faceBounds.centerX;
        targetY = GameState.faceBounds.centerY;
    }
    
    // 随机从四个边生成
    const edge = Math.floor(Math.random() * 4);
    let startX, startY;
    
    switch(edge) {
        case 0: // 上边
            startX = Math.random() * canvasWidth;
            startY = -30;
            break;
        case 1: // 右边
            startX = canvasWidth + 30;
            startY = Math.random() * canvasHeight;
            break;
        case 2: // 下边
            startX = Math.random() * canvasWidth;
            startY = canvasHeight + 30;
            break;
        case 3: // 左边
            startX = -30;
            startY = Math.random() * canvasHeight;
            break;
    }
    
    const dx = targetX - startX;
    const dy = targetY - startY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    const speed = (3 + Math.random() * 2) * GameState.difficulty;
    
    GameState.carrots.push({
        x: startX,
        y: startY,
        vx: (dx / dist) * speed,
        vy: (dy / dist) * speed,
        size: 20,
        rotation: 0,
        rotationSpeed: 0.1 + Math.random() * 0.1
    });
    
    AudioSys.playCarrotThrow();
}

function throwCarrot(rabbit) {
    // 萝卜朝检测到的人脸位置扔
    const rabbitY = rabbit.y + Math.sin(rabbit.hopOffset) * rabbit.hopHeight;
    
    // 获取目标位置（人脸中心或默认位置）
    let targetX, targetY;
    if (GameState.faceBounds) {
        targetX = GameState.faceBounds.centerX;
        targetY = GameState.faceBounds.centerY;
    } else {
        targetX = elements.canvas.width / 2;
        targetY = elements.canvas.height / 2;
    }
    
    const dx = targetX - rabbit.x;
    const dy = targetY - rabbitY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    const speed = 4 * GameState.difficulty;
    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;
    
    GameState.carrots.push({
        x: rabbit.x,
        y: rabbitY,
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
    // 检测萝卜是否击中人脸区域
    let hitX, hitY, hitRadius;
    
    if (GameState.faceBounds) {
        // 使用检测到的人脸位置
        hitX = GameState.faceBounds.centerX;
        hitY = GameState.faceBounds.centerY;
        hitRadius = Math.min(GameState.faceBounds.width, GameState.faceBounds.height) / 2;
    } else {
        // 默认位置：屏幕左侧
        hitX = 80;
        hitY = elements.canvas.height / 2;
        hitRadius = 60;
    }
    
    const dx = carrot.x - hitX;
    const dy = carrot.y - hitY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    // 萝卜击中判定
    if (dist < hitRadius + carrot.size) {
        GameState.health = Math.max(0, GameState.health - 15);
        AudioSys.playCarrotHit();
        showHitEffect(hitX, hitY, 'damage');
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
    GameState.rabbits = [];
    GameState.carrots = [];
    GameState.fingerPosition = null;
    GameState.fingerOnRabbit = null;
    GameState.rabbitSpawnInterval = 2000;
    updateUI();
}

// ==================== 渲染 ====================
function draw() {
    // 完全清除画布，让下方的video元素透出来
    ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
    
    // 绘制人脸区域（蓝色边框）
    if (GameState.faceBounds) {
        drawFaceArea();
    }
    
    // 绘制兔子
    drawRabbits();
    
    // 绘制萝卜
    drawCarrots();
    
    // 绘制手指
    drawFinger();
}

function drawFinger() {
    if (!GameState.fingerPosition) return;
    
    const x = GameState.fingerPosition.x;
    const y = GameState.fingerPosition.y;
    
    ctx.save();
    
    // 绘制手指圆圈
    ctx.strokeStyle = '#FF5722';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 20, 0, Math.PI * 2);
    ctx.stroke();
    
    // 填充半透明白色
    ctx.fillStyle = 'rgba(255, 87, 34, 0.3)';
    ctx.fill();
    
    // 绘制进度圆环（如果有手指在兔子上）
    if (GameState.fingerOnRabbit) {
        const elapsed = Date.now() - GameState.fingerStartTime;
        const progress = Math.min(elapsed / 500, 1);
        
        ctx.beginPath();
        ctx.arc(x, y, 25, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
        ctx.strokeStyle = '#4CAF50';
        ctx.lineWidth = 4;
        ctx.stroke();
    }
    
    ctx.restore();
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
    
    // 只绘制边框，不画填充（脸不透明，能看到自己）
    ctx.strokeStyle = '#00BFFF';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(
        fb.centerX,
        fb.centerY,
        fb.width / 2,
        fb.height / 2,
        0, 0, Math.PI * 2
    );
    ctx.stroke();
    
    // 四个角的标记
    ctx.strokeStyle = '#00BFFF';
    ctx.lineWidth = 3;
    const cornerSize = 15;
    const x = fb.x;
    const y = fb.y;
    const w = fb.width;
    const h = fb.height;
    
    // 左上角
    ctx.beginPath();
    ctx.moveTo(x, y + cornerSize);
    ctx.lineTo(x, y);
    ctx.lineTo(x + cornerSize, y);
    ctx.stroke();
    
    // 右上角
    ctx.beginPath();
    ctx.moveTo(x + w - cornerSize, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + cornerSize);
    ctx.stroke();
    
    // 左下角
    ctx.beginPath();
    ctx.moveTo(x, y + h - cornerSize);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + cornerSize, y + h);
    ctx.stroke();
    
    // 右下角
    ctx.beginPath();
    ctx.moveTo(x + w - cornerSize, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w, y + h - cornerSize);
    ctx.stroke();
    
    // 绘制"脸"文字
    ctx.fillStyle = '#00BFFF';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('你的脸', fb.centerX, fb.y - 10);
    
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
        
        // 手指停留进度环
        if (GameState.fingerOnRabbit === rabbit) {
            const elapsed = Date.now() - GameState.fingerStartTime;
            const progress = Math.min(elapsed / 500, 1);
            
            ctx.beginPath();
            ctx.arc(x, y - size, size * 0.8, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
            ctx.strokeStyle = '#4CAF50';
            ctx.lineWidth = 4;
            ctx.stroke();
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
        ctx.translate(bullet.x, bullet.y);
        
        // 子弹光晕
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 15);
        gradient.addColorStop(0, 'rgba(255, 235, 59, 0.8)');
        gradient.addColorStop(0.5, 'rgba(255, 152, 0, 0.4)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, Math.PI * 2);
        ctx.fill();
        
        // 子弹主体（横版：水平方向）
        ctx.fillStyle = '#ffeb3b';
        ctx.shadowColor = '#ff9800';
        ctx.shadowBlur = 10;
        // 水平绘制：width是长度，height是粗细
        ctx.beginPath();
        ctx.roundRect(0, -bullet.height/2, bullet.width, bullet.height, 3);
        ctx.fill();
        
        ctx.restore();
    }
}

function drawCrosshair() {
    // 横版：准星在左侧玩家位置
    const x = 80;
    const y = elements.canvas.height / 2;
    
    ctx.save();
    ctx.strokeStyle = GameState.gunDetected ? '#4CAF50' : '#ff9800';
    ctx.lineWidth = 3;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 10;
    
    const size = 25;
    
    // 十字准星（指向右侧）
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x, y + size);
    ctx.moveTo(x, y);
    ctx.lineTo(x + size * 1.5, y);
    ctx.stroke();
    
    // 圆圈
    ctx.beginPath();
    ctx.arc(x, y, size * 0.7, 0, Math.PI * 2);
    ctx.stroke();
    
    // 玩家图标
    ctx.fillStyle = GameState.gunDetected ? '#4CAF50' : '#ff9800';
    ctx.font = 'bold 20px Arial';
    ctx.fillText('🧑', x - 10, y + 45);
    
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
    
    const fireReady = document.getElementById('fireReady');
    if (fireReady) {
        fireReady.textContent = '👆 指住兔子0.5秒消灭';
    }
}

// ==================== 相机初始化 ====================
async function initCamera() {
    try {
        const constraints = {
            video: {
                facingMode: 'user',
                width: { ideal: window.innerWidth },
                height: { ideal: window.innerHeight }
            },
            audio: false
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        elements.video.srcObject = stream;
        
        await new Promise((resolve, reject) => {
            elements.video.onloadedmetadata = () => {
                elements.video.play().then(() => {
                    resolve();
                }).catch(reject);
            };
            elements.video.onerror = reject;
        });
    } catch (err) {
        console.error('摄像头错误:', err);
        alert('无法访问摄像头，请检查权限设置：' + err.message);
        throw err;
    }
}

// ==================== 游戏循环 ====================
let lastCarrotSpawn = 0;
const carrotSpawnInterval = 1500;

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
        initHands();  // 初始化手势检测
        
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

// ==================== 射击系统 ====================
function tryFire() {
    const now = Date.now();
    if (now - GameState.lastFireTime < GameState.fireCooldown || GameState.isReloading) return;
    
    if (GameState.ammo <= 0) {
        reload();
        return;
    }
    
    GameState.ammo--;
    GameState.lastFireTime = now;
    
    // 从人脸位置发射子弹
    let startX, startY;
    if (GameState.faceBounds) {
        startX = GameState.faceBounds.centerX;
        startY = GameState.faceBounds.centerY;
    } else {
        startX = 80;
        startY = elements.canvas.height / 2;
    }
    
    GameState.bullets.push({
        x: startX,
        y: startY,
        vx: 15,
        vy: 0,
        width: 25,
        height: 6,
        active: true
    });
    
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
        updateUI();
    }, GameState.reloadTime);
}

function updateBullets() {
    for (let i = GameState.bullets.length - 1; i >= 0; i--) {
        const bullet = GameState.bullets[i];
        bullet.x += bullet.vx;
        
        // 检测是否击中兔子
        if (checkBulletHitRabbit(bullet)) {
            bullet.active = false;
        }
        
        // 移除离开屏幕的子弹
        if (bullet.x > elements.canvas.width + 50 || !bullet.active) {
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
            rabbit.health -= 34;
            
            if (rabbit.health <= 0) {
                // 消灭兔子
                GameState.score += 100;
                GameState.rabbits.splice(i, 1);
                AudioSys.playHit();
                showHitEffect(rabbit.x, rabbit.y, 'kill');
            } else {
                AudioSys.playHit();
                showHitEffect(rabbit.x, rabbit.y, 'hit');
            }
            
            updateUI();
            return true;
        }
    }
    return false;
}

// ==================== 事件监听 ====================
elements.startBtn.addEventListener('click', startGame);

document.addEventListener('touchmove', (e) => {
    e.preventDefault();
}, { passive: false });
