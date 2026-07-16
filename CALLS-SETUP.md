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

## 1) SQL Supabase (obligatoire)

Dans le SQL Editor Supabase, exécutez le fichier :

`supabase-calls-push.sql`

Cela crée `calls`, `push_subscriptions`, RLS et Realtime.

## 2) Notifications push (Netlify env)

Clés déjà générées pour ce projet :

| Variable Netlify | Valeur |
|---|---|
| `VAPID_PUBLIC_KEY` | `BH6Wak_No7bHeOwCwAYqKjmxA8RMgWYqXiYlXFcGFBq5OHX3Njjm2t5UqHAkYGgXFEYzGyoa5CYW4b5g4d9eU1c` |
| `VAPID_PRIVATE_KEY` | `rhRlOTcfsdMT-VZztEKXZR4EBDFOzzFg6prLMfc20YQ` |
| `VAPID_SUBJECT` | `mailto:votre@email.com` |
| `SUPABASE_URL` | `https://nuijvjnufnaodwtrhjuq.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | *(clé service role Supabase — secrète)* |

Puis dans l’app : **Profil → Activer les notifications**.

## 3) Daily.co (optionnel mais recommandé)

1. Créez un compte sur [daily.co](https://www.daily.co/)
2. Copiez l’API key
3. Ajoutez sur Netlify : `DAILY_API_KEY=...`
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
