// The admin panel is a standalone static page (public/lumiqadmin.html + lumiqadmin.js).
// Redirect there, keeping ?code= / #access_token so the Supabase OAuth return still works.
const target = "/lumiqadmin.html" + window.location.search + window.location.hash;
window.location.replace(target);

export default function Home() {
  return (
    <div style={{ minHeight: "100vh", background: "#0B0D17", color: "#C7D2FE", display: "grid", placeItems: "center", fontFamily: "system-ui" }}>
      <a href={target} data-testid="redirect-lumiqadmin-link" style={{ color: "#A5B4FC" }}>Abrir Lumiq Admin…</a>
    </div>
  );
}
