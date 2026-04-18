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
    p3: {x: 1200, y: 640, label: "尾先"}
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
        setTimeout(() => { asyncDetect(); }, 150); 
    }
    const btns = { 'btn-hold': !isHolding, 'btn-ratio': !isHolding, 'btn-save': isHolding, 'btn-cancel': isHolding };
    for (let id in btns) {
        const el = document.getElementById(id);
        if (el) el.style.display = btns[id] ? 'block' : 'none';
    }
}

async function asyncDetect() {
    const sw = 480, sh = 270;
    offscreen.width = sw; offscreen.height = sh;
    octx.drawImage(lastCapturedFrame, 0, 0, sw, sh);
    const imgData = await new Promise(r => setTimeout(() => r(octx.getImageData(0, 0, sw, sh)), 0));
    const data = imgData.data;

    let baseY = (points.p1.y + points.p2.y) / 2;
    if (Math.abs(baseY - 540) > 216) { baseY = 540; } 

    const scanY = baseY * (sh / 1080);
    const scanLines = [scanY - 10, scanY, scanY + 10];
    let allMinX = sw, allMaxX = 0, validY = [];

    scanLines.forEach(y => {
        let lineMinX = sw, lineMaxX = 0;
        const row = Math.floor(y);
        if (row < 0 || row >= sh) return;
        for (let x = 15; x < sw - 15; x += 1) {
            const i = (row * sw + x) * 4;
            const prevI = (row * sw + (x - 5)) * 4;
            const gray = data[i] * 0.3 + data[i+1] * 0.59 + data[i+2] * 0.11;
            const prevGray = data[prevI] * 0.3 + data[prevI+1] * 0.59 + data[prevI+2] * 0.11;
            if (Math.abs(gray - prevGray) > 25) {
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
        const detectedY = (validY.reduce((a,b)=>a+b)/validY.length) * (1080/sh);
        const finalY = Math.max(324, Math.min(756, detectedY));

        points.p1.x = allMinX * scale;
        points.p2.x = allMaxX * scale;
        points.p1.y = points.p2.y = finalY;

        const fishLen = points.p2.x - points.p1.x;
        points.p3.x = points.p2.x + (fishLen * 0.08); 
        points.p3.y = finalY + (fishLen * 0.1); 
    }
    offscreen.width = 1;
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
        ctx.fillStyle = "rgba(0, 255, 0, 0.15)";
        const guideY = oy + (points.p1.y * scale) - (30 * scale);
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
    
    const fSize = canvas.height / 25;
    const centerX = tx + winW / 2;
    const centerY = ty + winH / 2;
    ctx.strokeStyle = "red"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(centerX, centerY, 15 * mag * 0.5, 0, Math.PI * 2); ctx.stroke();
    drawStyledText(activePoint.label, centerX + 30, centerY - 30, fSize * 0.6);
    
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
    link.href = "";
    currentNo++;
    toggleHold(false);
}

function initTouchEvents() {
    const getPos = (e) => {
        const r = canvas.getBoundingClientRect();
        const tx = (e.touches[0].clientX - r.left) * (canvas.width / r.width);
        const ty = (e.touches[0].clientY - r.top) * (canvas.height / r.height);
        
        const scale = Math.min(canvas.width / 1920, canvas.height / 1080);
        const ox = (canvas.width - 1920 * scale) / 2;
        const oy = (canvas.height - 1080 * scale) / 2;
        
        return { x: (tx - ox) / scale, y: (ty - oy) / scale };
    };

    canvas.addEventListener('touchstart', (e) => {
        if(!isHolding) return;
        const pos = getPos(e);
        activePoint = null;
        let minDist = 80; // 判定範囲を少し広めに確保
        
        // p3(尾先)を判定の優先順位に入れるため、逆順または距離で厳密に評価
        const pointList = Object.values(points);
        pointList.forEach(p => {
            const d = Math.hypot(p.x - pos.x, p.y - pos.y);
            if (d < minDist) {
                minDist = d;
                activePoint = p;
            }
        });
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