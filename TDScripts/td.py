import json
import requests
import os
import time

# Global variables for session management
current_session_path = ""
attempt_count = 0 

def onHTTPRequest(webServerDAT, request, response):
    global current_session_path, attempt_count

    # --- 0. GET Test (Browser check) ---
    if request['method'] == 'GET' and request['uri'] == '/':
        target_fps = root.time.rate
        actual_fps = round(project.cookRate, 2)
        
        current_state = int(op('state_holder')['state'].eval())
        captured = attempt_count
        
        # Map state numbers to human-readable text
        state_map = {
            0: "RECORDING (Shutter Open)", 
            1: "FINISHED", 
            2: "IDLE", 
            3: "COUNTDOWN", 
            4: "REVIEWING"
        }
        state_text = state_map.get(current_state, "UNKNOWN")
        
        # Build JSON response
        response_data = {
            "system_state": state_text,
            "progress": {
                "captured": captured,
                "total": 4
            },
            "performance": {
                "actual_fps": actual_fps,
                "target_fps": target_fps,
                "low_fps_warning": actual_fps < (target_fps - 5)
            }
        }
        
        response['statusCode'] = 200
        response['statusReason'] = 'OK'
        response['data'] = response_data
        response['Content-Type'] = 'application/json; charset=utf-8'
        
        return response
    
    # --- 2. Start Countdown (2 -> 3) ---
    elif request['method'] == 'POST' and request['uri'] == '/start_countdown':
        print("Starting countdown sequence")
        op('state_holder').par.value0 = 3 # Countdown state
        op('timer_countdown').par.start.pulse()
        
        response['statusCode'] = 200
        return response
        
    # --- 3. Stop & Save (0 -> 4) ---
    elif request['method'] == 'POST' and request['uri'] == '/stop_and_save':
        op('state_holder').par.value0 = 1

        print(current_session_path)
        if not os.path.exists(current_session_path):
            os.makedirs(current_session_path)

        attempt_count += 1
        filename = f"raw_{attempt_count}.png"
        filepath = f"{current_session_path}/{filename}"
        
        # Save current frame
        run("me.module.do_delayed_save(args[0], args[1], args[2])", 
            filepath, filename, attempt_count, delayFrames=2)
        
        print(f"Saving scheduled in 2 frames...")
        
        response['statusCode'] = 200
        response['data'] = json.dumps({"filename": filename})
        return response

    # --- 4. System Reset ---
    elif request['method'] == 'POST' and request['uri'] == '/reset':

        try:
            data = json.loads(request['data']) if request['data'] else {}
            session_id = data.get('sessionID', 'default')
        except:
            session_id = 'error_default'
        
        # Create unique folder for this session
        current_session_path = f"{project.folder}/sessions/{session_id}"
        attempt_count = 0 
        
        op('state_holder').par.value0 = 2
        op('timer_countdown').par.initialize.pulse()

        print(f"System reset / New session started: {session_id}")
        
        response['statusCode'] = 200
        response['data'] = json.dumps({
            "message": "Reset and Init done",
            "path": current_session_path
        })
        return response

    # --- 5. Ready for Next Attempt (Keep/Retake cleanup) ---
    elif request['method'] == 'POST' and request['uri'] == '/ready_for_next_attempt':
        print("Ready for next attempt - resetting to idle state")
        op('state_holder').par.value0 = 2  # Back to idle
        response['statusCode'] = 200
        return response

    return response

def notify_preview(index, filename):
    # Tell Node.js which file to show for the Keep/Retake choice
    url = 'http://127.0.0.1:5000/td_preview_ready'
    try:
        requests.post(url, json={'index': index, 'filename': filename})
    except:
        pass

def do_delayed_save(filepath, filename, index):
    # 這裡才是真正的存檔動作
    op('final_render').save(filepath)
    print(f"Delayed Save Done: {filepath}")
    
    # 存檔完成後，才發送 Webhook 通知 Node.js
    notify_preview(index, filename)