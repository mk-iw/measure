/**
 * Fish-Measure AR Pro: app.js (全機能統合版)
 */

let currentNo = 1;
let isHolding = false;
let config = {};
let points = { p1: {x:200, y:200}, p2: {x:400, y:300}, p3: {x:500, y:200} };
let draggedPoint = null;

const video = document.getElementById('video');
const canvas = document.getElementById('canvas-measure');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

// --- 1. 初期化 ---
window.onload = async () => {
    try {
        const response = await fetch('settings.json');
        config = await response.json();
    } catch (e) {
        config = {
            system: { target_area_width_mm: 400.0 },
            labels: { commands: { hold: ["チェック", "ホールド"], save: ["パス", "ネクスト"] } }
        };
    }

    const inputNo = prompt("開始No.を入力(3桁)", "001");
    currentNo = parseInt(inputNo) || 1;
    updateUI();

    await startCamera();
    initSpeech();
    initManualButtons();
    initDragEvents();
    requestAnimationFrame(mainLoop);
};

async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }
    });
    video.srcObject = stream;
}

function updateUI() {
    document.getElementById('no-display').innerText = `No. ${String(currentNo).padStart(3, '0')}`;
}

// --- 2. 音声 & 手動ボタン ---
function initSpeech() {
    const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.continuous = true;
    recognition.onresult = (event) => {
        const cmd = event.results[event.results.length - 1][0].transcript.trim();
        if (config.labels.commands.hold.some(w => cmd.includes(w))) toggleHold(true);
        if (config.labels.commands.save.some(w => cmd.includes(w))) { if(isHolding) finalizeAndSave(); }
    };
    recognition.start();
}

function initManualButtons() {
    // ボタンの動的生成
    const btnContainer = document.createElement('div');
    btnContainer.style = "position:absolute; bottom:100px; right:20px; display:flex; flex-direction:column; gap:10px; pointer-events:auto;";
    
    const btnHold = createBtn("固定/解除", "#0078ff", () => toggleHold(!isHolding));
    const btnSave = createBtn("保存/次へ", "#ff4b00", () => { if(isHolding) finalizeAndSave(); });
    const btnRotate = createBtn("画面回転", "#333", rotateCanvas);

    btnContainer.appendChild(btnRotate);
    btnContainer.appendChild(btnHold);
    btnContainer.appendChild(btnSave);
    document.getElementById('container').appendChild(btnContainer);
}

function createBtn(text, color, onClick) {
    const b = document.createElement('button');
    b.innerText = text;
    b.style = `padding:15px; background:${color}; color:white; border:none; border-radius:10px; font-weight:bold; font-size:16px;`;
    b.onclick = onClick;
    return b;
}

let rotation = 0;
function rotateCanvas() {
    rotation = (rotation + 90) % 360;
    canvas.style.transform = `rotate(${rotation}deg)`;
}

function toggleHold(state) {
    isHolding = state;
    statusEl.innerText = state ? "【固定中】ドラッグ調整 & 保存" : "【追従中】ホールド待ち";
    statusEl.className = state ? "holding" : "";
}

// --- 3. ドラッグ操作 ---
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
        if (!isHolding) return;
        const pos = getPos(e);
        const hitRadius = 50;
        for (let key in points) {
            if (Math.hypot(pos.x - points[key].x, pos.y - points[key].y) < hitRadius) {
                draggedPoint = key;
                break;
            }
        }
    });

    canvas.addEventListener('touchmove', (e) => {
        if (draggedPoint) {
            const pos = getPos(e);
            points[draggedPoint] = pos;
            e.preventDefault();
        }
    }, { passive: false });

    canvas.addEventListener('touchend', () => { draggedPoint = null; });
}

// --- 4. 描画 & 保存 ---
function mainLoop() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // 1. カメラ映像を背景に描く
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // 2. 計測ラインとポイントを描画
        drawOverlay();
    }
    requestAnimationFrame(mainLoop);
}

function drawOverlay() {
    const { p1, p2, p3 } = points;
    const forkLen = (Math.hypot(p2.x - p1.x, p2.y - p1.y) * (config.system.target_area_width_mm / 1000)).toFixed(1);

    // ライン
    ctx.strokeStyle = "yellow"; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    
    // ポイント
    ctx.fillStyle = "cyan";
    [p1, p2, p3].forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 20, 0, Math.PI*2); ctx.fill();
    });

    // テキスト
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(30, canvas.height - 120, 350, 100);
    ctx.fillStyle = "#0f0"; ctx.font = "bold 50px sans-serif";
    ctx.fillText(`尾叉長: ${forkLen}mm`, 50, canvas.height - 50);
}

function finalizeAndSave() {
    // 保存直前にNo.を合成
    ctx.fillStyle = "white";
    ctx.font = "bold 60px sans-serif";
    ctx.shadowColor = "black"; ctx.shadowBlur = 10;
    ctx.fillText(`No. ${String(currentNo).padStart(3, '0')}`, canvas.width - 300, 100);

    const dataURL = canvas.toDataURL("image/png");
    const link = document.createElement('a');
    link.download = `FISH_${String(currentNo).padStart(3, '0')}.png`;
    link.href = dataURL;
    link.click();

    currentNo++;
    updateUI();
    toggleHold(false);
}