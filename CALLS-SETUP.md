# Appels vidéo + notifications Getme

## Ce qui est en place

- **Appel vidéo simple 1–1** depuis le chat (bouton **Appel**)
  - Par défaut : **WebRTC** (fonctionne sans clé externe)
  - Avec `DAILY_API_KEY` : **Daily.co** (meilleure qualité, prêt pour les appels de groupe plus tard)
- **Notifications**
  - Toast + badge dans l’app
  - Notification navigateur locale (onglet en arrière-plan)
  - **Web Push** (app fermée) si VAPID + Supabase service role sont configurés

Les **appels multi / groupe** viendront ensuite (Daily `max_participants`).

## 1) SQL Supabase (obligatoire — sinon « table calls manquante »)

1. Ouvrez [Supabase Dashboard](https://supabase.com/dashboard) → votre projet  
2. Menu **SQL** → **New query**  
3. Ouvrez le fichier **`CREATE_CALLS.sql`** du dépôt, copiez tout  
4. Collez dans l’éditeur → cliquez **Run**  
5. Vous devez voir : `OK — table calls prête`

Sans cette étape, le bouton **Appel** ne peut pas fonctionner.

## 2) Notifications push (Netlify env — ne jamais committer les secrets)

Dans **Netlify → Site settings → Environment variables**, ajoutez :

| Variable | Où la trouver |
|---|---|
| `VAPID_PUBLIC_KEY` | Même valeur que `VAPID_PUBLIC_KEY` dans `js/config.js` |
| `VAPID_PRIVATE_KEY` | Générer avec `npx web-push generate-vapid-keys` (ne pas mettre dans Git) |
| `VAPID_SUBJECT` | ex. `mailto:votre@email.com` |
| `SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé **service_role** Supabase (Dashboard → Settings → API) |

> Si vous régénérez les clés VAPID, mettez à jour **à la fois** `js/config.js` (public) et la variable Netlify `VAPID_PRIVATE_KEY` (privée).

Puis dans l’app : **Profil → Activer les notifications**.

### Générer des clés VAPID localement

```bash
npx web-push generate-vapid-keys
```

Copiez la **public key** dans `js/config.js` et la **private key** uniquement dans Netlify.

## 3) Daily.co (optionnel mais recommandé)

1. Créez un compte sur [daily.co](https://www.daily.co/)
2. Copiez l’API key
3. Ajoutez sur Netlify : `DAILY_API_KEY` (jamais dans le code)
4. Redéployez

Sans Daily, les appels 1–1 marchent déjà en WebRTC.

## Utilisation

1. Ouvrir une conversation
2. Appuyer sur **Appel**
3. L’autre personne voit l’appel entrant (+ notification si autorisée)
4. Accepter → vidéo / audio
5. Raccrocher

## SMS / messages

Ici « SMS » = **messages Getme** (pas SMS téléphonique).  
Les messages déclenchent toast + push (si configuré).  
Les vrais SMS téléphoniques (Orange/Wave) restent sur le webhook paiement.
