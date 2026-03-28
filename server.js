const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const TD_URL = 'http://127.0.0.1:8080';

// App state
let selectedPhotos = [];
let currentSessionID = "";

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Initialize session
    socket.on('user_clicked_start', async () => {
        currentSessionID = `ssn_${Date.now()}`;
        selectedPhotos = [];
        console.log(`Starting session: ${currentSessionID}`);
        try {
            await axios.post(`${TD_URL}/start_session`, { sessionID: currentSessionID });
            io.emit('status_update', { message: 'Ready', state: 2, kept: 0 });
        } catch (e) { console.log("Error contacting TD"); }
    });

    // User clicks TAKE PHOTO
    socket.on('trigger_shot', async () => {
        console.log('Triggering countdown');
        await axios.post(`${TD_URL}/start_countdown`);
    });

    // User clicks STOP & SAVE
    socket.on('user_clicked_stop', async () => {
        console.log('Stop and save requested');
        await axios.post(`${TD_URL}/stop_and_save`);
    });

    // User choice: KEEP
    socket.on('choice_keep', async (data) => {
        selectedPhotos.push(data.filename);
        console.log(`Photo kept: ${data.filename}. Total: ${selectedPhotos.length}/4`);

        if (selectedPhotos.length >= 4) {
            // All 4 photos are collected
            io.emit('status_update', { message: 'Processing final collage...', kept: 4, state: 1 });
            console.log('Session complete. List:', selectedPhotos);
            // Trigger synthesis here
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
        await axios.post(`${TD_URL}/reset`);
        io.emit('status_update', { message: 'Reset done', state: 2, kept: 0 });
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