let currentNo = 1;
let isHolding = false;
let config = { area_width_mm: 400 };
let points = {
    p1: {x: 300, y: 300, label: "口先"},
    p2: {x: 600, y: 450, label: "尾叉"},
    p3: {x: 750, y: 300, label: "尾先"}
};
let activePoint = null;

const video = document.getElementById('video');
const canvas = document.getElementById('canvas-measure');
const ctx = canvas.getContext('2d');

window.onload = async () => {
    const startNo = prompt("開始No.を入力(例: 001)", "001");
    currentNo = parseInt(startNo) || 1;
    updateNoDisplay();
    await startCamera();
    initSpeech();
    initDragEvents();
    requestAnimationFrame(mainLoop);
};

async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }
    });
    video.srcObject = stream;
}

function updateNoDisplay() {
    document.getElementById('no-display').innerText = `No. ${String(currentNo).padStart(3, '0')}`;
}

// 音声認識
function initSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.continuous = true;
    recognition.onresult = (e) => {
        const cmd = e.results[e.results.length - 1][0].transcript;
        if(cmd.match(/チェック|ホールド/)) toggleHold(true);
        if(cmd.match(/パス|ネクスト/) && isHolding) finalizeAndSave();
    };
    recognition.start();
}

function toggleHold(state) {
    isHolding = state;
    document.getElementById('btn-hold').style.display = state ? 'none' : 'block';
    document.getElementById('btn-save').style.display = state ? 'block' : 'none';
    document.getElementById('btn-cancel').style.display = state ? 'block' : 'none';
}

function drawText(text, x, y, size = 40) {
    ctx.font = `bold ${size}px sans-serif`;
    ctx.strokeStyle = "white"; // 読みやすくするための白縁
    ctx.lineWidth = 4;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = "black";
    ctx.fillText(text, x, y);
}

function mainLoop() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);

        const res = calculateMetrics();
        
        // ポイントと線の描画
        ctx.strokeStyle = "black";
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(points.p1.x, points.p1.y); ctx.lineTo(points.p2.x, points.p2.y); ctx.stroke();
        
        Object.values(points).forEach(p => {
            ctx.fillStyle = "black";
            ctx.beginPath(); ctx.arc(p.x, p.y, 12, 0, Math.PI*2); ctx.fill();
            drawText(p.label, p.x + 20, p.y - 20, 30);
        });

        drawText(`尾叉長: ${res.fork}mm`, 50, canvas.height - 100);
        drawText(`全　長: ${res.total}mm`, 50, canvas.height - 40);
        drawText(`No. ${String(currentNo).padStart(3, '0')}`, canvas.width - 200, 60);
    }
    requestAnimationFrame(mainLoop);
}

function calculateMetrics() {
    const mmRatio = config.area_width_mm / 1000; // 簡易比率
    const forkPx = Math.hypot(points.p2.x - points.p1.x, points.p2.y - points.p1.y);
    const ax = points.p2.x - points.p1.x, ay = points.p2.y - points.p1.y;
    const bx = points.p3.x - points.p1.x, by = points.p3.y - points.p1.y;
    const totalPx = (ax * bx + ay * by) / Math.sqrt(ax * ax + ay * ay);
    return { fork: (forkPx * mmRatio).toFixed(1), total: (totalPx * mmRatio).toFixed(1) };
}

function finalizeAndSave() {
    const link = document.createElement('a');
    // ファイル名に日付を付与
    const dateStr = new Date().toISOString().slice(2,10).replace(/-/g,'');
    link.download = `${dateStr}_No${String(currentNo).padStart(3, '0')}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();

    currentNo++;
    updateNoDisplay();
    toggleHold(false);
}

// ドラッグイベント
function initDragEvents() {
    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const t = e.touches ? e.touches[0] : e;
        return {
            x: (t.clientX - rect.left) * (canvas.width / rect.width),
            y: (t.clientY - rect.top) * (canvas.height / rect.height)
        };
    };

    canvas.addEventListener('touchstart', (e) => {
        if(!isHolding) return;
        const pos = getPos(e);
        activePoint = Object.values(points).find(p => Math.hypot(p.x - pos.x, p.y - pos.y) < 50);
    });

    canvas.addEventListener('touchmove', (e) => {
        if(activePoint) {
            const pos = getPos(e);
            activePoint.x = pos.x; activePoint.y = pos.y;
            e.preventDefault();
        }
    });

    canvas.addEventListener('touchend', () => activePoint = null);
}

function toggleRotation() {
    document.getElementById('container').classList.toggle('portrait');
}