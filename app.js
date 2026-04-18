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

// --- 仕様復元: 倍率UIの制御 ---
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
        // メモリ負荷を抑えるため、必要最小限のCanvas生成
        if (!lastCapturedFrame) {
            lastCapturedFrame = document.createElement('canvas');
            lastCapturedFrame.width = 1920;
            lastCapturedFrame.height = 1080;
        }
        lastCapturedFrame.getContext('2d').drawImage(video, 0, 0, 1920, 1080);
        // 自動検出は一旦、最も安全な「変化なし（手動）」をデフォルトにし、クラッシュを避けます
    }
    
    // ボタン表示の復元
    document.getElementById('btn-hold').style.display = isHolding ? 'none' : 'block';
    document.getElementById('btn-ratio').style.display = isHolding ? 'none' : 'block';
    document.getElementById('btn-save').style.display = isHolding ? 'block' : 'none';
    document.getElementById('btn-cancel').style.display = isHolding ? 'block' : 'none';
}

function render() {
    // 歪み防止: 画面サイズに合わせつつ16:9を維持
    const stageW = window.innerWidth * window.devicePixelRatio;
    const stageH = window.innerHeight * window.devicePixelRatio;
    canvas.width = stageW;
    canvas.height = stageH;

    const scale = Math.min(stageW / 1920, stageH / 1080);
    const ox = (stageW - 1920 * scale) / 2;
    const oy = (stageH - 1080 * scale) / 2;

    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, stageW, stageH);

    const img = (isHolding && lastCapturedFrame) ? lastCapturedFrame : video;
    ctx.drawImage(img, ox, oy, 1920 * scale, 1080 * scale);

    drawOverlay(ox, oy, scale);
    if (activePoint && isHolding) drawMagnifier(ox, oy, scale);
    requestAnimationFrame(render);
}

function drawOverlay(ox, oy, scale) {
    // 距離計算（歪みのない1920スケールで計算）
    const forkPx = Math.hypot(points.p2.x - points.p1.x, points.p2.y - points.p1.y);
    const totalPx = Math.hypot(points.p3.x - points.p1.x, points.p3.y - points.p1.y);
    const res = { fork: (forkPx * mmRatio).toFixed(1), total: (totalPx * mmRatio).toFixed(1) };
    
    const fSize = canvas.height / 25;
    drawStyledText(`水槽${tankId} No.${String(currentNo).padStart(3, '0')} 尾叉:${res.fork}mm 全長:${res.total}mm`, 20, 80, fSize);

    // 履歴表示の復元
    measurementLogs.slice(0, 3).forEach((log, i) => {
        ctx.globalAlpha = 0.6 - (i * 0.2);
        drawStyledText(log, canvas.width - (fSize * 8), 80 + (i * fSize * 1.2), fSize * 0.7);
    });
    ctx.globalAlpha = 1.0;

    // ポイントとラベルの復元
    Object.values(points).forEach(p => {
        const px = ox + p.x * scale;
        const py = oy + p.y * scale;
        ctx.fillStyle = "black"; ctx.beginPath(); ctx.arc(px, py, 15, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = "white"; ctx.lineWidth = 3; ctx.stroke();
        drawStyledText(p.label, px + 20, py - 20, fSize * 0.6);
    });
}

function finalizeAndSave() {
    const forkPx = Math.hypot(points.p2.x - points.p1.x, points.p2.y - points.p1.y);
    measurementLogs.unshift(`No.${currentNo}: ${(forkPx * mmRatio).toFixed(1)}mm`);
    
    const link = document.createElement('a');
    link.href = canvas.toDataURL("image/png");
    link.download = `水槽${tankId}_No${String(currentNo).padStart(3, '0')}.png`;
    link.click();

    currentNo++;
    toggleHold(false);
}

function drawMagnifier(ox, oy, scale) {
    const size = 250, mag = 3;
    const px = ox + activePoint.x * scale;
    const py = oy + activePoint.y * scale;
    const tx = canvas.width/2 - size/2, ty = 150;
    
    ctx.save();
    ctx.strokeStyle = "yellow"; ctx.lineWidth = 4;
    ctx.strokeRect(tx, ty, size, size);
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