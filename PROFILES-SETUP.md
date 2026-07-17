# Getme — Profils, photos & confidentialité

## 1. Exécuter le SQL

Dans **Supabase → SQL Editor**, exécuter :

`CREATE_PROFILES_PHOTOS.sql`

Cela ajoute :
- colonnes `age`, `gender`, `city`, `photo_visibility`, `banned` sur `profiles`
- table `profile_photos`
- table `photo_access_requests`
- table `reports` / `blocks` (+ RPC `block_user`)
- bucket Storage privé `profile-photos`

## 2. Variables Netlify (photos privées)

Pour les signed URLs (`/api/photo-url`) :

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY` (ou `NEXT_PUBLIC_SUPABASE_ANON_KEY`)

Sans service role, le propriétaire voit toujours ses photos (via Storage own policy) ; les autres ne peuvent pas contourner la confidentialité côté Storage.

## 3. Visibilité des photos

| Mode | Comportement |
|------|----------------|
| `public` | Visible pour les comptes connectés (via API signed URL) |
| `private` | Visible uniquement par le propriétaire |
| `on_request` | Visible après approbation d’une demande d’accès |

## 4. Formats & limites (client)

- Formats : JPG, PNG, WEBP
- Taille max avant compression : **5 Mo**
- Compression automatique → JPEG ~1200px / qualité 0.75
- Galerie : jusqu’à **9** photos
