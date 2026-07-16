import { supabase } from './supabaseClient.js';
import { appState } from './state.js';
import { showNotification } from './ui.js';
import { CALL_RING_TIMEOUT_MS } from './config.js';
import { notifyUserPush, showLocalNotification } from './push.js';

let callChannel = null;
let signalChannel = null;
let activeCall = null;
let ringTimer = null;
let pc = null;
let localStream = null;
let isCaller = false;

function $(id) { return document.getElementById(id); }

function ensureCallUi() {
    if ($('callOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'callOverlay';
    overlay.className = 'call-overlay hidden';
    overlay.innerHTML = `
      <div class="call-panel">
        <div id="callStatus" class="call-status">Appel…</div>
        <div id="callPeerName" class="call-peer"></div>
        <div class="call-videos hidden" id="callVideos">
          <video id="remoteVideo" autoplay playsinline></video>
          <video id="localVideo" autoplay playsinline muted></video>
        </div>
        <div id="dailyFrameWrap" class="daily-frame-wrap hidden"></div>
        <div class="call-actions" id="callActionsRinging">
          <button type="button" id="rejectCallBtn" class="danger">Refuser</button>
          <button type="button" id="acceptCallBtn">Accepter</button>
        </div>
        <div class="call-actions hidden" id="callActionsOutgoing">
          <button type="button" id="cancelCallBtn" class="danger">Annuler</button>
        </div>
        <div class="call-actions hidden" id="callActionsInCall">
          <button type="button" id="toggleMuteBtn" class="secondary">Muet</button>
          <button type="button" id="toggleCamBtn" class="secondary">Caméra</button>
          <button type="button" id="hangupCallBtn" class="danger">Raccrocher</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    $('acceptCallBtn').onclick = () => acceptIncomingCall();
    $('rejectCallBtn').onclick = () => rejectIncomingCall();
    $('cancelCallBtn').onclick = () => endCall('ended');
    $('hangupCallBtn').onclick = () => endCall('ended');
    $('toggleMuteBtn').onclick = toggleMute;
    $('toggleCamBtn').onclick = toggleCam;
}

function setCallPhase(phase) {
    ensureCallUi();
    const overlay = $('callOverlay');
    overlay.classList.remove('hidden');
    $('callActionsRinging').classList.toggle('hidden', phase !== 'incoming');
    $('callActionsOutgoing').classList.toggle('hidden', phase !== 'outgoing');
    $('callActionsInCall').classList.toggle('hidden', phase !== 'incall');
}

function hideCallUi() {
    const overlay = $('callOverlay');
    if (overlay) overlay.classList.add('hidden');
    $('callVideos')?.classList.add('hidden');
    $('dailyFrameWrap')?.classList.add('hidden');
    if ($('dailyFrameWrap')) $('dailyFrameWrap').innerHTML = '';
}

async function createRoom() {
    try {
        const res = await fetch('/.netlify/functions/create-call-room', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        if (!res.ok) throw new Error('room api failed');
        return await res.json();
    } catch (err) {
        console.warn('createRoom fallback webrtc', err);
        return {
            mode: 'webrtc',
            roomName: `getme-${Date.now()}`,
            roomUrl: null
        };
    }
}

async function cleanupMedia() {
    if (ringTimer) {
        clearTimeout(ringTimer);
        ringTimer = null;
    }
    if (signalChannel) {
        try { await supabase.removeChannel(signalChannel); } catch (_) {}
        signalChannel = null;
    }
    if (pc) {
        try { pc.close(); } catch (_) {}
        pc = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
    }
    const localVideo = $('localVideo');
    const remoteVideo = $('remoteVideo');
    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;
}

async function getMedia() {
    localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
    });
    const localVideo = $('localVideo');
    if (localVideo) localVideo.srcObject = localStream;
    return localStream;
}

function toggleMute() {
    if (!localStream) return;
    const track = localStream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    $('toggleMuteBtn').textContent = track.enabled ? 'Muet' : 'Son';
}

function toggleCam() {
    if (!localStream) return;
    const track = localStream.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    $('toggleCamBtn').textContent = track.enabled ? 'Caméra' : 'Cam off';
}

async function joinDaily(roomUrl) {
    $('callVideos').classList.add('hidden');
    const wrap = $('dailyFrameWrap');
    wrap.classList.remove('hidden');
    wrap.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.src = roomUrl;
    iframe.allow = 'camera; microphone; fullscreen; display-capture; autoplay';
    iframe.className = 'daily-iframe';
    wrap.appendChild(iframe);
}

async function setupWebRTC(callId, asCaller) {
    $('dailyFrameWrap').classList.add('hidden');
    $('callVideos').classList.remove('hidden');

    await getMedia();

    pc = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    });

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.ontrack = (ev) => {
        const remoteVideo = $('remoteVideo');
        if (remoteVideo) remoteVideo.srcObject = ev.streams[0];
    };

    signalChannel = supabase.channel(`call-signal-${callId}`, {
        config: { broadcast: { self: false } }
    });

    pc.onicecandidate = (ev) => {
        if (ev.candidate) {
            signalChannel.send({
                type: 'broadcast',
                event: 'ice',
                payload: { candidate: ev.candidate, from: appState.user.id }
            });
        }
    };

    signalChannel.on('broadcast', { event: 'ice' }, async ({ payload }) => {
        if (!pc || !payload?.candidate) return;
        if (payload.from === appState.user.id) return;
        try {
            await pc.addIceCandidate(payload.candidate);
        } catch (err) {
            console.warn('ice', err);
        }
    });

    signalChannel.on('broadcast', { event: 'sdp' }, async ({ payload }) => {
        if (!pc || !payload?.sdp) return;
        if (payload.from === appState.user.id) return;
        try {
            await pc.setRemoteDescription(payload.sdp);
            if (payload.sdp.type === 'offer') {
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                signalChannel.send({
                    type: 'broadcast',
                    event: 'sdp',
                    payload: { sdp: pc.localDescription, from: appState.user.id }
                });
            }
        } catch (err) {
            console.warn('sdp', err);
        }
    });

    await new Promise((resolve) => {
        signalChannel.subscribe((status) => {
            if (status === 'SUBSCRIBED') resolve();
        });
    });

    // Wait until peer is on the signal channel (callee ready)
    if (asCaller) {
        await new Promise((resolve) => {
            const t = setTimeout(resolve, 1200);
            signalChannel.on('broadcast', { event: 'ready' }, () => {
                clearTimeout(t);
                resolve();
            });
        });
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        signalChannel.send({
            type: 'broadcast',
            event: 'sdp',
            payload: { sdp: pc.localDescription, from: appState.user.id }
        });
    } else {
        signalChannel.send({
            type: 'broadcast',
            event: 'ready',
            payload: { from: appState.user.id }
        });
    }
}

async function enterCallMedia(call) {
    $('callStatus').textContent = 'En communication';
    setCallPhase('incall');
    if (call.mode === 'daily' && call.room_url) {
        await joinDaily(call.room_url);
    } else {
        await setupWebRTC(call.id, isCaller);
    }
}

export async function startVideoCall(peerId, peerName) {
    if (!appState.user) {
        showNotification('Connectez-vous pour appeler', true);
        return;
    }
    if (!peerId) return;
    if (activeCall) {
        showNotification('Un appel est déjà en cours', true);
        return;
    }

    ensureCallUi();
    isCaller = true;
    $('callPeerName').textContent = peerName || 'Contact';
    $('callStatus').textContent = 'Appel en cours…';
    setCallPhase('outgoing');

    try {
        const room = await createRoom();
        const { data: call, error } = await supabase.from('calls').insert({
            caller_id: appState.user.id,
            callee_id: peerId,
            status: 'ringing',
            mode: room.mode || 'webrtc',
            room_name: room.roomName,
            room_url: room.roomUrl
        }).select('*').single();

        if (error) throw error;
        activeCall = call;

        // Notify callee (push + local if they have app open elsewhere)
        notifyUserPush(peerId, {
            title: 'Appel Getme',
            message: `${peerName || 'Quelqu\'un'} vous appelle`,
            url: '/?call=' + call.id,
            tag: 'getme-call',
            data: { type: 'call', callId: call.id }
        });

        ringTimer = setTimeout(() => {
            if (activeCall?.status === 'ringing') endCall('missed');
        }, CALL_RING_TIMEOUT_MS);

        // Watch for accept/reject
        subscribeCallRow(call.id);
    } catch (err) {
        console.error('startVideoCall:', err);
        hideCallUi();
        activeCall = null;
        const msg = (err.message || '').includes('calls')
            ? 'Table calls manquante — exécutez supabase-calls-push.sql'
            : 'Impossible de démarrer l\'appel';
        showNotification(msg, true);
    }
}

function subscribeCallRow(callId) {
    const ch = supabase
        .channel(`call-row-${callId}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'calls',
            filter: `id=eq.${callId}`
        }, async (payload) => {
            const call = payload.new;
            activeCall = call;
            if (call.status === 'accepted') {
                if (ringTimer) { clearTimeout(ringTimer); ringTimer = null; }
                try {
                    await enterCallMedia(call);
                } catch (err) {
                    console.error(err);
                    showNotification('Caméra/micro refusés ou indisponibles', true);
                    endCall('ended');
                }
            } else if (['ended', 'missed', 'rejected'].includes(call.status)) {
                await cleanupMedia();
                hideCallUi();
                activeCall = null;
                if (call.status === 'rejected') showNotification('Appel refusé');
                if (call.status === 'missed') showNotification('Appel manqué');
                supabase.removeChannel(ch);
            }
        })
        .subscribe();
}

