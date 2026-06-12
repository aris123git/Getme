import { supabase } from './supabaseClient.js';

async function login() {
    const email = document.getElementById('email').value;
    const pwd = document.getElementById('password').value;
    const { error, data } = await supabase.auth.signInWithPassword({ email, password: pwd });
    if (error) {
        alert("Erreur: " + error.message);
        return;
    }
    alert("Connecté !");
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('mainScreen').classList.remove('hidden');
}

async function signUp() {
    const email = document.getElementById('email').value;
    const pwd = document.getElementById('password').value;
    const { error } = await supabase.auth.signUp({ email, password: pwd });
    if (error) {
        alert("Erreur: " + error.message);
        return;
    }
    alert("Compte créé ! Connectez-vous");
}

document.getElementById('loginBtn').onclick = login;
document.getElementById('signupBtn').onclick = signUp;
