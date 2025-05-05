// Audio setup
const beepSound = new Audio('static/assets/beep.mp3');
let beepInterval;

// Global variables
let peerConnection = null;
let dataChannel = null;
let timerInterval = null;
let seconds = 0;
let isConnected = false;

// DOM elements
const ringBox = document.getElementById('ringBox');
const callButton = document.getElementById('callButton');
const endCallBtn = document.getElementById('endCallBtn');
const callStatus = document.querySelector('.call-status');
const timer = document.querySelector('.timer');

// Initialize timer display
timer.style.display = 'none';

async function startCall() {
    ringBox.style.display = 'block';
    callStatus.textContent = 'Ringing...';
    startBeeping();
    await initOpenAIRealtime();
}

function startBeeping() {
    beepSound.play();
    beepInterval = setInterval(() => {
        beepSound.play();
    }, 3000);
}

function stopBeeping() {
    clearInterval(beepInterval);
}

const fns = {
    changeBackgroundColor: ({ color1, color2 }) => {
        ringBox.style.background = `linear-gradient(135deg, ${color1} 0%, ${color2} 100%)`;
        return { success: true, color1, color2 };
    },
    fetchFromSena: async ({ query }) => {
        try {
            const res = await fetch(`/search-sena?q=${encodeURIComponent(query)}`);
            const data = await res.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Search failed');
            }
            
            // Format results for voice response
            return {
                success: true,
                summary: data.results[0]?.snippet || 'No results found',
                details: data.results
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
};

async function initOpenAIRealtime() {
    try {
        const tokenResponse = await fetch("/session");
        const data = await tokenResponse.json();
        const EPHEMERAL_KEY = data.client_secret.value;

        peerConnection = new RTCPeerConnection();

        peerConnection.onconnectionstatechange = () => {
            if (peerConnection.connectionState === 'connected') {
                stopBeeping();
                isConnected = true;
                callStatus.textContent = 'Connected';
                timer.style.display = 'block';
                startTimer();
                endCallBtn.style.display = 'block';
            }
        };

        const audioElement = document.createElement("audio");
        audioElement.autoplay = true;
        peerConnection.ontrack = event => {
            audioElement.srcObject = event.streams[0];
        };

        const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        peerConnection.addTrack(mediaStream.getTracks()[0]);

        dataChannel = peerConnection.createDataChannel('response');

        function configureData() {
            const event = {
                type: 'session.update',
                session: {
                    modalities: ['text', 'audio'],
                    tools: [
                        {
                            type: 'function',
                            name: 'changeBackgroundColor',
                            description: 'Changes the background gradient of the calling interface',
                            parameters: {
                                type: 'object',
                                properties: {
                                    color1: { type: 'string' },
                                    color2: { type: 'string' }
                                },
                                required: ['color1', 'color2']
                            }
                        },
                        {
                            type: 'function',
                            name: 'fetchFromSena',
                            description: 'Fetches data from the Sena services, with fallback to cricket results',
                            parameters: {
                                type: 'object',
                                properties: {
                                    query: { type: 'string' }
                                },
                                required: ['query']
                            }
                        }
                    ]
                }
            };
            dataChannel.send(JSON.stringify(event));
        }

        dataChannel.addEventListener('open', () => {
            console.log('Data channel opened');
            configureData();
        });

        dataChannel.addEventListener('message', async (ev) => {
            try {
                const msg = JSON.parse(ev.data);
                if (msg.type === 'response.function_call_arguments.done') {
                    const fn = fns[msg.name];
                    if (fn) {
                        const args = JSON.parse(msg.arguments);
                        const result = await fn(args);
                        const responseEvent = {
                            type: 'conversation.item.create',
                            item: {
                                type: 'function_call_output',
                                call_id: msg.call_id,
                                output: JSON.stringify(result)
                            }
                        };
                        dataChannel.send(JSON.stringify(responseEvent));
                    }
                }
            } catch (error) {
                console.error('Function execution error:', error);
            }
        });

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        const apiUrl = "https://api.openai.com/v1/realtime";
        const model = "gpt-4o-realtime-preview-2024-12-17";

        const sdpResponse = await fetch(`${apiUrl}?model=${model}`, {
            method: "POST",
            body: offer.sdp,
            headers: {
                Authorization: `Bearer ${EPHEMERAL_KEY}`,
                "Content-Type": "application/sdp"
            }
        });

        const answer = {
            type: "answer",
            sdp: await sdpResponse.text()
        };
        await peerConnection.setRemoteDescription(answer);

    } catch (error) {
        console.error("Connection error:", error);
        endCall();
    }
}

function startTimer() {
    seconds = 0;
    timerInterval = setInterval(() => {
        seconds++;
        timer.textContent = formatTime(seconds);
    }, 1000);
}

function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatCallSummary(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `Call Duration: ${hrs > 0 ? `${hrs}h ` : ''}${mins > 0 ? `${mins}m ` : ''}${secs}s`;
}

function endCall() {
    stopBeeping();
    stopTimer();

    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    if (isConnected) {
        callStatus.textContent = formatCallSummary(seconds);
        setTimeout(() => {
            ringBox.style.display = 'none';
            callButton.style.display = 'block';
            callStatus.textContent = 'Ready to call';
        }, 3000);
    }

    isConnected = false;
}

function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    seconds = 0;
}

callButton.addEventListener('click', startCall);
endCallBtn.addEventListener('click', endCall);
