self.onmessage = function(e) {
    const { data, w, h, prevPoints } = e.data;
    
    // 多点スキャン（5本の水平線）でノイズ耐性を高める
    // 縮小された座標系(w x h)で動作
    const centerY = (prevPoints.p1.y + prevPoints.p3.y) / 2 * (h / 1080);
    const scanLines = [centerY-10, centerY-5, centerY, centerY+5, centerY+10];
    
    let allMinX = w, maxX = 0, validY = [];

    scanLines.forEach(y => {
        let lineMinX = w, lineMaxX = 0;
        const row = Math.floor(y);
        if (row < 0 || row >= h) return;

        // 2px飛ばしで高速にエッジを探す
        for (let x = 10; x < w - 10; x += 2) {
            const i = (row * w + x) * 4;
            const prevI = (row * w + (x - 2)) * 4;
            const diff = Math.abs(data[i] - data[prevI]);

            if (diff > 35) { // コントラスト閾値
                if (x < lineMinX) lineMinX = x;
                if (x > lineMaxX) lineMaxX = x;
            }
        }
        // 線ごとに「一定の長さ（魚らしさ）」を確認
        if (lineMaxX - lineMinX > 40) {
            if (lineMinX < allMinX) allMinX = lineMinX;
            if (lineMaxX > maxX) maxX = lineMaxX;
            validY.push(y);
        }
    });

    if (validY.length > 0) {
        self.postMessage({
            found: true,
            minX: allMinX * (1920 / w), // 1920スケールに復元
            maxX: maxX * (1920 / w),
            avgY: (validY.reduce((a, b) => a + b) / validY.length) * (1080 / h)
        });
    } else {
        self.postMessage({ found: false });
    }
};