# Getme — Auth Supabase & emails

Si l’inscription « marche » mais **aucun email n’arrive**, ou si la connexion dit **email not confirmed**, ce n’est en général **pas** un bug du front seul : c’est la config Auth / SMTP du projet Supabase.

## Checklist dashboard (obligatoire)

Ouvre [Supabase Dashboard](https://supabase.com/dashboard) → projet Getme → **Authentication**.

### 1. URL Configuration (`Authentication` → `URL Configuration`)

| Réglage | Valeur |
|--------|--------|
| **Site URL** | l’URL Netlify de prod, ex. `https://votresite.netlify.app` (pas `http://localhost:3000`) |
| **Redirect URLs** | ajoute la même URL + `https://votresite.netlify.app/**` |

Sans ça, le lien dans l’email renvoie vers localhost / une page morte.

### 2. Confirm email (`Authentication` → `Providers` → Email)

- **Confirm email = ON** (recommandé en prod) → l’utilisateur doit cliquer le mail avant de se connecter.
- **Confirm email = OFF** → connexion immédiate après signup (pratique en test seulement).

L’app gère les deux cas : avec confirmation, le profil est recréé depuis `user_metadata` au premier login.

### 3. Envoi d’emails (le vrai problème fréquent)

Le SMTP intégré Supabase est **limité** (rate limit) et souvent classé en **spam**.

Pour la prod :

1. `Project Settings` → `Auth` → **SMTP Settings**
2. Active **Custom SMTP** (Resend, Brevo, Mailgun, Amazon SES, etc.)
3. Remplis host / port / user / password / sender email

Sans SMTP custom, beaucoup d’utilisateurs **ne reçoivent jamais** le mail de confirmation.

### 4. Templates email

`Authentication` → `Email Templates` :

- **Confirm signup** : le lien doit utiliser `{{ .ConfirmationURL }}` (template par défaut OK).
- **Reset password** : idem.

### 5. Tester

1. Créer un compte avec une vraie boîte mail.
2. Vérifier **Auth → Users** : l’utilisateur apparaît.
3. Vérifier boîte + **spam**.
4. Si rien : onglet Auth logs / rate limit, puis SMTP custom.
5. Sur l’app : bouton **Renvoyer l’email de confirmation**.

## Ce que le code fait maintenant

- `emailRedirectTo` / `redirectTo` → retour sur l’URL du site
- Message clair si email non confirmé / rate limit / SMTP
- Bouton **Renvoyer l’email de confirmation**
- **Mot de passe oublié** + écran nouveau mot de passe (`PASSWORD_RECOVERY`)
- Si signup sans session (confirm email ON) : profil créé au premier login via `user_metadata`

## Option test rapide

Pour développer sans emails :

1. Désactive **Confirm email**
2. Ou confirme manuellement l’utilisateur dans `Authentication` → `Users` → … → Confirm user
