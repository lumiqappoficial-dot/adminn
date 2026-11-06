# Lumiq Admin

Panel de administración en HTML y JavaScript puro, conectado a Supabase.

- `frontend/public/lumiqadmin.html`: la página del panel.
- `frontend/public/lumiqadmin.js`: la lógica del panel. Pega tu URL y tu anon key de Supabase al inicio de este archivo.
- `supabase_fix_correo_admin.sql`: la corrección del correo admin. Ejecútalo en el SQL Editor de Supabase.
- `frontend/`: la app de React (Vite). En `/` te redirige a `/lumiqadmin.html`.
- `backend/`: FastAPI y MongoDB (opcional). Solo sirve `/api/supabase-config`, que le pasa tu URL y tu anon key de Supabase al panel.

## 1. Configurar Supabase en lumiqadmin.js
```js
const SUPABASE_URL = "https://TU-PROYECTO.supabase.co";   // solo el dominio, sin /auth/v1/...
const SUPABASE_ANON_KEY = "TU_ANON_KEY";
```
La anon key es pública: está pensada para usarse en el navegador.

## 2. Ejecutarlo en GitHub Codespaces (la "terminal de GitHub")
1. Abre tu repositorio en github.com y pulsa **Code → Codespaces → Create codespace on main**.
2. Se abre VS Code en el navegador. Abre la terminal con **Ctrl + `** (o el menú ☰ → Terminal → New Terminal).
3. Ejecuta:
   ```bash
   cd frontend
   npm install -g yarn      # solo si el comando "yarn" no existe
   yarn install
   yarn dev
   ```
4. Aparece un aviso de que el puerto **3000** está abierto. Pulsa **Open in Browser**. La dirección es parecida a `https://<nombre>-3000.app.github.dev`.
5. Agrega esa dirección en Supabase, en **Authentication → URL Configuration → Redirect URLs**:
   `https://<nombre>-3000.app.github.dev/lumiqadmin.html`

## 3. Ejecutarlo en tu PC
```bash
cd frontend
yarn install
yarn dev        # http://localhost:3000  ->  /lumiqadmin.html
```
En Supabase, en Redirect URLs, agrega `http://localhost:3000/lumiqadmin.html`.

## 4. Backend (opcional)
Solo lo necesitas si no quieres poner las claves de Supabase dentro de `lumiqadmin.js`.
```bash
cd backend
cp .env.example .env     # completa los valores
pip install fastapi uvicorn motor python-dotenv
uvicorn server:app --port 8001 --reload
```

## 5. Sin React
`lumiqadmin.html` y `lumiqadmin.js` también funcionan solos, en cualquier hosting estático como GitHub Pages, Netlify o Vercel. Súbelos juntos a la misma carpeta y pon las claves en el JS.

## Requisito en Supabase
Activa Google en **Authentication → Providers → Google**, con tu Client ID y tu Client Secret de Google Cloud.
