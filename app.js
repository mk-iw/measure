let currentNo = 1; let tankId = "1"; let mmRatio = 0.400;
let isHolding = false; let lastCapturedFrame = null;
let points = { p1: {x: 400, y: 500}, p2: {x: 900, y: 500}, p3: {x: 1200, y: 500} };
let activePoint = null;

const fishWorker = new Worker('worker.js');
const video = document.getElementById('video');
const canvas = document.getElementById('canvas-measure');
const ctx = canvas.getContext('2d');

// ダウンサンプリング用オフスクリーンCanvas
const offscreen = document.createElement('canvas');
const octx = offscreen.getContext('2d', { willReadFrequently: true });

window.onload = async () => {
    tankId = prompt("水槽番号", "1") || "1";
    currentNo = parseInt(prompt("開始No.", "1")) || 1;
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

fishWorker.onmessage = (e) => {
    if (e.data.found && !activePoint) {
        points.p1.x = e.data.minX; points.p3.x = e.data.maxX;
        points.p1.y = points.p2.y = points.p3.y = e.data.avgY;
        points.p2.x = points.p3.x - (points.p3.x - points.p1.x) * 0.08;
    }
};

function toggleHold(state) {
    isHolding = state;
    if (state) {
        lastCapturedFrame = document.createElement('canvas');
        lastCapturedFrame.width = 1920; lastCapturedFrame.height = 1080;
        lastCapturedFrame.getContext('2d').drawImage(video, 0, 0, 1920, 1080);

        // 【工夫】1/4にダウンサンプリングしてWorkerへ
        const sw = 480, sh = 270;
        offscreen.width = sw; offscreen.height = sh;
        octx.drawImage(lastCapturedFrame, 0, 0, sw, sh);
        const imgData = octx.getImageData(0, 0, sw, sh);
        fishWorker.postMessage({
            data: imgData.data, w: sw, h: sh, prevPoints: points
        }, [imgData.data.buffer]);
    }
    document.getElementById('btn-hold').style.display = isHolding ? 'none' : 'block';
    document.getElementById('btn-save').style.display = isHolding ? 'block' : 'none';
    document.getElementById('btn-cancel').style.display = isHolding ? 'block' : 'none';
}

function render() {
    // 【改善】アスペクト比（16:9）を維持した描画領域の計算
    const stageW = window.innerWidth * window.devicePixelRatio;
    const stageH = window.innerHeight * window.devicePixelRatio;
    canvas.width = stageW; canvas.height = stageH;

    const videoAspect = 1920 / 1080;
    const stageAspect = stageW / stageH;

    let drawW, drawH, offsetX = 0, offsetY = 0;
    if (stageAspect > videoAspect) {
        drawH = stageH; drawW = stageH * videoAspect;
        offsetX = (stageW - drawW) / 2;
    } else {
        drawW = stageW; drawH = stageW / videoAspect;
        offsetY = (stageH - drawH) / 2;
    }

    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, stageW, stageH);
    const img = (isHolding && lastCapturedFrame) ? lastCapturedFrame : video;
    ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
    
    drawOverlay(offsetX, offsetY, drawW, drawH);
    if (activePoint && isHolding) drawMagnifier(offsetX, offsetY, drawW, drawH);
    requestAnimationFrame(render);
}

function drawOverlay(ox, oy, dw, dh) {
    const forkPx = Math.hypot(points.p2.x - points.p1.x, points.p2.y - points.p1.y);
    const totalPx = Math.hypot(points.p3.x - points.p1.x, points.p3.y - points.p1.y);
    const res = { fork: (forkPx * mmRatio).toFixed(1), total: (totalPx * mmRatio).toFixed(1) };
    
    drawStyledText(`水槽${tankId} No.${String(currentNo).padStart(3, '0')} 尾叉:${res.fork}mm 全長:${res.total}mm`, 20, 80, dh/20);

    Object.values(points).forEach(p => {
        const px = ox + (p.x / 1920) * dw;
        const py = oy + (p.y / 1080) * dh;
        ctx.fillStyle = "black"; ctx.beginPath(); ctx.arc(px, py, 12, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = "white"; ctx.lineWidth = 3; ctx.stroke();
    });
}

function finalizeAndSave() {
    const link = document.createElement('a');
    link.href = canvas.toDataURL("image/png");
    link.download = `水槽${tankId}_No${String(currentNo).padStart(3, '0')}.png`;
    link.click();
    currentNo++; toggleHold(false);
}

function drawMagnifier(ox, oy, dw, dh) {
    const size = 250, mag = 3;
    const px = ox + (activePoint.x / 1920) * dw;
    const py = oy + (activePoint.y / 1080) * dh;
    ctx.save();
    const tx = ox + dw/2 - size/2, ty = oy + 100;
    ctx.strokeStyle = "yellow"; ctx.lineWidth = 4; ctx.strokeRect(tx, ty, size, size);
    ctx.beginPath(); ctx.rect(tx, ty, size, size); ctx.clip();
    ctx.drawImage(canvas, px-(size/mag)/2, py-(size/mag)/2, size/mag, size/mag, tx, ty, size, size);
    ctx.restore();
}

function drawStyledText(t, x, y, s) {
    ctx.font = `bold ${s}px sans-serif`; ctx.strokeStyle = "white"; ctx.lineWidth = 4;
    ctx.strokeText(t, x, y); ctx.fillStyle = "black"; ctx.fillText(t, x, y);
}

function initTouchEvents() {
    const getPos = (e) => {
        const r = canvas.getBoundingClientRect();
        const stageW = r.width, stageH = r.height;
        const videoAspect = 1920 / 1080;
        let dw, dh, ox = 0, oy = 0;
        if ((stageW/stageH) > videoAspect) {
            dh = stageH; dw = stageH * videoAspect; ox = (stageW - dw) / 2;
        } else {
            dw = stageW; dh = stageW / videoAspect; oy = (stageH - dh) / 2;
        }
        const t = e.touches[0];
        return { 
            x: (t.clientX - r.left - ox) * (1920 / dw), 
            y: (t.clientY - r.top - oy) * (1080 / dh) 
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