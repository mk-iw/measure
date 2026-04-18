let currentNo = 1; let tankId = "1"; let mmRatio = 0.400;
let isHolding = false; let activePoint = null;

// メモリ固定
const lastCapturedFrame = document.createElement('canvas');
lastCapturedFrame.width = 1920; lastCapturedFrame.height = 1080;
const lctx = lastCapturedFrame.getContext('2d', { alpha: false });

const offscreen = document.createElement('canvas');
const octx = offscreen.getContext('2d', { willReadFrequently: true });

let points = {
    p1: {x: 400, y: 500, label: "口先"},
    p2: {x: 900, y: 500, label: "尾叉"},
    p3: {x: 1200, y: 500, label: "尾先"}
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
};

function toggleHold(state) {
    isHolding = state;
    if (state) {
        lctx.drawImage(video, 0, 0, 1920, 1080);
        // iOSの衝突を避けるため、しっかり待機してから実行
        setTimeout(() => { asyncDetect(); }, 200); 
    }
    // ボタン表示切り替え
    const btns = { 'btn-hold': !isHolding, 'btn-ratio': !isHolding, 'btn-save': isHolding, 'btn-cancel': isHolding };
    for (let id in btns) {
        const el = document.getElementById(id);
        if (el) el.style.display = btns[id] ? 'block' : 'none';
    }
}

// 精度向上：非同期処理でブラウザのハングを防ぐ
async function asyncDetect() {
    const sw = 480, sh = 270;
    offscreen.width = sw; offscreen.height = sh;
    octx.drawImage(lastCapturedFrame, 0, 0, sw, sh);
    
    // データの読み出しを待機
    const imgData = await new Promise(r => setTimeout(() => r(octx.getImageData(0, 0, sw, sh)), 0));
    const data = imgData.data;

    const centerY = (points.p1.y + points.p3.y) / 2 * (sh / 1080);
    const scanLines = [centerY-15, centerY, centerY+15];
    let allMinX = sw, allMaxX = 0, validY = [];

    scanLines.forEach(y => {
        let lineMinX = sw, lineMaxX = 0;
        const row = Math.floor(y);
        for (let x = 15; x < sw - 15; x += 1) { // 1px刻みで精度アップ
            const i = (row * sw + x) * 4;
            const prevI = (row * sw + (x - 5)) * 4;
            // 輝度差（グレースケール変換した値の差）で見ることで白飛びに強くする
            const gray = data[i] * 0.3 + data[i+1] * 0.59 + data[i+2] * 0.11;
            const prevGray = data[prevI] * 0.3 + data[prevI+1] * 0.59 + data[prevI+2] * 0.11;
            
            if (Math.abs(gray - prevGray) > 20) {
                if (x < lineMinX) lineMinX = x;
                if (x > lineMaxX) lineMaxX = x;
            }
        }
        if (lineMaxX - lineMinX > 60) {
            if (lineMinX < allMinX) allMinX = lineMinX;
            if (lineMaxX > allMaxX) allMaxX = lineMaxX;
            validY.push(y);
        }
    });

    if (validY.length > 0) {
        const scale = 1920 / sw;
        points.p1.x = allMinX * scale; points.p3.x = allMaxX * scale;
        points.p1.y = points.p2.y = points.p3.y = (validY.reduce((a,b)=>a+b)/validY.length) * (1080/sh);
        points.p2.x = points.p3.x - (points.p3.x - points.p1.x) * 0.08;
    }
    offscreen.width = 1; // 解放
}

function renderLoop() {
    render();
    requestAnimationFrame(renderLoop);
}

function render() {
    const stageW = window.innerWidth * window.devicePixelRatio;
    const stageH = window.innerHeight * window.devicePixelRatio;
    if (canvas.width !== stageW) canvas.width = stageW;
    if (canvas.height !== stageH) canvas.height = stageH;

    const scale = Math.min(stageW / 1920, stageH / 1080);
    const ox = (stageW - 1920 * scale) / 2;
    const oy = (stageH - 1080 * scale) / 2;

    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, stageW, stageH);

    const imgSource = (isHolding) ? lastCapturedFrame : video;
    ctx.drawImage(imgSource, ox, oy, 1920 * scale, 1080 * scale);

    // オーバーレイ描画（赤丸透過、ラベル小）
    const forkPx = Math.hypot(points.p2.x - points.p1.x, points.p2.y - points.p1.y);
    const totalPx = Math.hypot(points.p3.x - points.p1.x, points.p3.y - points.p1.y);
    const fSize = canvas.height / 25;
    
    drawStyledText(`水槽${tankId} No.${String(currentNo).padStart(3, '0')} 尾叉:${(forkPx * mmRatio).toFixed(1)}mm 全長:${(totalPx * mmRatio).toFixed(1)}mm`, 20, 80, fSize);

    Object.values(points).forEach(p => {
        const px = ox + p.x * scale; const py = oy + p.y * scale;
        ctx.strokeStyle = "red"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(px, py, 15, 0, Math.PI*2); ctx.stroke();
        drawStyledText(p.label, px + 15, py - 15, fSize * 0.4);
    });

    if (activePoint && isHolding) {
        const size = 250, mag = 3;
        const tx = canvas.width/2 - size/2, ty = 150;
        ctx.save();
        ctx.strokeStyle = "yellow"; ctx.lineWidth = 4;
        ctx.strokeRect(tx, ty, size, size);
        ctx.beginPath(); ctx.rect(tx, ty, size, size); ctx.clip();
        ctx.drawImage(imgSource, activePoint.x - (size/mag)/2/scale, activePoint.y - (size/mag)/2/scale, (size/mag)/scale, (size/mag)/scale, tx, ty, size, size);
        ctx.restore();
    }
}

function drawStyledText(t, x, y, s) {
    ctx.font = `bold ${s}px sans-serif`;
    ctx.strokeStyle = "white"; ctx.lineWidth = 3; ctx.strokeText(t, x, y);
    ctx.fillStyle = "black"; ctx.fillText(t, x, y);
}

// 保存
function finalizeAndSave() {
    const link = document.createElement('a');
    link.href = canvas.toDataURL("image/png");
    link.download = `水槽${tankId}_No${String(currentNo).padStart(3, '0')}.png`;
    link.click();
    link.href = ""; // メモリ解放
    currentNo++;
    toggleHold(false);
}

function initTouchEvents() {
    const getPos = (e) => {
        const r = canvas.getBoundingClientRect();
        const stageW = r.width * window.devicePixelRatio, stageH = r.height * window.devicePixelRatio;
        const scale = Math.min(stageW / 1920, stageH / 1080);
        const ox = (stageW - 1920 * scale) / 2, oy = (stageH - 1080 * scale) / 2;
        const t = e.touches[0];
        const tx = (t.clientX - r.left) * window.devicePixelRatio, ty = (t.clientY - r.top) * window.devicePixelRatio;
        return { x: (tx - ox) / scale, y: (ty - oy) / scale };
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