// api/index.js (Vercel Node.js Function)
const fs = require('fs');
const path = require('path');
const axios = require('axios');

export default async function handler(req, res) {
    if (req.url.startsWith('/deploy-info')) {
        const html = fs.readFileSync(
            path.join(process.cwd(), 'deploy-info.html'),
            'utf-8'
        );
        res.setHeader('Content-Type', 'text/html');
        return res.status(200).send(html);
    }

    const { id } = req.query;
    const baseUrl = `https://${req.headers.host}`;
    const supabaseImgUrl = `https://ideczmuynbnfkonausvj.supabase.co/storage/v1/object/public/photos/${id}.jpg`;
    const placeholderImg = `${baseUrl}/placeholder.jpg`;

    let ogImage = placeholderImg;
    let title = "Cyber Booth | 數位拍貼系統";
    let description = "一個專為實體活動設計的「拍貼與特效合成」工具！";

    // 1. 如果有 ID，檢查 Supabase 圖片是否存在 (HEAD 請求比較快)
    if (id) {
        try {
            const check = await axios.head(supabaseImgUrl);
            if (check.status === 200) {
                ogImage = supabaseImgUrl;
                title = `Cyber Booth | Your Moment #${id}`;
                description = "點擊查看我在 Cyber Booth 拍攝的專屬合成拍貼！";
            }
        } catch (e) {
            // 圖片不存在或過期，保持使用佔位圖
            title = "Cyber Booth | 照片不存在";
            description = "這張照片已過期或不存在。";
        }
    }

    // 2. 讀取原本的 index.html 檔案內容
    const htmlPath = path.join(process.cwd(), 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');

    // 3. 在 <head> 中注入動態 OG 標籤
    const ogTags = `
    <title>${title}</title>
    <meta name="description" content="${description}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${ogImage}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${baseUrl}/?id=${id}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:image" content="${ogImage}">
  `;

    // 將標籤插入到 <head> 開頭
    html = html.replace('<head>', `<head>${ogTags}`);

    // 4. 回傳處理後的完整 HTML
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
}