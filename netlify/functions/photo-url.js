const { createClient } = require('@supabase/supabase-js');

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };
}

function json(status, body) {
    return {
        statusCode: status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        body: JSON.stringify(body)
    };
}

function getSupabaseAdmin() {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
}

function getSupabaseUser(authHeader) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon || !authHeader?.startsWith('Bearer ')) return null;
    return createClient(url, anon, {
        global: { headers: { Authorization: authHeader } }
    });
}

async function canViewPhotos(admin, viewerId, ownerId) {
    if (viewerId === ownerId) return true;
    const { data: profile } = await admin
        .from('profiles')
        .select('photo_visibility, banned')
        .eq('id', ownerId)
        .maybeSingle();
    if (!profile || profile.banned) return false;
    if (profile.photo_visibility === 'public') return true;
    if (profile.photo_visibility === 'private') return false;
    if (profile.photo_visibility === 'on_request') {
        const { data: req } = await admin
            .from('photo_access_requests')
            .select('status')
            .eq('owner_id', ownerId)
            .eq('requester_id', viewerId)
            .maybeSingle();
        return req?.status === 'approved';
    }
    return false;
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders(), body: '' };
    }
    if (event.httpMethod !== 'POST') {
        return json(405, { error: 'Method not allowed' });
    }

    const admin = getSupabaseAdmin();
    if (!admin) {
        return json(503, {
            error: 'Supabase admin missing',
            hint: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
        });
    }

    try {
        const authHeader = event.headers.authorization || event.headers.Authorization || '';
        const userClient = getSupabaseUser(authHeader);
        if (!userClient) return json(401, { error: 'Unauthorized' });

        const { data: { user }, error: userErr } = await userClient.auth.getUser();
        if (userErr || !user) return json(401, { error: 'Unauthorized' });

        const body = JSON.parse(event.body || '{}');
        const ownerId = body.ownerId || body.userId;
        const photoId = body.photoId || null;
        if (!ownerId) return json(400, { error: 'ownerId required' });

        const allowed = await canViewPhotos(admin, user.id, ownerId);
        if (!allowed) {
            return json(403, { error: 'Photos masquées', code: 'PHOTOS_HIDDEN' });
        }

        let query = admin
            .from('profile_photos')
            .select('id, storage_path, sort_order, created_at')
            .eq('user_id', ownerId)
            .order('sort_order', { ascending: true });
        if (photoId) query = query.eq('id', photoId);

        const { data: photos, error: photosErr } = await query;
        if (photosErr) throw photosErr;
        if (!photos?.length) return json(200, { urls: [] });

        const urls = [];
        for (const photo of photos) {
            const { data: signed, error: signErr } = await admin.storage
                .from('profile-photos')
                .createSignedUrl(photo.storage_path, 3600);
            if (signErr) {
                console.warn('signErr', photo.id, signErr.message);
                continue;
            }
            urls.push({
                id: photo.id,
                url: signed.signedUrl,
                sort_order: photo.sort_order
            });
        }

        return json(200, { urls, ownerId });
    } catch (err) {
        console.error('photo-url:', err);
        return json(500, { error: err.message || 'Server error' });
    }
};
