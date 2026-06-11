import { supabase } from './supabaseClient.js';
import { appState, updateBalance } from './state.js';
import { api } from './api.js';
import { UNLOCK_COST } from './config.js';
import { validateUsername, compressImage } from './utils.js';
import { showNotification } from './ui.js';
import { loadNearbyUsers } from './map.js';

export async function updateProfile() {
    const username = document.getElementById('profileName').value.trim();
    if (!username) {
        showNotification("Nom d'utilisateur requis", true);
        return;
    }
    
    if (!validateUsername(username)) {
        showNotification("Username: 3-30 caractères, lettres/chiffres/_", true);
        return;
    }
    
    await api.updateProfile(appState.user.id, {
        username: username,
        bio: document.getElementById('profileBio').value,
        phone: document.getElementById('profilePhone').value
    });
    
    showNotification("Profil mis à jour !");
    document.getElementById('userName').innerText = username;
}

export async function uploadAvatar(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
        showNotification("Fichier trop gros (max 2MB)", true);
        return;
    }
    
    const compressed = await compressImage(file);
    const url = await api.uploadAvatar(appState.user.id, compressed);
    document.getElementById('profileAvatar').innerHTML = `<img src="${url}">`;
    showNotification("Photo mise à jour !");
    loadNearbyUsers();
}

export async function refreshBalance() {
    const { data: profile } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', appState.user.id)
        .single();
    
    const balance = profile?.balance || 0;
    updateBalance(balance);
    document.getElementById('userBalance').innerHTML = `💰 ${balance} FCFA`;
    document.getElementById('balanceDisplay').innerHTML = balance;
    return balance;
}

export async function unlockUser(targetId, targetName) {
    // Mode test : pas de vérification de solde
    // const balance = await refreshBalance();
    // if (balance < UNLOCK_COST) {
    //     showNotification(`Solde insuffisant. Besoin de ${UNLOCK_COST} FCFA`, true);
    //     return;
    // }
    
    if (!confirm(`Débloquer ${targetName} gratuitement ? (Mode test)`)) return;
    
    // Vérifier si déjà débloqué
    const { data: existing } = await supabase
        .from('unlocks')
        .select('id')
        .eq('buyer_id', appState.user.id)
        .eq('target_id', targetId)
        .maybeSingle();
    
    if (existing) {
        showNotification("Déjà débloqué !");
        return;
    }
    
    // Enregistrer le déblocage (gratuit)
    const { error } = await supabase.from('unlocks').insert({ 
        buyer_id: appState.user.id, 
        target_id: targetId 
    });
    
    if (error) {
        showNotification("Erreur technique", true);
        console.error(error);
        return;
    }
    
    showNotification(`✅ ${targetName} débloqué gratuitement (mode test)`);
    
    // Rafraîchir la liste des personnes proches
    loadNearbyUsers();
}

export async function rechargeAccount() {
    const amount = parseInt(document.getElementById('rechargeAmount').value);
    const phone = document.getElementById('profilePhone').value;
    
    if (!phone) {
        showNotification("Ajoutez votre numéro de téléphone dans votre profil", true);
        return;
    }
    
    if (!amount || amount < 100) {
        showNotification("Montant minimum: 100 FCFA", true);
        return;
    }
    
    // Afficher les instructions de paiement
    const rechargeDiv = document.getElementById('rechargeCode');
    rechargeDiv.innerHTML = `
        <div style="background:#0f172a; padding:16px; border-radius:16px; margin-top:12px;">
            <p style="font-weight:bold; margin-bottom:12px;">📱 Instructions de paiement Orange Money :</p>
            <ol style="margin-left:20px; margin-bottom:12px; line-height:1.8;">
                <li>Composez <strong>#144#</strong> sur votre téléphone</li>
                <li>Sélectionnez <strong>"Envoyer de l'argent"</strong></li>
                <li>Entrez le numéro : <strong>+226XXXXXXXXX</strong> (notre compte)</li>
                <li>Montant : <strong>${amount} FCFA</strong></li>
                <li>Confirmez le paiement</li>
            </ol>
            <p style="font-size:13px; color:#22c55e; background:#1e293b; padding:10px; border-radius:12px;">
                ✅ Une fois votre paiement effectué, votre compte sera automatiquement crédité sous 1 minute.
            </p>
            <p style="font-size:11px; margin-top:12px; color:#94a3b8;">
                📞 En cas de problème, contactez le support avec votre numéro de transaction.
            </p>
        </div>
    `;
    
    showNotification("Instructions affichées - Effectuez le paiement", false);
}
