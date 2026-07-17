import { supabase } from './supabaseClient.js';
import { retry } from './utils.js';

async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;
    return `Bearer ${session.access_token}`;
}

export const api = {
    async getProfile(userId) {
        return retry(() => supabase.from('profiles').select('*').eq('id', userId).single());
    },
    async updateProfile(userId, data) {
        return retry(() => supabase.from('profiles').update(data).eq('id', userId));
    },
    async upsertProfile(userId, data) {
        return retry(() => supabase.from('profiles').upsert({ id: userId, ...data }));
    },
    async updateLocation(userId, lat, lng) {
        return retry(() => supabase.from('locations').upsert({ user_id: userId, lat, lng, updated_at: new Date() }));
    },
    async getNearbyUsers(userLat, userLng, radius, currentUserId) {
        const { data, error } = await supabase.rpc('get_nearby_users', {
            user_lat: userLat, user_lng: userLng, radius_km: radius, current_user_id: currentUserId
        });
        if (error) throw error;
        return data || [];
    },
    async getConversations(userId) {
        const { data, error } = await supabase.rpc('get_conversations', { user_id: userId });
        if (error) throw error;
        return data || [];
    },
    async getMessages(userId, otherId, limit = 100) {
        const { data, error } = await supabase.from('messages').select('*')
            .or(`and(sender_id.eq.${userId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${userId})`)
            .order('created_at', { ascending: true }).limit(limit);
        if (error) throw error;
        return data || [];
    },
    async sendMessage(senderId, receiverId, message) {
        const { data, error } = await supabase.from('messages').insert({ sender_id: senderId, receiver_id: receiverId, message }).select();
        if (error) throw error;
        return data;
    },
    async markMessagesAsRead(userId, otherId) {
        return supabase.from('messages').update({ read: true }).eq('sender_id', otherId).eq('receiver_id', userId);
    },
    async uploadAvatar(userId, file) {
        // Folder = user id → matches Storage RLS policies
        const fileName = `${userId}/${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file, {
            contentType: 'image/jpeg',
            upsert: true
        });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
        const { error: profileErr } = await this.updateProfile(userId, { avatar_url: publicUrl });
        if (profileErr) {
            // Profile row may not exist yet — try upsert
            const { error: upsertErr } = await this.upsertProfile(userId, { avatar_url: publicUrl });
            if (upsertErr) throw upsertErr;
        }
        return publicUrl;
    },

    async listPhotos(userId) {
        const { data, error } = await supabase
            .from('profile_photos')
            .select('id, user_id, storage_path, sort_order, created_at')
            .eq('user_id', userId)
            .order('sort_order', { ascending: true });
        if (error) throw error;
        return data || [];
    },

    /** @deprecated use listPhotos */
    async listOwnPhotos(userId) {
        return this.listPhotos(userId);
    },

    async uploadGalleryPhoto(userId, file, sortOrder = 0) {
        const path = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
        const { error: uploadError } = await supabase.storage
            .from('profile-photos')
            .upload(path, file, { contentType: 'image/jpeg', upsert: false });
        if (uploadError) throw uploadError;

        const { data, error } = await supabase.from('profile_photos').insert({
            user_id: userId,
            storage_path: path,
            sort_order: sortOrder
        }).select().single();
        if (error) {
            await supabase.storage.from('profile-photos').remove([path]);
            throw error;
        }
        return data;
    },

    async deleteGalleryPhoto(userId, photo) {
        if (!photo?.id) return;
        const { error } = await supabase.from('profile_photos').delete().eq('id', photo.id).eq('user_id', userId);
        if (error) throw error;
        if (photo.storage_path) {
            await supabase.storage.from('profile-photos').remove([photo.storage_path]);
        }
    },

    async fetchPhotoUrls(ownerId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Non connecté');

        const { data: profile } = await this.getProfile(ownerId);
        const visibility = profile?.photo_visibility || 'public';
        const isOwner = user.id === ownerId;

        if (!isOwner && visibility === 'private') {
            const err = new Error('Photos masquées');
            err.code = 'PHOTOS_HIDDEN';
            throw err;
        }
        if (!isOwner && visibility === 'on_request') {
            const status = await this.getAccessStatus(ownerId, user.id);
            if (status !== 'approved') {
                const err = new Error('Photos masquées');
                err.code = 'PHOTOS_HIDDEN';
                throw err;
            }
        }

        // Prefer client-side signed URLs (needs Storage SELECT policy)
        try {
            const photos = await this.listPhotos(ownerId);
            const urls = [];
            for (const photo of photos) {
                const { data: signed, error: signErr } = await supabase.storage
                    .from('profile-photos')
                    .createSignedUrl(photo.storage_path, 3600);
                if (!signErr && signed?.signedUrl) {
                    urls.push({ id: photo.id, url: signed.signedUrl, sort_order: photo.sort_order });
                }
            }
            if (urls.length || photos.length === 0) return urls;
        } catch (clientErr) {
            console.warn('client photo urls:', clientErr);
        }

        // Fallback: Netlify admin signed URLs
        const header = await authHeader();
        if (!header) {
            const err = new Error('Photos masquées');
            err.code = 'PHOTOS_HIDDEN';
            throw err;
        }
        const res = await fetch('/api/photo-url', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: header
            },
            body: JSON.stringify({ ownerId })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(body.error || 'Accès photos refusé');
            err.code = body.code || res.status;
            throw err;
        }
        return body.urls || [];
    },

    async requestPhotoAccess(ownerId, requesterId) {
        const { data, error } = await supabase.from('photo_access_requests').upsert({
            owner_id: ownerId,
            requester_id: requesterId,
            status: 'pending',
            updated_at: new Date().toISOString()
        }, { onConflict: 'owner_id,requester_id' }).select().maybeSingle();
        if (error) throw error;
        return data;
    },

    async getIncomingAccessRequests(ownerId) {
        const { data, error } = await supabase
            .from('photo_access_requests')
            .select('id, requester_id, status, created_at')
            .eq('owner_id', ownerId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async respondAccessRequest(requestId, ownerId, status) {
        const { error } = await supabase
            .from('photo_access_requests')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', requestId)
            .eq('owner_id', ownerId);
        if (error) throw error;
    },

    async getAccessStatus(ownerId, requesterId) {
        const { data, error } = await supabase
            .from('photo_access_requests')
            .select('status')
            .eq('owner_id', ownerId)
            .eq('requester_id', requesterId)
            .maybeSingle();
        if (error) throw error;
        return data?.status || null;
    },

    async getReports() {
        return retry(() => supabase
            .from('reports')
            .select('id, reporter_id, reported_id, reason, status, created_at')
            .order('created_at', { ascending: false })
            .limit(50));
    }
};
