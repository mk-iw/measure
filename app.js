let currentNo = 1; let tankId = "1"; let mmRatio = 0.400; 
let isHolding = false; let activePoint = null;

const lastCapturedFrame = document.createElement('canvas');
lastCapturedFrame.width = 1920; lastCapturedFrame.height = 1080;
const lctx = lastCapturedFrame.getContext('2d', { alpha: false });

const offscreen = document.createElement('canvas');
const octx = offscreen.getContext('2d', { willReadFrequently: true });

let points = {
    p1: {x: 400, y: 540, label: "口先"},
    p2: {x: 900, y: 540, label: "尾叉"},
    p3: {x: 1000, y: 640, label: "尾先"}
};

const video = document.getElementById('video');
const canvas = document.getElementById('canvas-measure');
const ctx = canvas.getContext('2d');

window.onload = async () => {
    tankId = prompt("水槽番号", "1") || "1";
    currentNo = parseInt(prompt("開始No.", "001")) || 1;
    try {
        const s = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment", width: {ideal: 1920}, height: {ideal: 1080} }
        });
        video.srcObject = s;
        video.play();
        renderLoop();
        initVoiceRecognition(); // 音声認識開始
    } catch (e) { alert("カメラエラー"); }
    initTouchEvents();
};

// --- 音声認識機能 ---
function initVoiceRecognition() {
    window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
        const result = event.results[event.results.length - 1][0].transcript;
        if (result.includes("ホールド") || result.includes("ストップ")) {
            if (!isHolding) toggleHold(true);
        } else if (result.includes("保存")) {
            if (isHolding) finalizeAndSave();
        } else if (result.includes("キャンセル") || result.includes("リセット")) {
            if (isHolding) toggleHold(false);
        }
    };
    recognition.onend = () => recognition.start(); // 止まったら再開
    recognition.start();
}

// --- ArUco検知による倍率計算 (簡易版ロジック) ---
function calibrateWithArUco(detectedMarkers) {
    if (detectedMarkers.length === 2) {
        const m1 = detectedMarkers[0].center;
        const m2 = detectedMarkers[1].center;
        const pixelDist = Math.hypot(m1.x - m2.x, m1.y - m2.y);
        if (pixelDist > 100) {
            mmRatio = 350 / pixelDist; // 350mm固定で計算
        }
    }
}

function toggleHold(state) {
    isHolding = state;
    if (state) {
        lctx.drawImage(video, 0, 0, 1920, 1080);
        requestAnimationFrame(() => {
            setTimeout(() => { asyncDetect(); }, 100);
        });
    }
    
    const updateBtn = (id, show) => {
        const el = document.getElementById(id);
        if (el) el.style.setProperty('display', show ? 'block' : 'none', 'important');
    };
    
    updateBtn('btn-ratio', !isHolding);
    updateBtn('btn-hold', !isHolding);
    updateBtn('btn-cancel', isHolding);
    updateBtn('btn-save', isHolding);
}

// 自動検出ロジック (検出感度・尾先位置5%を維持)
async function asyncDetect() {
    const sw = 480, sh = 270;
    offscreen.width = sw; offscreen.height = sh;
    octx.drawImage(lastCapturedFrame, 0, 0, sw, sh);
    const imgData = octx.getImageData(0, 0, sw, sh);
    const data = imgData.data;

    const scanY = 540 * (sh / 1080); 
    const scanLines = [scanY - 12, scanY, scanY + 12];
    let allMinX = sw, allMaxX = 0, validY = [];

    scanLines.forEach(y => {
        let lineMinX = sw, lineMaxX = 0;
        const row = Math.floor(y);
        if (row < 0 || row >= sh) return;
        for (let x = 10; x < sw - 10; x += 1) {
            const i = (row * sw + x) * 4;
            const prevI = (row * sw + (x - 4)) * 4;
            const gray = data[i] * 0.3 + data[i+1] * 0.59 + data[i+2] * 0.11;
            const prevGray = data[prevI] * 0.3 + data[prevI+1] * 0.59 + data[prevI+2] * 0.11;
            if (Math.abs(gray - prevGray) > 20) {
                if (x < lineMinX) lineMinX = x;
                if (x > lineMaxX) lineMaxX = x;
            }
        }
        if (lineMaxX - lineMinX > 50) {
            if (lineMinX < allMinX) allMinX = lineMinX;
            if (lineMaxX > allMaxX) allMaxX = lineMaxX;
            validY.push(y);
        }
    });

    if (validY.length > 0) {
        const scale = 1920 / sw;
        points.p1.x = allMinX * scale;
        points.p2.x = allMaxX * scale; 
        points.p1.y = points.p2.y = 540;

        const fishLen = points.p2.x - points.p1.x;
        points.p3.x = points.p2.x + (fishLen * 0.05); // 尾先5%
        points.p3.y = 540 + (fishLen * 0.08); 
    }
}

function renderLoop() {
    render();
    requestAnimationFrame(renderLoop);
}

