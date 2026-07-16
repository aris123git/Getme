const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

function getSupabaseAdmin() {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders(), body: '' };
    }
    if (event.httpMethod !== 'POST') {
        return json(405, { error: 'Method not allowed' });
    }

    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || 'mailto:admin@getme.app';

    if (!publicKey || !privateKey) {
        return json(503, {
            error: 'VAPID keys missing',
            hint: 'Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Netlify env'
        });
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);

    try {
        const body = JSON.parse(event.body || '{}');
        const { userId, title, message, url, tag, data } = body;
        if (!userId || !title) {
            return json(400, { error: 'userId and title required' });
        }

        const supabase = getSupabaseAdmin();
        if (!supabase) {
            return json(503, {
                error: 'Supabase admin not configured',
                hint: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
            });
        }

        const { data: subs, error } = await supabase
            .from('push_subscriptions')
            .select('*')
            .eq('user_id', userId);

        if (error) throw error;
        if (!subs?.length) {
            return json(200, { sent: 0, message: 'No subscriptions' });
        }

        const payload = JSON.stringify({
            title,
            body: message || '',
            url: url || '/',
            tag: tag || 'getme',
            data: data || {}
        });

        let sent = 0;
        const stale = [];
        await Promise.all(subs.map(async (sub) => {
            try {
                await webpush.sendNotification(
                    {
                        endpoint: sub.endpoint,
                        keys: { p256dh: sub.p256dh, auth: sub.auth }
                    },
                    payload
                );
                sent += 1;
            } catch (err) {
                console.warn('push fail', err.statusCode || err.message);
                if (err.statusCode === 404 || err.statusCode === 410) {
                    stale.push(sub.id);
                }
            }
        }));

        if (stale.length) {
            await supabase.from('push_subscriptions').delete().in('id', stale);
        }

        return json(200, { sent, stale: stale.length });
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
