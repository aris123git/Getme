import { supabase } from './main.js';
import { retry } from './utils.js';

export const api = {
    // Profil
    async getProfile(userId) {
        return retry(() => supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single());
    },
    
    async updateProfile(userId, data) {
        return retry(() => supabase
            .from('profiles')
            .update(data)
            .eq('id', userId));
    },
    
    async updateBalance(userId) {
        const { data } = await this.getProfile(userId);
        return data?.balance || 0;
    },
    
    // Localisation
    async updateLocation(userId, lat, lng) {
        return retry(() => supabase
            .from('locations')
            .upsert({
                user_id: userId,
                lat: lat,
                lng: lng,
                updated_at: new Date()
            }));
    },
    
    async getUserLocation(userId) {
        const { data } = await retry(() => supabase
            .from('locations')
            .select('lat, lng')
            .eq('user_id', userId)
            .maybeSingle());
        return data;
    },
    
    // Utilisateurs proches
    async getNearbyUsers(userLat, userLng, radius, currentUserId) {
        const { data, error } = await supabase.rpc('get_nearby_users', {
            user_lat: userLat,
            user_lng: userLng,
            radius_km: radius,
            current_user_id: currentUserId
        });
        if (error) throw error;
        return data || [];
    },
    
    // Déblocage
    async unlockUser(buyerId, targetId, cost) {
        const { data, error } = await supabase.rpc('unlock_user', {
            buyer_id: buyerId,
            target_id: targetId,
            cost: cost
        });
        if (error) throw error;
        return data;
    },
    
    // Messages
    async getConversations(userId) {
        const { data, error } = await supabase.rpc('get_conversations', {
            user_id: userId
        });
        if (error) throw error;
        return data || [];
    },
    
    async getMessages(userId, otherId, limit = 100) {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .or(`and(sender_id.eq.${userId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${userId})`)
            .order('created_at', { ascending: true })
            .limit(limit);
        if (error) throw error;
        return data || [];
    },
    
    async sendMessage(senderId, receiverId, message) {
        const { data, error } = await supabase
            .from('messages')
            .insert({
                sender_id: senderId,
                receiver_id: receiverId,
                message: message
            })
            .select();
        if (error) throw error;
        return data;
    },
    
    async markMessagesAsRead(userId, otherId) {
        return supabase
            .from('messages')
            .update({ read: true })
            .eq('sender_id', otherId)
            .eq('receiver_id', userId);
    },
    
    // Upload avatar
    async uploadAvatar(userId, file) {
        const fileName = `${userId}_${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(fileName, file);
        if (uploadError) throw uploadError;
        
        const { data: { publicUrl } } = supabase.storage
            .from('avatars')
            .getPublicUrl(fileName);
        
        await this.updateProfile(userId, { avatar_url: publicUrl });
        return publicUrl;
    }
};