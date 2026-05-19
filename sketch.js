let video;
let handLandmarks = null;
let playerCurrentGesture = '';
let finalPlayerGesture = ''; 
let computerGesture = '等待中...';
let resultMsg = '';
let gameState = 'IDLE'; 
let countdown = 3;
let lastTime = 0;
let swipeHistoryX = [];

// 特效全域變數
let particles = [];
let shakeIntensity = 0;

const CHOICES = ['rock', 'scissors', 'paper'];
const GESTURE_MAP = {
    'rock': '✊ 石頭',
    'scissors': '✌️ 剪刀',
    'paper': '🖐 布',
    'unknown': '未知'
};

const connections = [
    [0, 1], [1, 2], [2, 3], [3, 4], 
    [0, 5], [5, 6], [6, 7], [7, 8], 
    [5, 9], [9, 10], [10, 11], [11, 12], 
    [9, 13], [13, 14], [14, 15], [15, 16], 
    [13, 17], [0, 17], [17, 18], [18, 19], [19, 20] 
];

// 粒子特效類別
class Particle {
    constructor(x, y, colorType) {
        this.x = x;
        this.y = y;
        this.vx = random(-8, 8); // 水平噴射速度
        this.vy = random(-15, -5); // 垂直噴射速度
        this.size = random(8, 20);
        this.alpha = 255;
        this.colorType = colorType;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.5; // 地心引力，讓粒子往下掉
        this.alpha -= 4; // 慢慢變透明
    }

    show() {
        noStroke();
        if (this.colorType === 'win') {
            // 贏的特效：綠色與金色交錯
            fill(random(100, 200), random(200, 255), random(100, 150), this.alpha);
        } else if (this.colorType === 'lose') {
            // 輸的特效：紅色與橘色火花
            fill(random(200, 255), random(50, 100), random(50, 100), this.alpha);
        } else {
            // 平手：白色灰塵
            fill(200, 200, 220, this.alpha);
        }
        // 畫出粒子
        circle(this.x, this.y, this.size);
    }
}

function setup() {
    createCanvas(800, 600);
    
    video = createCapture(VIDEO);
    video.size(800, 600);
    video.hide(); 

    const hands = new Hands({locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }});
    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.8, 
        minTrackingConfidence: 0.8
    });
    
    hands.onResults((results) => {
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            handLandmarks = results.multiHandLandmarks[0];
        } else {
            handLandmarks = null;
        }
    });

    let isProcessing = false;
    async function processVideo() {
        if (video.elt.readyState >= 2 && !isProcessing) {
            isProcessing = true;
            await hands.send({image: video.elt});
            isProcessing = false;
        }
        requestAnimationFrame(processVideo);
    }
    processVideo();
}

function draw() {
    background(30);

    push(); // 開始畫布變換

    // --- 特效：螢幕震動 ---
    if (shakeIntensity > 0) {
        translate(random(-shakeIntensity, shakeIntensity), random(-shakeIntensity, shakeIntensity));
        shakeIntensity *= 0.9; // 震動慢慢衰減
        if (shakeIntensity < 0.5) shakeIntensity = 0;
    }

    // --- 1. 畫出鏡像攝影機畫面 ---
    push();
    translate(width, 0);
    scale(-1, 1); 
    if (video.loadedmetadata) {
        image(video, 0, 0, width, height);
    }

    // --- 2. 畫骨架與狀態機控制 ---
    if (handLandmarks) {
        drawSkeleton(handLandmarks);
        playerCurrentGesture = detectGesture(handLandmarks);
        
        if (gameState === 'IDLE') {
            gameState = 'COUNTING';
            countdown = 3;
            lastTime = millis();
            resultMsg = '';
            computerGesture = '等待中...';
            finalPlayerGesture = '';
            particles = []; // 清空上局粒子
        } else if (gameState === 'RESULT') {
            if (detectSwipe(handLandmarks)) {
                gameState = 'IDLE';
                finalPlayerGesture = '';
            }
        }
    } else {
        playerCurrentGesture = '';
    }
    pop(); 

    // --- 3. 倒數計時邏輯 ---
    if (gameState === 'COUNTING') {
        let currentTime = millis();
        if (currentTime - lastTime > 800) { 
            countdown--;
            lastTime = currentTime;
            if (countdown <= 0) {
                evaluateWinner();
            }
        }
    }

    // --- 4. 畫出 UI 介面與粒子特效 ---
    drawUI();
    
    // 渲染粒子
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        particles[i].show();
        if (particles[i].alpha <= 0) {
            particles.splice(i, 1); // 粒子消失後移除
        }
    }

    pop(); // 結束畫布變換
}

// 畫手部骨架 (新增發光特效)
function drawSkeleton(landmarks) {
    // 開啟發光特效
    drawingContext.shadowBlur = 15;
    drawingContext.shadowColor = '#89b4fa'; 

    strokeWeight(4);
    stroke(137, 180, 250); 
    for (let i = 0; i < connections.length; i++) {
        let p1 = landmarks[connections[i][0]];
        let p2 = landmarks[connections[i][1]];
        line(p1.x * width, p1.y * height, p2.x * width, p2.y * height);
    }

    drawingContext.shadowColor = '#f38ba8'; 
    noStroke();
    fill(243, 139, 168); 
    for (let i = 0; i < landmarks.length; i++) {
        let p = landmarks[i];
        circle(p.x * width, p.y * height, 12);
    }

    // 畫完骨架後關閉發光，避免影響其他 UI 文字
    drawingContext.shadowBlur = 0;
}

