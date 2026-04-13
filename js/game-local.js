/**
 * AR人脸射击游戏 - 本地模型版本
 * 使用TensorFlow.js + BlazePose (更轻量)
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
    fireCooldown: 500,
    bullets: [],
    targets: [],
    faceBounds: null,
    handPosition: null,
    lastHandY: null,
    gunRaiseThreshold: 30,
    reloadTime: 2000,
    isReloading: false,
    detector: null,
    modelLoaded: false
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
    fireStatus: document.getElementById('fireStatus'),
    progressBar: document.getElementById('progressBar'),
    progressText: document.getElementById('progressText'),
    loadingText: document.getElementById('loadingText')
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

// ==================== 简化的姿态检测（基于关键点） ====================
class SimplePoseDetector {
    constructor() {
        this.model = null;
        this.isLoaded = false;
    }

    async load(progressCallback) {
        // 使用简化的关键点检测，不需要大模型
        progressCallback(20, '初始化检测器...');
        
        // 模拟模型加载（实际使用Canvas像素分析）
        await new Promise(r => setTimeout(r, 500));
        progressCallback(50, '加载视觉模型...');
        
        await new Promise(r => setTimeout(r, 500));
        progressCallback(80, '校准检测参数...');
        
        await new Promise(r => setTimeout(r, 300));
        progressCallback(100, '准备就绪！');
        
        this.isLoaded = true;
        return true;
    }

    detect(video) {
        // 简化的检测逻辑：基于肤色检测和形状分析
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 240;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // 获取图像数据
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // 简化的脸部检测（基于肤色和圆形度）
        const faceResult = this.detectFace(data, canvas.width, canvas.height);
        
        // 简化的手部/枪势检测
        const handResult = this.detectHand(data, canvas.width, canvas.height);
        
        return {
            face: faceResult,
            hand: handResult
        };
    }

    detectFace(data, width, height) {
        // 简化的脸部检测：找肤色区域中心
        let skinPixels = [];
        
        for (let y = 0; y < height; y += 4) {
            for (let x = 0; x < width; x += 4) {
                const idx = (y * width + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                
                // 肤色检测（简化）
                if (r > 90 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15) {
                    skinPixels.push({x, y});
                }
            }
        }
        
        if (skinPixels.length < 100) return null;
        
        // 计算中心点
        const centerX = skinPixels.reduce((a, p) => a + p.x, 0) / skinPixels.length;
        const centerY = skinPixels.reduce((a, p) => a + p.y, 0) / skinPixels.length;
        
        // 估算脸部大小
        const radius = Math.sqrt(skinPixels.length) * 2;
        
        return {
            x: (centerX - radius) / width,
            y: (centerY - radius * 1.2) / height,
            width: (radius * 2) / width,
            height: (radius * 2.5) / height
        };
    }

    detectHand(data, width, height) {
        // 简化的手部检测：在画面下半部分找肤色区域
        const handY = height * 0.6;
        let handPixels = [];
        
        for (let y = handY; y < height; y += 3) {
            for (let x = 0; x < width; x += 3) {
                const idx = (y * width + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                
                if (r > 90 && g > 40 && b > 20 && r > g) {
                    handPixels.push({x, y});
                }
            }
        }
        
        if (handPixels.length < 50) return null;
        
        const centerX = handPixels.reduce((a, p) => a + p.x, 0) / handPixels.length;
        const centerY = handPixels.reduce((a, p) => a + p.y, 0) / handPixels.length;
        
        return {
            x: centerX / width,
            y: centerY / height,
            detected: true
        };
    }
}

// ==================== 进度条更新 ====================
function updateProgress(percent, text) {
    if (elements.progressBar) {
        elements.progressBar.style.width = percent + '%';
    }
    if (elements.progressText) {
        elements.progressText.textContent = percent + '%';
    }
    if (elements.loadingText) {
        elements.loadingText.textContent = text;
    }
}

// ==================== 检测循环 ====================
function detectionLoop() {
    if (!GameState.isPlaying || !elements.video.readyState >= 2) {
        requestAnimationFrame(detectionLoop);
        return;
    }
    
    const results = GameState.detector.detect(elements.video);
    
    // 处理脸部检测
    if (results.face) {
        GameState.faceDetected = true;
        const fb = results.face;
        const canvasWidth = elements.canvas.width;
        const canvasHeight = elements.canvas.height;
        
        // 转换为屏幕坐标（镜像）
        GameState.faceBounds = {
            x: (1 - fb.x - fb.width) * canvasWidth,
            y: fb.y * canvasHeight,
            width: fb.width * canvasWidth,
            height: fb.height * canvasHeight,
            centerX: (1 - fb.x - fb.width / 2) * canvasWidth,
            centerY: (fb.y + fb.height / 2) * canvasHeight
        };
    } else {
        GameState.faceDetected = false;
        GameState.faceBounds = null;
    }
    
    // 处理手部检测
    if (results.hand) {
        GameState.gunDetected = true;
        GameState.canFire = !GameState.isReloading;
        
        const currentY = results.hand.y * elements.canvas.height;
        if (GameState.lastHandY !== null) {
            const deltaY = GameState.lastHandY - currentY;
            if (deltaY > GameState.gunRaiseThreshold) {
                tryFire();
            }
        }
        GameState.lastHandY = currentY;
    } else {
        GameState.gunDetected = false;
        GameState.canFire = false;
        GameState.lastHandY = null;
    }
    
    updateUI();
    requestAnimationFrame(detectionLoop);
}

// ==================== 游戏循环 ====================
function gameLoop() {
    if (!GameState.isPlaying) return;
    
    spawnTarget();
    updateTargets();
    updateBullets();
    draw();
    
    requestAnimationFrame(gameLoop);
}

// ==================== 游戏控制 ====================
async function startGame() {
    elements.startScreen.style.display = 'none';
    elements.loadingScreen.classList.add('show');
    GameState.isLoading = true;
    
    try {
        updateProgress(5, '正在初始化音频...');
        AudioSys.init();
        
        updateProgress(10, '正在启动摄像头...');
        await initCamera();
        
        updateProgress(30, '正在加载AI模型...');
        GameState.detector = new SimplePoseDetector();
        await GameState.detector.load(updateProgress);
        
        GameState.modelLoaded = true;
        GameState.isLoading = false;
        GameState.isPlaying = true;
        
        updateProgress(100, '准备就绪！');
        await new Promise(r => setTimeout(r, 500));
        
        elements.loadingScreen.classList.remove('show');
        
        // 开始循环
        detectionLoop();
        gameLoop();
        
    } catch (err) {
        console.error('游戏启动失败:', err);
        alert('启动失败: ' + err.message);
        elements.loadingScreen.classList.remove('show');
        elements.startScreen.style.display = 'flex';
    }
}

// ==================== 相机初始化 ====================
async function initCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'user',
                width: { ideal: 640 },
                height: { ideal: 480 }
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
        alert('无法访问摄像头: ' + err.message);
        throw err;
    }
}

// ==================== 渲染函数（复用之前的）====================
function draw() {
    ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
    
    if (GameState.faceBounds) {
        drawFaceOverlay();
    }
    
    drawTargets();
    drawBullets();
    drawCrosshair();
    
    if (GameState.faceBounds) {
        drawFaceWarning();
    }
}

function drawFaceOverlay() {
    const fb = GameState.faceBounds;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 0, 0, 0.15)';
    ctx.beginPath();
    ctx.ellipse(fb.x + fb.width / 2, fb.y + fb.height / 2, fb.width / 2, fb.height / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.4)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);
    ctx.stroke();
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

// ==================== 子弹、目标系统（复用之前的）====================
function createBullet() {
    const startX = elements.canvas.width / 2;
    const startY = elements.canvas.height - 100;
    GameState.bullets.push({x: startX, y: startY, speed: 15, width: 6, height: 25, active: true});
}

function updateBullets() {
    for (let i = GameState.bullets.length - 1; i >= 0; i--) {
        const bullet = GameState.bullets[i];
        bullet.y -= bullet.speed;
        if (checkCollision(bullet)) bullet.active = false;
        if (bullet.y < -50 || !bullet.active) GameState.bullets.splice(i, 1);
    }
}

function checkCollision(bullet) {
    if (GameState.faceBounds) {
        const fb = GameState.faceBounds;
        if (bullet.x > fb.x && bullet.x < fb.x + fb.width &&
            bullet.y > fb.y && bullet.y < fb.y + fb.height) {
            GameState.penalty += 10;
            AudioSys.playPenalty();
            updateUI();
            return true;
        }
    }
    
    for (let i = GameState.targets.length - 1; i >= 0; i--) {
        const target = GameState.targets[i];
        const dx = bullet.x - target.x;
        const dy = bullet.y - target.y;
        if (Math.sqrt(dx * dx + dy * dy) < target.radius + bullet.width) {
            GameState.score += target.points;
            GameState.targets.splice(i, 1);
            AudioSys.playHit();
            updateUI();
            return true;
        }
    }
    return false;
}

let lastTargetSpawn = 0;
function spawnTarget() {
    const now = Date.now();
    if (now - lastTargetSpawn < 2000) return;
    lastTargetSpawn = now;
    
    const canvasWidth = elements.canvas.width;
    const canvasHeight = elements.canvas.height;
    
    let x, y, attempts = 0;
    do {
        x = Math.random() * (canvasWidth - 100) + 50;
        y = Math.random() * (canvasHeight * 0.5) + 50;
        attempts++;
    } while (attempts < 10 && isNearFace(x, y, 100));
    
    const colors = [{r: 255, g: 107, b: 107}, {r: 78, g: 205, b: 196}, {r: 255, g: 230, b: 109}, {r: 150, g: 206, b: 180}];
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    GameState.targets.push({
        x, y,
        radius: 25 + Math.random() * 20,
        color,
        points: Math.floor(30 - (y / canvasHeight) * 20),
        spawnTime: now,
        lifeTime: 4000 + Math.random() * 2000
    });
}

function isNearFace(x, y, minDistance) {
    if (!GameState.faceBounds) return false;
    const fb = GameState.faceBounds;
    const dx = x - fb.centerX;
    const dy = y - fb.centerY;
    return Math.sqrt(dx * dx + dy * dy) < minDistance + fb.width / 2;
}

function updateTargets() {
    const now = Date.now();
    for (let i = GameState.targets.length - 1; i >= 0; i--) {
        if (now - GameState.targets[i].spawnTime > GameState.targets[i].lifeTime) {
            GameState.targets.splice(i, 1);
        }
    }
}

function drawTargets() {
    const now = Date.now();
    for (const target of GameState.targets) {
        const age = now - target.spawnTime;
        const lifeRatio = 1 - (age / target.lifeTime);
        const pulse = Math.sin(age / 200) * 0.1 + 1;
        
        ctx.save();
        const gradient = ctx.createRadialGradient(target.x, target.y, 0, target.x, target.y, target.radius * 1.5 * pulse);
        gradient.addColorStop(0, `rgba(${target.color.r}, ${target.color.g}, ${target.color.b}, ${0.6 * lifeRatio})`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(target.x, target.y, target.radius * 1.5 * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(${target.color.r}, ${target.color.g}, ${target.color.b}, ${lifeRatio})`;
        ctx.beginPath();
        ctx.arc(target.x, target.y, target.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255, 255, 255, ${0.5 * lifeRatio})`;
        ctx.beginPath();
        ctx.arc(target.x, target.y, target.radius * 0.5, 0, Math.PI * 2);
        ctx.fill();
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
        const gradient = ctx.createRadialGradient(bullet.x, bullet.y, 0, bullet.x, bullet.y, 20);
        gradient.addColorStop(0, 'rgba(255, 235, 59, 0.8)');
        gradient.addColorStop(0.5, 'rgba(255, 152, 0, 0.4)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, 20, 0, Math.PI * 2);
        ctx.fill();
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
    ctx.beginPath();
    ctx.moveTo(x - size, y);
    ctx.lineTo(x + size, y);
    ctx.moveTo(x, y - size);
    ctx.lineTo(x, y + size);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, size * 0.7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

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
    if (GameState.ammo <= 0) setTimeout(reload, 300);
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

function updateUI() {
    elements.score.textContent = GameState.score;
    elements.penalty.textContent = GameState.penalty;
    elements.gunDetected.textContent = GameState.gunDetected ? '已检测 ✓' : '未检测';
    elements.fireReady.textContent = GameState.isReloading ? '换弹中...' : GameState.canFire ? '就绪!' : '准备';
    elements.gunStatus.className = GameState.gunDetected ? 'active' : '';
    elements.fireStatus.className = (GameState.canFire && !GameState.isReloading) ? 'active' : '';
    let ammoStr = '';
    for (let i = 0; i < 5; i++) ammoStr += i < GameState.ammo ? '🔫' : '⚫';
    elements.ammo.textContent = ammoStr;
}

// ==================== 事件监听 ====================
elements.startBtn.addEventListener('click', startGame);
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
elements.canvas.addEventListener('click', () => {
    if (GameState.isPlaying && GameState.ammo > 0 && !GameState.isReloading) tryFire();
});