async function acceptIncomingCall() {
    if (!activeCall || !appState.user) return;
    isCaller = false;
    try {
        const { data, error } = await supabase.from('calls').update({
            status: 'accepted',
            answered_at: new Date().toISOString()
        }).eq('id', activeCall.id).select('*').single();
        if (error) throw error;
        activeCall = data;
        await enterCallMedia(data);
    } catch (err) {
        console.error(err);
        showNotification('Impossible d\'accepter l\'appel', true);
    }
}

async function rejectIncomingCall() {
    await endCall('rejected');
}

export async function endCall(status = 'ended') {
    const call = activeCall;
    await cleanupMedia();
    hideCallUi();
    activeCall = null;
    if (call?.id && appState.user) {
        try {
            await supabase.from('calls').update({
                status,
                ended_at: new Date().toISOString()
            }).eq('id', call.id);
        } catch (err) {
            console.warn(err);
        }
    }
}

function showIncoming(call, callerName) {
    ensureCallUi();
    activeCall = call;
    isCaller = false;
    $('callPeerName').textContent = callerName || 'Appel entrant';
    $('callStatus').textContent = 'Appel entrant…';
    setCallPhase('incoming');
    showNotification('Appel entrant');
    showLocalNotification('Appel Getme', {
        body: `${callerName || 'Quelqu\'un'} vous appelle`,
        tag: 'getme-call',
        force: true,
        data: { type: 'call', callId: call.id }
    });
    subscribeCallRow(call.id);
    ringTimer = setTimeout(() => {
        if (activeCall?.id === call.id && activeCall.status === 'ringing') {
            endCall('missed');
        }
    }, CALL_RING_TIMEOUT_MS);
}

export async function initCallListeners(userId) {
    if (!userId) return;
    ensureCallUi();

    if (callChannel) {
        try { await supabase.removeChannel(callChannel); } catch (_) {}
        callChannel = null;
    }

    callChannel = supabase
        .channel(`calls-inbox-${userId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'calls',
            filter: `callee_id=eq.${userId}`
        }, async (payload) => {
            const call = payload.new;
            if (!call || call.status !== 'ringing') return;
            if (activeCall) return;

            let callerName = 'Quelqu\'un';
            try {
                const { data } = await supabase
                    .from('profiles')
                    .select('username')
                    .eq('id', call.caller_id)
                    .maybeSingle();
                if (data?.username) callerName = data.username;
            } catch (_) {}

            showIncoming(call, callerName);
        })
        .subscribe();
}

export async function stopCallListeners() {
    await endCall('ended');
    if (callChannel) {
        try { await supabase.removeChannel(callChannel); } catch (_) {}
        callChannel = null;
    }
}

/** Used by chat header button */
export function bindCallButton(peerId, peerName) {
    const btn = $('startCallBtn');
    if (!btn) return;
    btn.classList.remove('hidden');
    btn.onclick = () => startVideoCall(peerId, peerName);
}
