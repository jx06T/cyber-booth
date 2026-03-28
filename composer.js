const sharp = require('sharp');
const QRCode = require('qrcode');
const dayjs = require('dayjs');
const fs = require('fs');
const path = require('path');
const layout = require('./layout/b.json');
const { uploadImage } = require('./uploader'); 

/**
 * 核心合成函數
 * @param {string} sessionID - 會話 ID
 * @param {string[]} photoFilenames - 僅包含檔名的陣列，例如 ["shot_1.png", ...]
 */
async function generateFinalCollage(sessionID, photoFilenames) {
    // 轉換為絕對路徑，確保讀取正確
    const sessionDir = path.join(__dirname, 'sessions', sessionID);
    const photoPaths = photoFilenames.map(name => path.join(sessionDir, name));
    const finalLocalPath = path.join(sessionDir, 'collage.jpg');

    try {
        console.log(`[Composer] Processing session: ${sessionID}`);

        // 1. 設定 QR Code 內容 (活動官網)
        const officialWebsiteUrl = "https://club.cksc.tw/";
        const currentDate = dayjs().format('YYYY.MM.DD');

        // 2. 生成 QR Code Buffer
        const qrBuffer = await QRCode.toBuffer(officialWebsiteUrl, {
            margin: 1,
            color: { dark: '#000000', light: '#FFFFFF' }
        });

        // 3. 準備合成層
        const layers = [];

        // A. 放入照片 (中央裁剪至 slot 尺寸，確保遮罩能正確蓋住)
        for (let i = 0; i < photoPaths.length; i++) {
            const slot = layout.photo_slots[i];
            if (!fs.existsSync(photoPaths[i])) {
                console.warn(`[Composer] Warning: File not found ${photoPaths[i]}`);
                continue;
            }

            const metadata = await sharp(photoPaths[i]).metadata();

            // 中央裁剪至 slot 尺寸
            const offsetX = Math.max(0, Math.round((metadata.width - slot.w) / 2));
            const offsetY = Math.max(0, Math.round((metadata.height - slot.h) / 2));

            const croppedPhoto = await sharp(photoPaths[i])
                .extract({
                    left: offsetX,
                    top: offsetY,
                    width: Math.min(slot.w, metadata.width - offsetX),
                    height: Math.min(slot.h, metadata.height - offsetY)
                })
                .resize(slot.w, slot.h, { fit: 'fill' })
                .toBuffer();

            layers.push({
                input: croppedPhoto,
                top: slot.y,
                left: slot.x
            });
        }

        // B. 放入相框 Overlay
        // 注意：layout.overlay_path 建議使用絕對路徑或相對於專案根目錄的路徑
        layers.push({
            input: path.resolve(layout.overlay_path),
            top: 0,
            left: 0
        });

        // C. 處理 Widgets (Text & QR)
        for (const widget of layout.widgets) {
            if (widget.type === 'text') {
                const text = widget.content.replace('{CURRENT_DATE}', currentDate);
                const svgText = Buffer.from(`
                    <svg width="${layout.canvas.w}" height="${widget.fontSize * 1.5}">
                        <text x="0" y="${widget.fontSize}" 
                              font-family="${widget.fontFamily || 'Arial'}" 
                              font-size="${widget.fontSize}" 
                              fill="${widget.color}" 
                              font-weight="bold">
                            ${text}
                        </text>
                    </svg>
                `);
                layers.push({ input: svgText, top: widget.y, left: widget.x });
            }
            else if (widget.type === 'image') {
                let imgBuffer;
                if (widget.content === '{QR_URL}') {
                    imgBuffer = await sharp(qrBuffer).resize(widget.w, widget.h).toBuffer();
                } else {
                    // 一般圖片 Widget (如 Logo)，轉為 Buffer 並縮放
                    imgBuffer = await sharp(path.resolve(widget.content)).resize(widget.w, widget.h).toBuffer();
                }
                layers.push({ input: imgBuffer, top: widget.y, left: widget.x });
            }
        }

        // 4. 執行合成運算
        const finalImage = sharp({
            create: {
                width: layout.canvas.w,
                height: layout.canvas.h,
                channels: 4,
                background: layout.canvas.bg
            }
        }).composite(layers).jpeg({ quality: 95 });

        // 5. 先儲存到本地 Session 資料夾
        await finalImage.toFile(finalLocalPath);
        await finalImage.toFile(`sessions/collages/${sessionID}.jpg`);
        console.log(`[Composer] Saved locally to: ${finalLocalPath}`);

        // 6. 取得 Buffer 並呼叫上傳組件
        const finalBuffer = await finalImage.toBuffer();
        const publicUrl = await uploadImage(sessionID, finalBuffer);

        // 相對路徑供外部引用
        const relativePath = `sessions/${sessionID}/collage.jpg`;

        return {
            publicUrl: publicUrl,
            localPath: relativePath
        };

    } catch (err) {
        console.error('[Composer] Failed:', err);
        throw err;
    }
}

module.exports = { generateFinalCollage };