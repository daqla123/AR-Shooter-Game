/**
 * AR 人脸射击游戏
 * 使用MediaPipe进行人脸和手势检测
 */

// ==================== 游戏状态 ====================
const GameState = {
    score: 0,
    penalty: 0,
    ammo: 5,
    isPlaying: false,
    isLoading: false,
    faceDetected: false,
    gunDetected: false,
    canFire: false,
    lastFireTime: 0,
    fireCooldown: 500, // 射击冷却时间(ms)
    bullets: [],
    targets: [],
    faceBounds: null,
    handPosition: null,
    lastHandY: null,
    gunRaiseThreshold: 30, // 上抬检测阈值
    reloadTime: 2000, // 换弹时间
    isReloading: false
};

// ==================== DOM元素 ====================
const elements = {
    video: document.getElementById('video'),
    canvas: document.getElementById('gameCanvas'),
    startScreen: document.getElementById('startScreen'),
    loadingScreen: document.getElementById('loadingScreen'),
    startBtn: document.getElementById('startBtn'),
    score: document.getElementById('score'),
    penalty: document.getElementById('penalty'),
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
        osc.frequency.setValueAtTime(600, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.15);
    },
    playPenalty() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(150, this.ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
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
            
            // 转换为屏幕坐标（考虑镜像）
            const canvasWidth = elements.canvas.width;
            const canvasHeight = elements.canvas.height;
            
            // 视频通常是4:3或16:9，需要适配到全屏
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
            
            // 扩大人脸区域（增加判定范围）
            const padding = 30;
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
            
            // 记录手部位置（用于上抬检测）
            const wrist = landmarks[0];
            const canvasHeight = elements.canvas.height;
            const currentY = wrist.y * canvasHeight;
            
            // 检测上抬动作
            if (GameState.lastHandY !== null) {
                const deltaY = GameState.lastHandY - currentY; // 上抬时Y值减小
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
    // 手指关键点索引
    const thumbTip = landmarks[4];      // 拇指尖
    const thumbIp = landmarks[3];       // 拇指IP关节
    const indexTip = landmarks[8];      // 食指尖
    const indexPip = landmarks[6];      // 食指PIP关节
    const middleTip = landmarks[12];    // 中指尖
    const middlePip = landmarks[10];    // 中指PIP关节
    const ringTip = landmarks[16];      // 无名指尖
    const ringPip = landmarks[14];      // 无名指PIP关节
    const pinkyTip = landmarks[20];     // 小指尖
    const pinkyPip = landmarks[18];     // 小指PIP关节
    const wrist = landmarks[0];         // 手腕
    
    // 检测枪势：
    // 1. 拇指和食指形成L形（伸出）
    // 2. 其他手指弯曲
    // 3. 拇指和食指之间有一定距离
    
    const isThumbExtended = distance(thumbTip, wrist) > distance(thumbIp, wrist) * 1.2;
    const isIndexExtended = distance(indexTip, wrist) > distance(indexPip, wrist) * 1.3;
    const isMiddleFolded = distance(middleTip, wrist) < distance(middlePip, wrist) * 1.2;
    const isRingFolded = distance(ringTip, wrist) < distance(ringPip, wrist) * 1.2;
    const isPinkyFolded = distance(pinkyTip, wrist) < distance(pinkyPip, wrist) * 1.2;
    
    // 拇指和食指的距离（形成枪口）
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
    
    // 创建子弹
    createBullet();
    
    // 播放音效
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
    // 从屏幕底部中央发射
    const startX = elements.canvas.width / 2;
    const startY = elements.canvas.height - 100;
    
    GameState.bullets.push({
        x: startX,
        y: startY,
        speed: 15,
        width: 6,
        height: 25,
        active: true
    });
}

function updateBullets() {
    for (let i = GameState.bullets.length - 1; i >= 0; i--) {
        const bullet = GameState.bullets[i];
        bullet.y -= bullet.speed;
        
        // 检测碰撞
        if (checkCollision(bullet)) {
            bullet.active = false;
        }
        
        // 移除超出屏幕的子弹
        if (bullet.y < -50 || !bullet.active) {
            GameState.bullets.splice(i, 1);
        }
    }
}

function checkCollision(bullet) {
    // 检测是否击中人脸（失分）
    if (GameState.faceBounds) {
        const fb = GameState.faceBounds;
        if (bullet.x > fb.x && bullet.x < fb.x + fb.width &&
            bullet.y > fb.y && bullet.y < fb.y + fb.height) {
            // 击中了人脸区域
            GameState.penalty += 10;
            AudioSys.playPenalty();
            showHitEffect(fb.centerX, fb.centerY, 'penalty');
            updateUI();
            return true;
        }
    }
    
    // 检测是否击中目标（得分）
    for (let i = GameState.targets.length - 1; i >= 0; i--) {
        const target = GameState.targets[i];
        const dx = bullet.x - target.x;
        const dy = bullet.y - target.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < target.radius + bullet.width) {
            // 击中目标
            GameState.score += target.points;
            GameState.targets.splice(i, 1);
            AudioSys.playHit();
            showHitEffect(target.x, target.y, 'score');
            updateUI();
            return true;
        }
    }
    
    return false;
}