function render() {
    const stageW = window.innerWidth * window.devicePixelRatio;
    const stageH = window.innerHeight * window.devicePixelRatio;
    if (canvas.width !== stageW || canvas.height !== stageH) {
        canvas.width = stageW; canvas.height = stageH;
    }
    const scale = Math.min(stageW / 1920, stageH / 1080);
    const ox = (stageW - 1920 * scale) / 2;
    const oy = (stageH - 1080 * scale) / 2;

    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, stageW, stageH);

    const imgSource = (isHolding) ? lastCapturedFrame : video;
    ctx.drawImage(imgSource, ox, oy, 1920 * scale, 1080 * scale);

    if (!isHolding) {
        ctx.fillStyle = "rgba(0, 255, 0, 0.2)";
        const guideY = oy + (540 * scale) - (30 * scale);
        ctx.fillRect(ox, guideY, 1920 * scale, 60 * scale);
    }

    drawOverlay(ox, oy, scale);
    if (activePoint && isHolding) drawMagnifier(ox, oy, scale, imgSource);
}

function drawOverlay(ox, oy, scale) {
    const forkPx = Math.hypot(points.p2.x - points.p1.x, points.p2.y - points.p1.y);
    const totalPx = Math.hypot(points.p3.x - points.p1.x, points.p3.y - points.p1.y);
    const fSize = canvas.height / 25;
    
    drawStyledText(`水槽${tankId} No.${String(currentNo).padStart(3, '0')} 尾叉:${(forkPx * mmRatio).toFixed(1)}mm 全長:${(totalPx * mmRatio).toFixed(1)}mm`, 20, 80, fSize);
    drawStyledText(`Scale: ${mmRatio.toFixed(4)} mm/px`, 20, 130, fSize * 0.6);

    Object.values(points).forEach(p => {
        const px = ox + p.x * scale; const py = oy + p.y * scale;
        ctx.strokeStyle = "red"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(px, py, 15, 0, Math.PI*2); ctx.stroke();
        drawStyledText(p.label, px + 15, py - 15, fSize * 0.4);
    });
}

function drawMagnifier(ox, oy, scale, sourceImg) {
    const mag = 3;
    const winW = 450, winH = 250;
    const tx = (canvas.width - winW) / 2, ty = 120;
    ctx.save();
    ctx.strokeStyle = "yellow"; ctx.lineWidth = 4;
    ctx.strokeRect(tx, ty, winW, winH);
    ctx.beginPath(); ctx.rect(tx, ty, winW, winH); ctx.clip();
    const srcX = activePoint.x - (winW / mag) / 2 / scale;
    const srcY = activePoint.y - (winH / mag) / 2 / scale;
    ctx.drawImage(sourceImg, srcX, srcY, (winW/mag)/scale, (winH/mag)/scale, tx, ty, winW, winH);
    ctx.restore();
}

function drawStyledText(t, x, y, s) {
    ctx.font = `bold ${s}px sans-serif`;
    ctx.strokeStyle = "white"; ctx.lineWidth = 3; ctx.strokeText(t, x, y);
    ctx.fillStyle = "black"; ctx.fillText(t, x, y);
}

function finalizeAndSave() {
    const link = document.createElement('a');
    link.href = canvas.toDataURL("image/png");
    link.download = `水槽${tankId}_No${String(currentNo).padStart(3, '0')}.png`;
    link.click();
    currentNo++;
    toggleHold(false);
}

function initTouchEvents() {
    const getPos = (e) => {
        const r = canvas.getBoundingClientRect();
        const touchX = (e.touches[0].clientX - r.left) * (canvas.width / r.width);
        const touchY = (e.touches[0].clientY - r.top) * (canvas.height / r.height);
        const scale = Math.min(canvas.width / 1920, canvas.height / 1080);
        const ox = (canvas.width - 1920 * scale) / 2;
        const oy = (canvas.height - 1080 * scale) / 2;
        return { x: (touchX - ox) / scale, y: (touchY - oy) / scale };
    };
    canvas.addEventListener('touchstart', (e) => {
        if(!isHolding) return;
        const pos = getPos(e);
        activePoint = null;
        let minDist = 120;
        for (const key in points) {
            const p = points[key];
            const d = Math.hypot(p.x - pos.x, p.y - pos.y);
            if (d < minDist) { minDist = d; activePoint = p; }
        }
    }, {passive: false});
    canvas.addEventListener('touchmove', (e) => {
        if(activePoint) {
            const pos = getPos(e);
            activePoint.x = Math.max(0, Math.min(1920, pos.x));
            activePoint.y = Math.max(0, Math.min(1080, pos.y));
            e.preventDefault();
        }
    }, {passive: false});
    canvas.addEventListener('touchend', () => activePoint = null);
}

function toggleRatioUI() {
    const val = prompt("1pxあたりのmm数を入力(またはArUcoを使用)", mmRatio);
    if (val !== null && !isNaN(val)) mmRatio = parseFloat(val);
}