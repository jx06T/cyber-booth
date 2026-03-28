// uploader.js
const { createClient } = require('@supabase/supabase-js');

// 請在環境變數中設定這些值
const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_SERVICE_ROLE_KEY // 使用 Service Key 才有權限寫入
);

const VERCEL_DOMAIN = "https://your-booth-web.vercel.app";

async function uploadImage(sessionID, buffer) {
    try {
        const fileName = `${sessionID}.jpg`;

        // 1. 上傳到 Supabase Storage
        const { data: storageData, error: storageError } = await supabase.storage
            .from('photos')
            .upload(fileName, buffer, {
                contentType: 'image/jpeg',
                upsert: true
            });

        if (storageError) throw storageError;

        // 2. 寫入資料庫紀錄
        const { error: dbError } = await supabase
            .from('collages')
            .insert([{ session_id: sessionID }]);

        if (dbError) throw dbError;

        // 3. 回傳 Vercel 下載頁面的網址給 QR Code 使用
        // 格式：https://xxx.vercel.app/?id=ssn_12345
        return `${VERCEL_DOMAIN}/?id=${sessionID}`;

    } catch (err) {
        console.error('[Uploader] Error:', err);
        throw err;
    }
}

module.exports = { uploadImage };