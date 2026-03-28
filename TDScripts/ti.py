import requests

def onDone(timerOp, segment, interrupt):
    # Transition to Recording state (Shutter Open)
    print("Shutter open")
    op('state_holder').par.value0 = 0
    
    # Notify Node.js to update UI
    url = 'http://127.0.0.1:5000/td_recording_started' 
    try:
        requests.post(url, json={'status': 'recording'})
    except:
        pass
    return