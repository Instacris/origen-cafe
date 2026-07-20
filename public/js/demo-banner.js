/* ============================================================
   ORIGEN Café · Aviso de modo demostración (para el portafolio)

   La tienda funciona 100% en el navegador de cada visitante
   (localStorage): los cambios de una persona no los ve nadie más
   ni afectan la versión original. Este aviso lo deja claro y
   permite reiniciar la tienda a su estado de fábrica.
   ============================================================ */
(function () {
  "use strict";

  /* Borra todo lo de la demo (claves que empiezan con "origen_") */
  function reiniciar() {
    try {
      Object.keys(localStorage)
        .filter(function (k) { return /^origen_/.test(k); })
        .forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) { /* sin storage: nada que borrar */ }
    location.reload();
  }

  function montar() {
    if (document.querySelector(".demo-banner")) return;

    var st = document.createElement("style");
    st.textContent =
      ".demo-banner{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:9999;" +
      "display:flex;align-items:center;gap:12px;max-width:calc(100vw - 24px);" +
      "padding:9px 10px 9px 15px;border-radius:999px;background:#2a1b10;color:#f3e9dd;" +
      "font-size:13px;font-weight:500;box-shadow:0 12px 30px -10px rgba(0,0,0,.5);" +
      "border:1px solid rgba(255,255,255,.12);font-family:inherit;}" +
      ".demo-banner b{color:#d9a05f;font-weight:700;}.demo-banner .dm-txt{opacity:.88;}" +
      ".demo-banner button{border:0;cursor:pointer;border-radius:999px;padding:7px 14px;" +
      "font:inherit;font-weight:600;background:#a05c2c;color:#fff;white-space:nowrap;" +
      "transition:background .18s cubic-bezier(.23,1,.32,1),transform .15s cubic-bezier(.23,1,.32,1);}" +
      ".demo-banner button:hover{background:#7e4620;}.demo-banner button:active{transform:scale(.96);}" +
      "@media (max-width:560px){.demo-banner .dm-txt{display:none;}}";
    document.head.appendChild(st);

    var b = document.createElement("div");
    b.className = "demo-banner";
    b.innerHTML =
      '<span>🔎</span>' +
      '<span class="dm-txt"><b>MODO DEMO</b> · los cambios se guardan solo en este navegador</span>' +
      '<button type="button">↺ Reiniciar</button>';
    document.body.appendChild(b);
    b.querySelector("button").addEventListener("click", reiniciar);
  }

  if (document.readyState !== "loading") montar();
  else document.addEventListener("DOMContentLoaded", montar);
})();
