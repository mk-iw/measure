let currentNo = 1; let tankId = "1"; let mmRatio = 0.400;
let isHolding = false; 
let activePoint = null;

// メモリ固定: 起動時に一度だけ作成し、再生成によるリークを防ぐ
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
        render();
    } catch (e) { alert("カメラエラー"); }
    initTouchEvents();
};

function toggleRatioUI() {
    const ui = document.getElementById('ratio-container');
    if (ui) ui.style.display = (ui.style.display === 'block') ? 'none' : 'block';
}

function updateRatio(val) {
    mmRatio = parseFloat(val);
    const display = document.getElementById('ratio-val');
    if (display) display.textContent = mmRatio.toFixed(3);
}

function toggleHold(state) {
    isHolding = state;
    if (state) {
        // 既存のCanvasを再利用（新規作成しない）
        lctx.drawImage(video, 0, 0, 1920, 1080);
        // 描画と計算の衝突を避けるため微小なディレイ
        setTimeout(() => { detectFishFast(); }, 100); 
    }
    
    document.getElementById('btn-hold').style.display = isHolding ? 'none' : 'block';
    document.getElementById('btn-ratio').style.display = isHolding ? 'none' : 'block';
    document.getElementById('btn-save').style.display = isHolding ? 'block' : 'none';
    document.getElementById('btn-cancel').style.display = isHolding ? 'block' : 'none';
}

function detectFishFast() {
    const sw = 480, sh = 270;
    offscreen.width = sw; offscreen.height = sh;
    octx.drawImage(lastCapturedFrame, 0, 0, sw, sh);
    const imgData = octx.getImageData(0, 0, sw, sh);
    const data = imgData.data;

    const centerY = (points.p1.y + points.p3.y) / 2 * (sh / 1080);
    const scanLines = [centerY-12, centerY, centerY+12];
    let allMinX = sw, allMaxX = 0, validY = [];

    scanLines.forEach(y => {
        let lineMinX = sw, lineMaxX = 0;
        const row = Math.floor(y);
        if (row < 0 || row >= sh) return;
        for (let x = 10; x < sw - 10; x += 2) {
            const i = (row * sw + x) * 4;
            const prevI = (row * sw + (x - 6)) * 4; // 差分幅を少し広げて感度向上
            if (prevI >= 0 && Math.abs(data[i] - data[prevI]) > 25) {
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
    // メモリ解放のヒント
    offscreen.width = 1; 
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

    drawOverlay(ox, oy, scale);
    if (activePoint && isHolding) drawMagnifier(ox, oy, scale, imgSource);
    requestAnimationFrame(render);
}

function drawOverlay(ox, oy, scale) {
    const forkPx = Math.hypot(points.p2.x - points.p1.x, points.p2.y - points.p1.y);
    const totalPx = Math.hypot(points.p3.x - points.p1.x, points.p3.y - points.p1.y);
    const res = { fork: (forkPx * mmRatio).toFixed(1), total: (totalPx * mmRatio).toFixed(1) };
    const fSize = canvas.height / 25;
    
    drawStyledText(`水槽${tankId} No.${String(currentNo).padStart(3, '0')} 尾叉:${res.fork}mm 全長:${res.total}mm`, 20, 80, fSize);

    Object.values(points).forEach(p => {
        const px = ox + p.x * scale; const py = oy + p.y * scale;
        ctx.strokeStyle = "red"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(px, py, 15, 0, Math.PI*2); ctx.stroke();
        drawStyledText(p.label, px + 15, py - 15, fSize * 0.4);
    });
}

function finalizeAndSave() {
    const link = document.createElement('a');
    const data = canvas.toDataURL("image/png");
    link.href = data;
    link.download = `水槽${tankId}_No${String(currentNo).padStart(3, '0')}.png`;
    link.click();
    
    // 参照を切り、ガベージコレクションを促す
    link.href = "";
    currentNo++;
    toggleHold(false);
}

function drawMagnifier(ox, oy, scale, sourceImg) {
    const size = 250, mag = 3;
    const px = ox + activePoint.x * scale;
    const py = oy + activePoint.y * scale;
    const tx = canvas.width/2 - size/2, ty = 150;
    
    ctx.save();
    ctx.strokeStyle = "yellow"; ctx.lineWidth = 4;
    ctx.strokeRect(tx, ty, size, size);
    ctx.beginPath(); ctx.rect(tx, ty, size, size); ctx.clip();
    
    const srcX = activePoint.x - (size/mag)/2/scale;
    const srcY = activePoint.y - (size/mag)/2/scale;
    const srcSize = (size/mag)/scale;
    
    ctx.drawImage(sourceImg, srcX, srcY, srcSize, srcSize, tx, ty, size, size);
    ctx.restore();
}

function drawStyledText(t, x, y, s) {
    ctx.font = `bold ${s}px sans-serif`;
    ctx.strokeStyle = "white"; ctx.lineWidth = 3; ctx.strokeText(t, x, y);
    ctx.fillStyle = "black"; ctx.fillText(t, x, y);
}

function initTouchEvents() {
    const getPos = (e) => {
        const r = canvas.getBoundingClientRect();
        const stageW = r.width * window.devicePixelRatio;
        const stageH = r.height * window.devicePixelRatio;
        const scale = Math.min(stageW / 1920, stageH / 1080);
        const ox = (stageW - 1920 * scale) / 2;
        const oy = (stageH - 1080 * scale) / 2;
        const t = e.touches[0];
        const tx = (t.clientX - r.left) * window.devicePixelRatio;
        const ty = (t.clientY - r.top) * window.devicePixelRatio;
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