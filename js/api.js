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
        const fileName = `${userId}_${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
        await this.updateProfile(userId, { avatar_url: publicUrl });
        return publicUrl;
    },

    async listOwnPhotos(userId) {
        const { data, error } = await supabase
            .from('profile_photos')
            .select('*')
            .eq('user_id', userId)
            .order('sort_order', { ascending: true });
        if (error) throw error;
        return data || [];
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
        const header = await authHeader();
        if (!header) throw new Error('Non connecté');
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
