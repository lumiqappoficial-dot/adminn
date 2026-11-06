# Lumiq Admin — SPEC

Standalone admin panel in plain HTML + vanilla JS talking DIRECTLY to the user's Supabase project
(supabase-js v2 from CDN). Files: `frontend/public/lumiqadmin.html`, `frontend/public/lumiqadmin.js`.
`/` (React app) redirects to `/lumiqadmin.html` preserving query/hash (OAuth return).

## Config
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` constants at top of lumiqadmin.js (empty) → fallback
  `GET /api/supabase-config` (backend reads env `SUPABASE_URL`/`SUPABASE_ANON_KEY`; 503 if missing).
- Admin email: limberhuaychoquispe81@gmail.com. Google OAuth (PKCE), redirectTo = origin + /lumiqadmin.html.

## Flow
1. Login screen: only Google button → "Iniciando con Google…" → Google.
2. Return: rpc `obtener_mi_usuario`; `no_encontrado` → register form (nombre, numero required; admin email
   also needs apellido, fecha_nacimiento, genero, ubicacion, foto_perfil) → rpc `crear_mi_usuario`.
3. rpc `es_admin` → admin panel (Resumen, Códigos, Usuarios, Roles, Números, Celulares, Dispositivos CRUD,
   inline role change via `admin_cambiar_rol`) or limited view (Mi perfil via `actualizar_mi_usuario`,
   Mis números, Mis dispositivos read-only).
4. Códigos: numero rows + `admin_ver_codigo` per row; copy code / message / wa.me link; WhatsApp button.

## Data model
Supabase tables (not Mongo): numero, celular, dispositivos, roles, usuarios. See user SQL.
`supabase_fix_correo_admin.sql` fixes admin email mismatch inside crear_mi_usuario.

## Testing
Real Google login cannot be automated; only login screen + config endpoint are testable.
