// uploader.js
const fs = require('fs');
const path = require('path');

/**
 * 待實現的上傳組件
 * @param {string} sessionID 
 * @param {Buffer} buffer 圖片二進位資料
 * @returns {Promise<string>} 傳回圖片網址
 */
async function uploadImage(sessionID, buffer) {
    return `/sessions/${sessionID}/collage.jpg`;
}

module.exports = { uploadImage };