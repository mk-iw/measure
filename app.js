let currentNo = 1; let tankId = "1"; let mmRatio = 0.400; 
let isHolding = false; let activePoint = null;
let cvReady = false;

// ライブラリ読み込み完了通知
function onOpenCvReady() {
    cvReady = true;
    document.getElementById('status').innerText = "Library: OK / Voice: Waiting...";
}

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
    } catch (e) { alert("カメラエラー"); }
    initTouchEvents();
    // 画面タップ時に音声認識を開始（ブラウザのセキュリティ制限対策）
    window.addEventListener('click', initVoiceRecognition, { once: true });
};

// --- 音声認識 (確実な起動) ---
function initVoiceRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.continuous = true;
    
    recognition.onstart = () => {
        document.getElementById('status').innerText = `Library: ${cvReady?'OK':'Wait'} / Voice: ON`;
    };

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
    recognition.onend = () => recognition.start();
    recognition.start();
}

// --- ArUco 350mm検知 ---
function detectArUcoAndCalibrate() {
    if (!cvReady) {
        console.warn("OpenCV未準備");
        return;
    }
    try {
        let src = cv.imread(lastCapturedFrame);
        let dst = new cv.Mat();
        cv.cvtColor(src, dst, cv.COLOR_RGBA2RGB, 0);

        let markerIds = new cv.Mat();
        let markerCorners = new cv.MatVector();
        let dictionary = cv.getPredefinedDictionary(cv.DICT_4X4_50);
        let parameter = new cv.DetectorParameters();

        cv.detectMarkers(dst, dictionary, markerCorners, markerIds, parameter);

        if (markerIds.rows >= 2) {
            let p1 = markerCorners.get(0).data32F;
            let p2 = markerCorners.get(1).data32F;
            // 各中心点
            let c1x = (p1[0]+p1[2]+p1[4]+p1[6])/4; let c1y = (p1[1]+p1[3]+p1[5]+p1[7])/4;
            let c2x = (p2[0]+p2[2]+p2[4]+p2[6])/4; let c2y = (p2[1]+p2[3]+p2[5]+p2[7])/4;
            
            const pixelDist = Math.hypot(c1x - c2x, c1y - c2y);
            mmRatio = 350 / pixelDist; // 350mm基準
        }
        src.delete(); dst.delete(); markerIds.delete(); markerCorners.delete();
    } catch (e) { console.error("ArUcoエラー:", e); }
}

function toggleHold(state) {
    isHolding = state;
    if (state) {
        lctx.drawImage(video, 0, 0, 1920, 1080);
        setTimeout(() => {
            detectArUcoAndCalibrate();
            asyncDetect();
        }, 150);
    }
    
    document.getElementById('btn-ratio').style.display = !isHolding ? 'block' : 'none';
    document.getElementById('btn-hold').style.display = !isHolding ? 'block' : 'none';
    document.getElementById('btn-cancel').style.display = isHolding ? 'block' : 'none';
    document.getElementById('btn-save').style.display = isHolding ? 'block' : 'none';
}

// 魚体検出（尾先5%）
async function asyncDetect() {
    const sw = 480, sh = 270;
    offscreen.width = sw; offscreen.height = sh;
    octx.drawImage(lastCapturedFrame, 0, 0, sw, sh);
    const data = octx.getImageData(0, 0, sw, sh).data;
    const scanY = 540 * (sh / 1080); 
    let allMinX = sw, allMaxX = 0;

    for (let x = 10; x < sw - 10; x++) {
        const i = (Math.floor(scanY) * sw + x) * 4;
        const prevI = (Math.floor(scanY) * sw + (x - 4)) * 4;
        if (Math.abs(data[i] - data[prevI]) > 20) {
            if (x < allMinX) allMinX = x;
            if (x > allMaxX) allMaxX = x;
        }
    }

    if (allMaxX > allMinX) {
        const scale = 1920 / sw;
        points.p1.x = allMinX * scale;
        points.p2.x = allMaxX * scale; 
        points.p1.y = points.p2.y = 540;
        const fishLen = points.p2.x - points.p1.x;
        points.p3.x = points.p2.x + (fishLen * 0.05); // 尾先5%
        points.p3.y = 540 + (fishLen * 0.08); 
    }
}

function renderLoop() { render(); requestAnimationFrame(renderLoop); }

function render() {
    const stageW = window.innerWidth * window.devicePixelRatio;
    const stageH = window.innerHeight * window.devicePixelRatio;
    canvas.width = stageW; canvas.height = stageH;
    const scale = Math.min(stageW / 1920, stageH / 1080);
    const ox = (stageW - 1920 * scale) / 2;
    const oy = (stageH - 1080 * scale) / 2;

    ctx.fillStyle = "black"; ctx.fillRect(0, 0, stageW, stageH);
    ctx.drawImage(isHolding ? lastCapturedFrame : video, ox, oy, 1920 * scale, 1080 * scale);

    if (!isHolding) {
        ctx.fillStyle = "rgba(0, 255, 0, 0.2)";
        ctx.fillRect(ox, oy + (540 * scale) - (30 * scale), 1920 * scale, 60 * scale);
    }
    
    // UI表示
    const forkPx = Math.hypot(points.p2.x - points.p1.x, points.p2.y - points.p1.y);
    const totalPx = Math.hypot(points.p3.x - points.p1.x, points.p3.y - points.p1.y);
    const fSize = canvas.height / 25;
    drawStyledText(`水槽${tankId} No.${String(currentNo).padStart(3, '0')} 尾叉:${(forkPx * mmRatio).toFixed(1)}mm 全長:${(totalPx * mmRatio).toFixed(1)}mm`, 20, 80, fSize);
    drawStyledText(`Ratio: ${mmRatio.toFixed(4)} (ArUco 350mm Mode)`, 20, 120, fSize * 0.5);

    Object.values(points).forEach(p => {
        ctx.strokeStyle = "red"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(ox + p.x * scale, oy + p.y * scale, 15, 0, Math.PI*2); ctx.stroke();
    });
}

function drawStyledText(t, x, y, s) {
    ctx.font = `bold ${s}px sans-serif`; ctx.strokeStyle = "white"; ctx.lineWidth = 3;
    ctx.strokeText(t, x, y); ctx.fillStyle = "black"; ctx.fillText(t, x, y);
}

function finalizeAndSave() {
    const link = document.createElement('a');
    link.href = canvas.toDataURL("image/png");
    link.download = `水槽${tankId}_No${String(currentNo).padStart(3, '0')}.png`;
    link.click();
    currentNo++; toggleHold(false);
}

function initTouchEvents() {
    const getPos = (e) => {
        const r = canvas.getBoundingClientRect();
        const scale = Math.min(canvas.width / 1920, canvas.height / 1080);
        const ox = (canvas.width - 1920 * scale) / 2;
        const oy = (canvas.height - 1080 * scale) / 2;
        return { 
            x: ((e.touches[0].clientX - r.left) * (canvas.width / r.width) - ox) / scale, 
            y: ((e.touches[0].clientY - r.top) * (canvas.height / r.height) - oy) / scale 
        };
    };
    canvas.addEventListener('touchstart', (e) => {
        if(!isHolding) return;
        const pos = getPos(e);
        activePoint = Object.values(points).find(p => Math.hypot(p.x - pos.x, p.y - pos.y) < 100);
    });
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
    const val = prompt("1pxあたりのmm数を入力", mmRatio);
    if (val !== null && !isNaN(val)) mmRatio = parseFloat(val);
}