// ==================== 目标系统 ====================
let lastTargetSpawn = 0;
const targetSpawnInterval = 2000;

function spawnTarget() {
    const now = Date.now();
    if (now - lastTargetSpawn < targetSpawnInterval) return;
    
    lastTargetSpawn = now;
    
    // 确保目标不生成在人脸区域附近
    const canvasWidth = elements.canvas.width;
    const canvasHeight = elements.canvas.height;
    
    let x, y;
    let attempts = 0;
    do {
        x = Math.random() * (canvasWidth - 100) + 50;
        y = Math.random() * (canvasHeight * 0.5) + 50;
        attempts++;
    } while (attempts < 10 && isNearFace(x, y, 100));
    
    const colors = [
        { r: 255, g: 107, b: 107 }, // 红
        { r: 78, g: 205, b: 196 },  // 青
        { r: 255, g: 230, b: 109 }, // 黄
        { r: 150, g: 206, b: 180 }  // 绿
    ];
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    GameState.targets.push({
        x: x,
        y: y,
        radius: 25 + Math.random() * 20,
        color: color,
        points: Math.floor(30 - (y / canvasHeight) * 20), // 越远的分数越高
        spawnTime: now,
        lifeTime: 4000 + Math.random() * 2000
    });
}

function isNearFace(x, y, minDistance) {
    if (!GameState.faceBounds) return false;
    const fb = GameState.faceBounds;
    const dx = x - (fb.x + fb.width / 2);
    const dy = y - (fb.y + fb.height / 2);
    return Math.sqrt(dx * dx + dy * dy) < minDistance + fb.width / 2;
}

function updateTargets() {
    const now = Date.now();
    for (let i = GameState.targets.length - 1; i >= 0; i--) {
        const target = GameState.targets[i];
        if (now - target.spawnTime > target.lifeTime) {
            GameState.targets.splice(i, 1);
        }
    }
}

// ==================== 渲染 ====================
function draw() {
    ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
    
    // 绘制人脸透明遮罩
    if (GameState.faceBounds) {
        drawFaceOverlay();
    }
    
    // 绘制目标
    drawTargets();
    
    // 绘制子弹
    drawBullets();
    
    // 绘制准星
    drawCrosshair();
    
    // 绘制人脸轮廓警告
    if (GameState.faceBounds) {
        drawFaceWarning();
    }
}

function drawFaceOverlay() {
    const fb = GameState.faceBounds;
    
    // 创建半透明遮罩效果
    ctx.save();
    
    // 绘制红色半透明覆盖
    ctx.fillStyle = 'rgba(255, 0, 0, 0.15)';
    ctx.beginPath();
    ctx.ellipse(
        fb.x + fb.width / 2,
        fb.y + fb.height / 2,
        fb.width / 2,
        fb.height / 2,
        0, 0, Math.PI * 2
    );
    ctx.fill();
    
    // 绘制边框
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.4)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.ellipse(
        fb.x + fb.width / 2,
        fb.y + fb.height / 2,
        fb.width / 2,
        fb.height / 2,
        0, 0, Math.PI * 2
    );
    ctx.stroke();
    
    // 绘制禁止符号
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(fb.x + fb.width * 0.2, fb.y + fb.height * 0.2);
    ctx.lineTo(fb.x + fb.width * 0.8, fb.y + fb.height * 0.8);
    ctx.stroke();
    
    ctx.restore();
}

function drawFaceWarning() {
    const fb = GameState.faceBounds;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('⚠️ 禁止射击', fb.x + fb.width / 2, fb.y - 15);
    ctx.restore();
}

