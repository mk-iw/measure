let currentNo = 1;
let tankId = "1";
let mmRatio = 0.400;
let isHolding = false;
let lastCapturedFrame = null;
let measurementLogs = []; // 直近3件の履歴用
let points = {
    p1: {x: 400, y: 500, label: "口先"},
    p2: {x: 900, y: 500, label: "尾叉"},
    p3: {x: 1200, y: 500, label: "尾先"}
};
let activePoint = null;

const video = document.getElementById('video');
const canvas = document.getElementById('canvas-measure');
const ctx = canvas.getContext('2d');

window.onload = async () => {
    tankId = prompt("水槽番号を入力", "1") || "1";
    const startNo = prompt("開始No.", "001");
    currentNo = parseInt(startNo) || 1;
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

function toggleRatioUI() {
    const ui = document.getElementById('ratio-container');
    ui.style.display = (ui.style.display === 'block') ? 'none' : 'block';
}

function updateRatio(val) {
    mmRatio = parseFloat(val);
    document.getElementById('ratio-val').textContent = mmRatio.toFixed(3);
}

function toggleHold(state) {
    isHolding = state;
    if (state) {
        lastCapturedFrame = document.createElement('canvas');
        lastCapturedFrame.width = video.videoWidth;
        lastCapturedFrame.height = video.videoHeight;
        lastCapturedFrame.getContext('2d').drawImage(video, 0, 0);
    }
    document.getElementById('btn-hold').style.display = isHolding ? 'none' : 'block';
    document.getElementById('btn-ratio').style.display = isHolding ? 'none' : 'block';
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

    const res = { 
        fork: (forkPx * mmRatio).toFixed(1), 
        total: (totalPx * mmRatio).toFixed(1) 
    };

    const fSize = canvas.height / 22;
    const textY = 100;
    
    // ガイド点線
    const p1x = (points.p1.x / 1920) * canvas.width;
    const p1y = (points.p1.y / 1080) * canvas.height;
    const p2x = (points.p2.x / 1920) * canvas.width;
    const p2y = (points.p2.y / 1080) * canvas.height;
    ctx.strokeStyle = "rgba(255, 255, 0, 0.8)";
    ctx.lineWidth = 3; ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(p1x, p1y); ctx.lineTo(p2x, p2y); ctx.stroke();
    ctx.setLineDash([]);

    // メイン表示
    drawStyledText(`水槽${tankId}  No.${String(currentNo).padStart(3, '0')}  尾叉:${res.fork}mm  全長:${res.total}mm`, 20, textY, fSize);

    // 履歴ログ表示 (右上に配置)
    measurementLogs.forEach((log, i) => {
        ctx.globalAlpha = 0.6 - (i * 0.2);
        drawStyledText(log, canvas.width - (fSize * 6), textY + (i * (fSize * 1.2)), fSize * 0.6);
    });
    ctx.globalAlpha = 1.0;

    Object.values(points).forEach(p => {
        const px = (p.x / 1920) * canvas.width;
        const py = (p.y / 1080) * canvas.height;
        ctx.fillStyle = "black"; ctx.beginPath(); ctx.arc(px, py, 10, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = "white"; ctx.lineWidth = 2; ctx.stroke();
        drawStyledText(p.label, px + 15, py - 15, fSize * 0.6);
    });
}

function finalizeAndSave() {
    const now = new Date();
    const dateStr = now.getFullYear().toString().slice(-2) + 
                    ("0" + (now.getMonth() + 1)).slice(-2) + 
                    ("0" + now.getDate()).slice(-2);
    
    // ログに記録
    const forkPx = Math.hypot(points.p2.x - points.p1.x, points.p2.y - points.p1.y);
    const forkMm = (forkPx * mmRatio).toFixed(1);
    measurementLogs.unshift(`No.${currentNo}: ${forkMm}mm`);
    if (measurementLogs.length > 3) measurementLogs.pop();

    const fileName = `水槽${tankId}_${dateStr}_No${String(currentNo).padStart(3, '0')}.png`;
    const link = document.createElement('a');
    link.href = canvas.toDataURL("image/png");
    link.download = fileName;
    link.click();

    currentNo++;
    toggleHold(false);
}

function drawMagnifier() {
    const size = 220; const mag = 2.2;
    const px = (activePoint.x / 1920) * canvas.width;
    const py = (activePoint.y / 1080) * canvas.height;
    ctx.save();
    const targetX = canvas.width / 2 - size / 2;
    const targetY = 150; 
    ctx.strokeStyle = "yellow"; ctx.lineWidth = 4;
    ctx.strokeRect(targetX, targetY, size, size);
    ctx.beginPath(); ctx.rect(targetX, targetY, size, size); ctx.clip();
    ctx.drawImage(canvas, px - (size/mag)/2, py - (size/mag)/2, size/mag, size/mag, targetX, targetY, size, size);
    ctx.strokeStyle = "red"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(targetX + size/2, targetY); ctx.lineTo(targetX + size/2, targetY + size);
    ctx.moveTo(targetX, targetY + size/2); ctx.lineTo(targetX + size, targetY + size/2); ctx.stroke();
    ctx.restore();
}

function drawStyledText(txt, x, y, size) {
    ctx.font = `bold ${size}px sans-serif`;
    ctx.strokeStyle = "white"; ctx.lineWidth = 4;
    ctx.strokeText(txt, x, y);
    ctx.fillStyle = "black";
    ctx.fillText(txt, x, y);
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
        activePoint = Object.values(points).find(p => Math.hypot(p.x - pos.x, p.y - pos.y) < 100);
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