import { supabase } from './supabaseClient.js';
import { retry } from './utils.js';

export const api = {
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
    
    async getNearbyUsers(userLat, userLng, radius, currentUserId) {
        const { data, error } = await supabase.rpc('get_nearby_users', {
            user_lat: userLat,
            user_lng: userLng,
            radius_km: radius,
            current_user_id: currentUserId
        });
        if (error) throw error;
        return data ||