function drawTargets() {
    const now = Date.now();
    
    for (const target of GameState.targets) {
        const age = now - target.spawnTime;
        const lifeRatio = 1 - (age / target.lifeTime);
        const pulse = Math.sin(age / 200) * 0.1 + 1;
        
        ctx.save();
        
        // 外圈光晕
        const gradient = ctx.createRadialGradient(
            target.x, target.y, 0,
            target.x, target.y, target.radius * 1.5 * pulse
        );
        gradient.addColorStop(0, `rgba(${target.color.r}, ${target.color.g}, ${target.color.b}, ${0.6 * lifeRatio})`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(target.x, target.y, target.radius * 1.5 * pulse, 0, Math.PI * 2);
        ctx.fill();
        
        // 目标主体
        ctx.fillStyle = `rgba(${target.color.r}, ${target.color.g}, ${target.color.b}, ${lifeRatio})`;
        ctx.beginPath();
        ctx.arc(target.x, target.y, target.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // 内圈
        ctx.fillStyle = `rgba(255, 255, 255, ${0.5 * lifeRatio})`;
        ctx.beginPath();
        ctx.arc(target.x, target.y, target.radius * 0.5, 0, Math.PI * 2);
        ctx.fill();
        
        // 分数
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(target.points.toString(), target.x, target.y);
        
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
    hitEffects.push({
        x, y,
        type,
        startTime: Date.now(),
        duration: 500
    });
    
    // 显示文字
    const text = type === 'penalty' ? '-10' : '+' + (type === 'score' ? '?' : '10');
    const color = type === 'penalty' ? '#f44336' : '#4CAF50';
    
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = 'bold 30px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(text, x, y - 30);
    ctx.restore();
}

// ==================== UI更新 ====================
function updateUI() {
    elements.score.textContent = GameState.score;
    elements.penalty.textContent = GameState.penalty;
    
    elements.gunDetected.textContent = GameState.gunDetected ? '已检测 ✓' : '未检测';
    elements.fireReady.textContent = GameState.isReloading ? '换弹中...' : 
                                     GameState.canFire ? '就绪!' : '准备';
    
    elements.gunStatus.className = GameState.gunDetected ? 'active' : '';
    elements.fireStatus.className = (GameState.canFire && !GameState.isReloading) ? 'active' : '';
    
    // 更新弹药显示
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
    
    // 处理MediaPipe输入
    if (elements.video.readyState >= 2) {
        faceDetection.send({ image: elements.video });
        hands.send({ image: elements.video });
    }
    
    // 更新游戏状态
    spawnTarget();
    updateTargets();
    updateBullets();
    
    // 渲染
    draw();
    
    requestAnimationFrame(gameLoop);
}

// ==================== 进度条加载 ====================
async function simulateLoading() {
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const loadingText = document.getElementById('loadingText');
    
    const steps = [
        { percent: 15, text: '正在加载人脸检测模型...', delay: 500 },
        { percent: 35, text: '正在加载手势检测模型...', delay: 800 },
        { percent: 55, text: '正在初始化神经网络...', delay: 600 },
        { percent: 75, text: '正在启动摄像头...', delay: 500 },
        { percent: 90, text: '正在校准AI模型...', delay: 700 },
        { percent: 100, text: '准备就绪！', delay: 300 }
    ];
    
    for (const step of steps) {
        progressBar.style.width = step.percent + '%';
        progressText.textContent = step.percent + '%';
        loadingText.textContent = step.text;
        await new Promise(resolve => setTimeout(resolve, step.delay));
    }
}

// ==================== 游戏控制 ====================
async function startGame() {
    elements.startScreen.style.display = 'none';
    elements.loadingScreen.classList.add('show');
    GameState.isLoading = true;
    
    try {
        // 初始化音频
        AudioSys.init();
        
        // 初始化相机
        await initCamera();
        
        // 初始化MediaPipe
        initFaceDetection();
        initHands();
        
        // 跳过模型加载，极速启动
        progressBar.style.width = '100%';
        progressText.textContent = '100%';
        await new Promise(r => setTimeout(r, 300));
        
        GameState.isLoading = false;
        GameState.isPlaying = true;
        elements.loadingScreen.classList.remove('show');
        
        // 开始游戏循环
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

// 防止页面滚动（移动端）
document.addEventListener('touchmove', (e) => {
    e.preventDefault();
}, { passive: false });

// 点击也可以射击（测试用）
elements.canvas.addEventListener('click', () => {
    if (GameState.isPlaying && GameState.ammo > 0 && !GameState.isReloading) {
        tryFire();
    }
});
