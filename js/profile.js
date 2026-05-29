import { supabase } from './supabaseClient.js';
import { appState, updateBalance } from './state.js';
import { api } from './api.js';
import { UNLOCK_COST } from './config.js';
import { validateUsername, compressImage } from './utils.js';
import { showNotification } from './ui.js';
import { loadNearbyUsers } from './map.js';

let pendingTransaction = null;

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
    const balance = await refreshBalance();
    if (balance < UNLOCK_COST) {
        showNotification(`Solde insuffisant. Besoin de ${UNLOCK_COST} FCFA`, true);
        return;
    }
    
    if (!confirm(`Débloquer ${targetName} pour ${UNLOCK_COST} FCFA ?`)) return;
    
    const success = await api.unlockUser(appState.user.id, targetId, UNLOCK_COST);
    
    if (!success) {
        showNotification("Erreur lors du déblocage", true);
        return;
    }
    
    await refreshBalance();
    showNotification(`✅ ${targetName} débloqué !`);
    loadNearbyUsers();
}

export async function rechargeAccount() {
    const amount = parseInt(document.getElementById('rechargeAmount').value);
    const phone = document.getElementById('profilePhone').value;
    
    if (!phone) {
        showNotification("Ajoutez votre numéro Orange Money", true);
        return;
    }
    
    if (!amount || amount < 100) {
        showNotification("Montant minimum: 100 FCFA", true);
        return;
    }
    
    // Générer un code unique
    const transactionCode = `NR${Date.now()}${Math.floor(Math.random() * 1000)}`;
    
    // Afficher les instructions
    const rechargeDiv = document.getElementById('rechargeCode');
    rechargeDiv.innerHTML = `
        <div style="background:#0f172a; padding:16px; border-radius:16px; margin-top:12px;">
            <p style="font-weight:bold; margin-bottom:12px;">📱 Instructions Orange Money :</p>
            <ol style="margin-left:20px; margin-bottom:12px;">
                <li>Composez <strong>#144#</strong></li>
                <li>Sélectionnez "Envoyer de l'argent"</li>
                <li>Numéro : <strong>+226XXXXXXXX</strong></li>
                <li>Montant : <strong>${amount} FCFA</strong></li>
                <li>Référence : <strong>${transactionCode}</strong></li>
            </ol>
            <button id="checkSmsBtn" style="background:#22c55e;">📲 Vérifier mon SMS</button>
            <button id="manualCodeBtn" style="background:#475569; margin-top:8px;">✏️ Saisir le code manuellement</button>
            <p style="font-size:11px; margin-top:12px; color:#94a3b8;">🔐 L'application lira automatiquement votre SMS de confirmation</p>
        </div>
    `;
    
    pendingTransaction = { amount, phone, transactionCode };
    
    document.getElementById('checkSmsBtn')?.addEventListener('click', checkSms);
    document.getElementById('manualCodeBtn')?.addEventListener('click', showManualInput);
}

async function checkSms() {
    showNotification("🔍 Lecture du dernier SMS...");
    
    // Méthode 1 : API SMS (Android Chrome uniquement)
    if (navigator.sms) {
        try {
            const sms = await navigator.sms.getSms();
            const lastSms = sms[sms.length - 1];
            
            if (lastSms && lastSms.body.includes('Orange Money')) {
                const result = parseSms(lastSms.body);
                if (result && result.amount === pendingTransaction.amount) {
                    await validatePayment(result.transactionId, result.amount);
                    return;
                }
            }
        } catch (err) {
            console.log("Erreur lecture SMS:", err);
        }
    }
    
    // Méthode 2 : Demander à l'utilisateur de coller le SMS
    showManualInput();
}

function showManualInput() {
    const rechargeDiv = document.getElementById('rechargeCode');
    rechargeDiv.innerHTML += `
        <div style="margin-top:12px;">
            <input type="text" id="smsCode" placeholder="Code de transaction" style="width:100%; margin-bottom:8px;">
            <textarea id="smsFull" placeholder="Ou collez tout le SMS reçu" rows="3" style="width:100%; margin-bottom:8px;"></textarea>
            <button id="validateManualBtn" style="background:#22c55e;">✅ Valider</button>
        </div>
    `;
    
    document.getElementById('validateManualBtn')?.addEventListener('click', () => {
        const code = document.getElementById('smsCode')?.value;
        const fullText = document.getElementById('smsFull')?.value;
        const textToParse = fullText || code;
        
        if (textToParse) {
            const result = parseSms(textToParse);
            if (result) {
                validatePayment(result.transactionId, result.amount);
            } else {
                showNotification("SMS non reconnu", true);
            }
        }
    });
}

function parseSms(smsText) {
    // Exemple: "Vous avez reçu 1000 FCFA de +22670123456. Ref: OMPAY123456"
    const amountMatch = smsText.match(/reçu (\d+) FCFA/);
    const transactionMatch = smsText.match(/Ref:? ?(\w+)/i);
    
    if (amountMatch) {
        return {
            amount: parseInt(amountMatch[1]),
            transactionId: transactionMatch ? transactionMatch[1] : Date.now().toString()
        };
    }
    return null;
}

async function validatePayment(transactionId, amount) {
    showNotification("✅ Paiement vérifié !");
    
    // Créditer l'utilisateur
    const { error } = await supabase.rpc('credit_balance', {
        user_id: appState.user.id,
        amount: amount
    });
    
    if (error) {
        showNotification("Erreur technique", true);
        return;
    }
    
    // Enregistrer la transaction
    await supabase.from('transactions').insert({
        user_id: appState.user.id,
        amount: amount,
        transaction_id: transactionId,
        status: 'confirmed'
    });
    
    await refreshBalance();
    showNotification(`💰 ${amount} FCFA ajoutés !`);
    
    // Réinitialiser
    document.getElementById('rechargeCode').innerHTML = '';
    pendingTransaction = null;
}
