# Getme — Corrections appliquées

## ✅ Corrigé (passe check & correct)

1. **GPS Stop/Start** — le bouton « Arrêter » n'apparaissait jamais : `.hidden { display:none !important }` écrasait `style.display`. Utilisation de `classList` partout.
2. **Service Worker** — enregistrement manquant ; le bouton 🔄 vider le cache n'était pas câblé. Les deux sont branchés.
3. **Notifications chat globales** — `subscribeToGlobalMessages()` est appelée après login (auparavant définie mais jamais utilisée).
4. **Loaders** — `saveProfileBtn` et `sendMsgBtn` utilisent `withLoading` pendant les actions async.
5. **Carte / nearby** — `loadNearbyUsers()` gère les erreurs réseau ; popup « Profil » ouvre vraiment le profil (avant : doublon Message/Discuter) ; blocage via modale custom.
6. **Chat** — `startChat()` bascule automatiquement sur l'onglet Messages ; gestion d'erreurs sur chargement/envoi.
7. **Profil** — gestion d'erreurs sur save/upload/balance ; `reportUser` tente d'écrire dans `reports` avec fallback.
8. **Auth** — logs debug retirés ; logout ne réinitialise plus le thème ; validation MDP min 6 caractères.
9. **utils.compressImage** — early-return manquant (risque de double resolve).
10. **API.py** — import manquant de `SMSParser` depuis `ParseurSMS`.
11. **manifest.json** — renommé Nearby → Getme ; couleurs alignées.
12. **Thème clair** — header/tabs sticky et modales respectent les variables light.

## ⚠️ Pas encore fait (nécessite Supabase)

- Table `reports` + champ `banned` / RPC admin pour l'onglet Admin.
- Vérification RLS côté tableau de bord Supabase.
- Pagination / clustering si beaucoup d'utilisateurs à proximité.

## Déploiement

1. Pousse ces fichiers et redéploie Netlify.
2. Vérifie les tables : `profiles`, `locations`, `messages`, `unlocks` (+ optionnel `reports`, `transactions`).
3. Après déploiement, vide le cache (bouton 🔄) ou hard-refresh pour charger `sw.js` v3.2.0.
