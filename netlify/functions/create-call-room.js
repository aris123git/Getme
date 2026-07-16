const fetch = globalThis.fetch;

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: corsHeaders(),
            body: ''
        };
    }
    if (event.httpMethod !== 'POST') {
        return json(405, { error: 'Method not allowed' });
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const roomName = body.roomName || `getme-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const dailyKey = process.env.DAILY_API_KEY;

        // No Daily key yet → client falls back to simple 1-1 WebRTC
        if (!dailyKey) {
            return json(200, {
                mode: 'webrtc',
                roomName,
                roomUrl: null,
                message: 'Daily non configuré — appel WebRTC 1-1'
            });
        }

        const res = await fetch('https://api.daily.co/v1/rooms', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${dailyKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: roomName,
                properties: {
                    exp: Math.floor(Date.now() / 1000) + 60 * 60,
                    enable_chat: false,
                    start_video_off: false,
                    start_audio_off: false,
                    max_participants: 2 // simple 1-1 for now; raise later for group
                }
            })
        });

        const data = await res.json();
        if (!res.ok) {
            console.error('Daily error', data);
            // Fallback so calls still work
            return json(200, {
                mode: 'webrtc',
                roomName,
                roomUrl: null,
                warning: data?.info || data?.error || 'Daily room failed'
            });
        }

        return json(200, {
            mode: 'daily',
            roomName: data.name,
            roomUrl: data.url
        });
    } catch (err) {
        console.error(err);
        return json(500, { error: err.message });
    }
};

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };
}

function json(statusCode, body) {
    return {
        statusCode,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        body: JSON.stringify(body)
    };
}
