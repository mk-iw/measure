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
    } catch (e) { alert("カメラ再起動が必要です"); }
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
        const ctxTemp = lastCapturedFrame.getContext('2d');
        ctxTemp.drawImage(video, 0, 0);

        // 段階的拡張スキャンを実行
        detectFishStepwise(ctxTemp, lastCapturedFrame.width, lastCapturedFrame.height);
    }
    document.getElementById('btn-hold').style.display = isHolding ? 'none' : 'block';
    document.getElementById('btn-ratio').style.display = isHolding ? 'none' : 'block';
    document.getElementById('btn-save').style.display = isHolding ? 'block' : 'none';
    document.getElementById('btn-cancel').style.display = isHolding ? 'block' : 'none';
}

// --- 核心ロジック：段階的・一方向拡張スキャン ---
function detectFishStepwise(tempCtx, w, h) {
    // 全データ取得（一度だけ）
    const fullImageData = tempCtx.getImageData(0, 0, w, h);
    const data = fullImageData.data;

    const centerY = (points.p1.y + points.p3.y) / 2;
    let currentTop = Math.max(0, Math.floor(centerY - 150));
    let currentBottom = Math.min(h, Math.floor(centerY + 150));

    // 1段目：狭域スキャン
    let res = scanInternal(data, w, currentTop, currentBottom);

    // はみ出し判定と段階的拡張（最大2回まで）
    for (let i = 0; i < 2; i++) {
        if (!res.found) break;

        let needsExpansion = false;
        // 上にはみ出しているか？
        if (res.minY <= currentTop + 10 && currentTop > 0) {
            currentTop = Math.max(0, currentTop - 100);
            needsExpansion = true;
        }
        // 下にはみ出しているか？
        if (res.maxY >= currentBottom - 10 && currentBottom < h) {
            currentBottom = Math.min(h, currentBottom + 100);
            needsExpansion = true;
        }

        if (needsExpansion) {
            // 拡張した範囲で再計算（同じdata配列を使い回す）
            res = scanInternal(data, w, currentTop, currentBottom);
        } else {
            break; // 収まったら終了
        }
    }

    // 最終結果を反映
    if (res.found) {
        points.p1.x = res.minX; points.p1.y = res.avgY;
        points.p3.x = res.maxX; points.p3.y = res.avgY;
        points.p2.x = res.maxX - (res.maxX - res.minX) * 0.08;
        points.p2.y = res.avgY;
    }
}

// ピクセル走査の本体（軽量化版）
function scanInternal(data, w, top, bottom) {
    let minX = w, maxX = 0, minY = bottom, maxY = top, sumY = 0, count = 0;
    const step = 15; // 15px間隔で間引く（負荷対策）

    for (let y = top; y < bottom; y += step) {
        for (let x = 100; x < w - 100; x += step) {
            const i = (y * w + x) * 4;
            const prevI = (y * w + (x - step)) * 4;

            const b = (data[i] + data[i+1] + data[i+2]) / 3;
            const pb = (data[prevI] + data[prevI+1] + data[prevI+2]) / 3;
            
            // コントラスト差によるエッジ検出
            if (Math.abs(b - pb) > 35) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                sumY += y;
                count++;
            }
        }
    }
    const found = (count > 15 && (maxX - minX) > 150);
    return { found, minX, maxX, minY, maxY, avgY: sumY / count };
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
    const textY = 80;
    
    // ガイド点線
    const p1x = (points.p1.x / 1920) * canvas.width;
    const p1y = (points.p1.y / 1080) * canvas.height;
    const p2x = (points.p2.x / 1920) * canvas.width;
    const p2y = (points.p2.y / 1080) * canvas.height;
    ctx.strokeStyle = "rgba(255,255,0,0.8)"; ctx.setLineDash([5,5]);
    ctx.beginPath(); ctx.moveTo(p1x, p1y); ctx.lineTo(p2x, p2y); ctx.stroke();
    ctx.setLineDash([]);

    drawStyledText(`水槽${tankId} No.${String(currentNo).padStart(3, '0')} 尾叉:${res.fork}mm 全長:${res.total}mm`, 20, textY, fSize);

    measurementLogs.forEach((log, i) => {
        ctx.globalAlpha = 0.6 - (i * 0.2);
        drawStyledText(log, canvas.width - (fSize * 6), textY + (i * (fSize * 1.2)), fSize * 0.6);
    });
    ctx.globalAlpha = 1.0;

    Object.values(points).forEach(p => {
        const px = (p.x / 1920) * canvas.width;
        const py = (p.y / 1080) * canvas.height;
        ctx.fillStyle = "black"; ctx.beginPath(); ctx.arc(px, py, 12, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = "white"; ctx.lineWidth = 3; ctx.stroke();
        drawStyledText(p.label, px + 15, py - 15, fSize * 0.6);
    });
}

function finalizeAndSave() {
    const now = new Date();
    const dateStr = now.getFullYear().toString().slice(-2) + ("0"+(now.getMonth()+1)).slice(-2) + ("0"+now.getDate()).slice(-2);
    const forkPx = Math.hypot(points.p2.x - points.p1.x, points.p2.y - points.p1.y);
    
    measurementLogs.unshift(`No.${currentNo}: ${(forkPx * mmRatio).toFixed(1)}mm`);
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
    const size = 200, mag = 2.5;
    const px = (activePoint.x / 1920) * canvas.width;
    const py = (activePoint.y / 1080) * canvas.height;
    ctx.save();
    const tx = canvas.width/2 - size/2, ty = 120;
    ctx.strokeStyle = "yellow"; ctx.lineWidth = 4; ctx.strokeRect(tx, ty, size, size);
    ctx.beginPath(); ctx.rect(tx, ty, size, size); ctx.clip();
    ctx.drawImage(canvas, px-(size/mag)/2, py-(size/mag)/2, size/mag, size/mag, tx, ty, size, size);
    ctx.strokeStyle="red"; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(tx+size/2, ty); ctx.lineTo(tx+size/2, ty+size); ctx.moveTo(tx, ty+size/2); ctx.lineTo(tx+size, ty+size/2); ctx.stroke();
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