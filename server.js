const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const { generateFinalCollage } = require('./composer');

const TD_URL = 'http://127.0.0.1:8080';

// App state
let selectedPhotos = [];
let currentSessionID = "";

app.use(express.json());
app.use('/sessions', express.static(path.join(__dirname, 'sessions')));
app.use(express.static(path.join(__dirname, 'public')));

async function systemFullReset() {
    console.log("--- 完全重置 ---");
    selectedPhotos = [];
    const randomStr = Math.random().toString(36).substring(2, 10);
    currentSessionID = `ssn_${Date.now()}_${randomStr}`; // 時間戳 + 隨機字串，防止掃描

    try {
        // 通知 TD 停止所有動作並回到待機
        await axios.post(`${TD_URL}/reset`, { sessionID: currentSessionID });
        console.log("TD Reset Success");
    } catch (e) {
        console.error("TD Reset Failed (Is TD running?)");
    }
}

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Initialize session
    socket.on('user_clicked_start', async () => {
        await systemFullReset();
        io.emit('status_update', { message: 'Ready for new session', state: 2, kept: 0 });
    });

    // User clicks TAKE PHOTO
    socket.on('trigger_shot', async () => {
        console.log('Triggering countdown');
        try {
            await axios.post(`${TD_URL}/start_countdown`);
        } catch (e) {
            console.error('TD error:', e.response?.status);
        }
    });

    // User clicks STOP & SAVE
    socket.on('user_clicked_stop', async () => {
        console.log('Stop and save requested');
        try {
            await axios.post(`${TD_URL}/stop_and_save`);
        } catch (e) {
            console.error('TD error:', e.response?.status);
        }
    });

    // User choice: KEEP
    socket.on('choice_keep', async (data) => {
        selectedPhotos.push(data.filename);
        console.log(`Photo kept: ${data.filename}. Total: ${selectedPhotos.length}/4`);

        if (selectedPhotos.length >= 4) {
            // All 4 photos are collected
            io.emit('status_update', { message: 'Processing final collage...', kept: 4, state: 1 });
            console.log('Session complete. List:', selectedPhotos);
            try {
                // 執行合成與上傳
                const result = await generateFinalCollage(currentSessionID, selectedPhotos);

                // 告訴前端完成，並傳送下載 URL 供生成 QR Code
                io.emit('status_update', {
                    message: 'Finished',
                    state: 5,
                    finalUrl: result.publicUrl
                });
            } catch (e) {
                io.emit('status_update', { message: 'Composition Failed', state: 2 });
            }
        } else {
            // Return to IDLE to wait for next trigger
            io.emit('status_update', { message: `Keep success! ${selectedPhotos.length}/4`, state: 2, kept: selectedPhotos.length });
            // Reset TD backend to idle state
            try {
                await axios.post(`${TD_URL}/ready_for_next_attempt`);
            } catch (e) { console.log("Error notifying TD for next attempt"); }
        }
    });

    // User choice: RETAKE
    socket.on('choice_retake', async () => {
        console.log('User chose to retake');
        io.emit('status_update', { message: 'Retake! Try again.', state: 2, kept: selectedPhotos.length });
        // Reset TD backend to idle state
        try {
            await axios.post(`${TD_URL}/ready_for_next_attempt`);
        } catch (e) { console.log("Error notifying TD for next attempt"); }
    });

    socket.on('user_clicked_reset', async () => {
        await systemFullReset();
        io.emit('status_update', { message: 'System Reset Done', state: 2, kept: 0 });
    });

    socket.on('user_clicked_finish_early', async () => {
        if (selectedPhotos.length === 0) return;

        console.log(`Finish early requested. Current count: ${selectedPhotos.length}`);
        io.emit('status_update', { message: 'Finishing with current shots...', state: 1 });

        // 核心邏輯：如果不足 4 張，循環填充
        const originalCount = selectedPhotos.length;
        while (selectedPhotos.length < 4) {
            // 例如只有 2 張 [A, B]，補齊後變成 [A, B, A, B]
            selectedPhotos.push(selectedPhotos[selectedPhotos.length % originalCount]);
        }

        try {
            const result = await generateFinalCollage(currentSessionID, selectedPhotos);
            io.emit('status_update', {
                message: 'Finished',
                state: 5,
                result: result
            });
        } catch (e) {
            console.error(e);
            io.emit('status_update', { message: 'Composition Failed', state: 2 });
        }
    });
});

// TD Webhooks
app.post('/td_recording_started', (req, res) => {
    io.emit('status_update', { message: 'DRAW NOW!', state: 0 });
    res.send('ok');
});

app.post('/td_preview_ready', (req, res) => {
    // Show KEEP/RETAKE UI on frontend
    io.emit('status_update', {
        message: 'Review your shot',
        state: 4,
        currentFile: req.body.filename
    });
    res.send('ok');
});

const PORT = 5000;
server.listen(PORT, () => console.log(`Server running: http://localhost:${PORT}`));