function getDistance(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

function detectGesture(landmarks) {
    const wrist = landmarks[0]; 

    const indexIsOpen = getDistance(landmarks[8], wrist) > getDistance(landmarks[6], wrist);
    const middleIsOpen = getDistance(landmarks[12], wrist) > getDistance(landmarks[10], wrist);
    const ringIsOpen = getDistance(landmarks[16], wrist) > getDistance(landmarks[14], wrist);
    const pinkyIsOpen = getDistance(landmarks[20], wrist) > getDistance(landmarks[18], wrist);

    let openCount = 0;
    if (indexIsOpen) openCount++;
    if (middleIsOpen) openCount++;
    if (ringIsOpen) openCount++;
    if (pinkyIsOpen) openCount++;

    const isScissors = indexIsOpen && middleIsOpen && !ringIsOpen && !pinkyIsOpen;

    if (openCount === 0) return 'rock';
    if (openCount >= 4) return 'paper';
    if (isScissors) return 'scissors';
    
    return 'unknown'; 
}

function detectSwipe(landmarks) {
    const wristX = landmarks[0].x; 
    swipeHistoryX.push(wristX);
    
    if (swipeHistoryX.length > 20) swipeHistoryX.shift(); 

    if (swipeHistoryX.length === 20) {
        const maxX = Math.max(...swipeHistoryX);
        const minX = Math.min(...swipeHistoryX);
        if (maxX - minX > 0.35) { 
            swipeHistoryX = []; 
            return true;
        }
    }
    return false;
}

// 判定勝負並觸發特效
function evaluateWinner() {
    if (playerCurrentGesture === 'unknown' || playerCurrentGesture === '') {
        resultMsg = '沒看清楚，揮手重來！';
        gameState = 'RESULT';
        return;
    }

    finalPlayerGesture = playerCurrentGesture;
    let compChoice = CHOICES[Math.floor(Math.random() * CHOICES.length)];
    computerGesture = GESTURE_MAP[compChoice];

    particles = []; // 準備發射新粒子

    if (finalPlayerGesture === compChoice) {
        resultMsg = '🤝 平手！';
        for(let i=0; i<30; i++) particles.push(new Particle(width/2, height/2 + 50, 'draw'));
    } else if (
        (finalPlayerGesture === 'rock' && compChoice === 'scissors') ||
        (finalPlayerGesture === 'scissors' && compChoice === 'paper') ||
        (finalPlayerGesture === 'paper' && compChoice === 'rock')
    ) {
        resultMsg = '🎉 你贏了！';
        // 贏了：噴射 100 顆彩色粒子
        for(let i=0; i<100; i++) particles.push(new Particle(width/2, height/2 + 50, 'win'));
    } else {
        resultMsg = '💀 你輸了！';
        // 輸了：強烈螢幕震動 + 噴射紅色火花
        shakeIntensity = 25; 
        for(let i=0; i<60; i++) particles.push(new Particle(width/2, height/2 + 50, 'lose'));
    }

    gameState = 'RESULT';
}

function drawUI() {
    textAlign(CENTER, CENTER);
    textFont('sans-serif');

    // 上方資訊列 
    fill(0, 0, 0, 180);
    noStroke();
    rectMode(CENTER);
    rect(width / 2, 60, 500, 60, 30);
    fill(255);
    textSize(22);
    
    if (gameState === 'RESULT' && finalPlayerGesture !== '') {
        text(`你出：${GESTURE_MAP[finalPlayerGesture]}   VS   電腦出：${computerGesture}`, width / 2, 60);
    } else {
        let currentUI = GESTURE_MAP[playerCurrentGesture] || '沒看到手';
        text(`目前 AI 判定你：${currentUI}`, width / 2, 60);
    }

    // 畫面中央：倒數計時 or 結果
    if (gameState === 'COUNTING') {
        textSize(150);
        // 倒數時也有微微的發光感
        drawingContext.shadowBlur = 20;
        drawingContext.shadowColor = '#f9e2af';
        fill(249, 226, 175);
        text(countdown, width / 2, height / 2);
        drawingContext.shadowBlur = 0;
    } else if (gameState === 'RESULT') {
        textSize(80);
        drawingContext.shadowBlur = 20;

        if (resultMsg.includes('贏')) {
            fill(166, 227, 161);
            drawingContext.shadowColor = '#a6e3a1';
        } else if (resultMsg.includes('輸')) {
            fill(243, 139, 168);
            drawingContext.shadowColor = '#f38ba8';
        } else {
            fill(205, 214, 244);
            drawingContext.shadowColor = '#cdd6f4';
        }

        let scaleEffect = 1 + sin(millis() / 150) * 0.1;
        push();
        translate(width / 2, height / 2);
        scale(scaleEffect);
        text(resultMsg, 0, 0);
        pop();
        drawingContext.shadowBlur = 0;
    }

    // 底部：提示文字
    fill(0, 0, 0, 150);
    rect(width / 2, height - 40, 400, 40, 20);
    fill(255);
    textSize(18);
    if (!handLandmarks && gameState === 'IDLE') {
        text('請將手放入畫面中以開始遊戲', width / 2, height - 40);
    } else if (gameState === 'COUNTING') {
        text('準備出拳！', width / 2, height - 40);
    } else if (gameState === 'RESULT') {
        text('👈 左右揮動手掌以進行下一局', width / 2, height - 40);
    }
}