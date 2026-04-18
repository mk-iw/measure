let currentNo = 1;
let tankId = "1";
let mmRatio = 0.400;
let isHolding = false;
let lastCapturedFrame = null;
let measurementLogs = [];
let points = {
    p1: {x: 400, y: 500, label: "口先"},
    p2: {x: 900, y: 500, label: "尾叉"},
    p3: {x: 1200, y: 500, label: "尾先"}
};
let activePoint = null;

// Workerの初期化
const fishWorker = new Worker('worker.js');

const video = document.getElementById('video');
const canvas = document.getElementById('canvas-measure');
const ctx = canvas.getContext('2d');

window.onload = async () => {
    tankId = prompt("水槽番号", "1") || "1";
    currentNo = parseInt(prompt("開始No.", "1")) || 1;
    try {
        const s = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment", width: 1920, height: 1080 }
        });
        video.srcObject = s;
        video.play();
        render();
    } catch (e) { alert("カメラエラー"); }
    initTouchEvents();
};

// Workerからの計算結果を受け取る
fishWorker.onmessage = function(e) {
    const res = e.data;
    if (res.found) {
        // メインが操作中でなければ座標を更新（吸着）
        if (!activePoint) {
            points.p1.x = res.minX; points.p1.y = res.avgY;
            points.p3.x = res.maxX; points.p3.y = res.avgY;
            points.p2.x = res.maxX - (res.maxX - res.minX) * 0.08;
            points.p2.y = res.avgY;
        }
    }
};

function toggleHold(state) {
    isHolding = state;
    if (state) {
        lastCapturedFrame = document.createElement('canvas');
        lastCapturedFrame.width = video.videoWidth;
        lastCapturedFrame.height = video.videoHeight;
        const ctxTemp = lastCapturedFrame.getContext('2d');
        ctxTemp.drawImage(video, 0, 0);

        // 重い計算はWorkerへ丸投げ（自身のスレッドは止めない）
        const imgData = ctxTemp.getImageData(0, 0, lastCapturedFrame.width, lastCapturedFrame.height);
        fishWorker.postMessage({
            data: imgData.data,
            w: lastCapturedFrame.width,
            h: lastCapturedFrame.height,
            prevPoints: points
        }, [imgData.data.buffer]); // Transferable Objectsでメモリ転送を高速化
    }
    
    document.getElementById('btn-hold').style.display = isHolding ? 'none' : 'block';
    document.getElementById('btn-save').style.display = isHolding ? 'block' : 'none';
    document.getElementById('btn-cancel').style.display = isHolding ? 'block' : 'none';
}

function render() {
    canvas.width = window.innerWidth * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;
    const img = (isHolding && lastCapturedFrame) ? lastCapturedFrame : video;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    drawOverlay();
    if (activePoint && isHolding) drawMagnifier();
    requestAnimationFrame(render);
}

function drawOverlay() {
    const forkPx = Math.hypot(points.p2.x - points.p1.x, points.p2.y - points.p1.y);
    const ax = points.p2.x - points.p1.x, ay = points.p2.y - points.p1.y;
    const bx = points.p3.x - points.p1.x, by = points.p3.y - points.p1.y;
    const totalPx = (ax * bx + ay * by) / Math.sqrt(ax * ax + ay * ay);

    const res = { fork: (forkPx * mmRatio).toFixed(1), total: (totalPx * mmRatio).toFixed(1) };
    const fSize = canvas.height / 25;
    
    drawStyledText(`水槽${tankId} No.${String(currentNo).padStart(3, '0')} 尾叉:${res.fork}mm 全長:${res.total}mm`, 20, 80, fSize);

    Object.values(points).forEach(p => {
        const px = (p.x / 1920) * canvas.width;
        const py = (p.y / 1080) * canvas.height;
        ctx.fillStyle = "black"; ctx.beginPath(); ctx.arc(px, py, 12, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = "white"; ctx.lineWidth = 3; ctx.stroke();
    });
}

function finalizeAndSave() {
    const now = new Date();
    const dateStr = now.getFullYear().toString().slice(-2) + ("0"+(now.getMonth()+1)).slice(-2) + ("0"+now.getDate()).slice(-2);
    const fileName = `水槽${tankId}_${dateStr}_No${String(currentNo).padStart(3, '0')}.png`;
    const link = document.createElement('a');
    link.href = canvas.toDataURL("image/png");
    link.download = fileName;
    link.click();
    currentNo++;
    toggleHold(false);
}

function drawMagnifier() {
    const size = 200, mag = 2.5;
    const px = (activePoint.x / 1920) * canvas.width;
    const py = (activePoint.y / 1080) * canvas.height;
    ctx.save();
    const tx = canvas.width/2 - size/2, ty = 120;
    ctx.strokeStyle = "yellow"; ctx.lineWidth = 4; ctx.strokeRect(tx, ty, size, size);
    ctx.beginPath(); ctx.rect(tx, ty, size, size); ctx.clip();
    ctx.drawImage(canvas, px-(size/mag)/2, py-(size/mag)/2, size/mag, size/mag, tx, ty, size, size);
    ctx.restore();
}

function drawStyledText(t, x, y, s) {
    ctx.font = `bold ${s}px sans-serif`;
    ctx.strokeStyle = "white"; ctx.lineWidth = 4; ctx.strokeText(t, x, y);
    ctx.fillStyle = "black"; ctx.fillText(t, x, y);
}

function initTouchEvents() {
    const getPos = (e) => {
        const r = canvas.getBoundingClientRect();
        const t = e.touches[0];
        return { x: (t.clientX - r.left) * (1920 / r.width), y: (t.clientY - r.top) * (1080 / r.height) };
    };
    canvas.addEventListener('touchstart', (e) => {
        if(!isHolding) return;
        const pos = getPos(e);
        activePoint = Object.values(points).find(p => Math.hypot(p.x - pos.x, p.y - pos.y) < 80);
    });
    canvas.addEventListener('touchmove', (e) => {
        if(activePoint) {
            const pos = getPos(e);
            activePoint.x = pos.x; activePoint.y = pos.y;
            e.preventDefault();
        }
    }, {passive: false});
    canvas.addEventListener('touchend', () => activePoint = null);
}