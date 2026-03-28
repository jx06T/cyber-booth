// uploader.js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const isCloudConfigured = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = isCloudConfigured 
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY) 
    : null;

const VERCEL_DOMAIN = "https://cyber-booth.vercel.app/";

async function uploadImage(sessionID, buffer) {
    if (!isCloudConfigured) {
        return `${VERCEL_DOMAIN}deploy-info`;
    }
    
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

        return `${VERCEL_DOMAIN}/?id=${sessionID}`;

    } catch (err) {
        console.error('[Uploader] Error:', err);
        throw err;
    }
}

module.exports = { uploadImage };