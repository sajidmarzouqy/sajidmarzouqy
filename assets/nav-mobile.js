/* =====================================================================
   nav-mobile.js — Menu burger universel
   Injecte un bouton burger dans la nav et transforme le menu existant
   en panneau déroulant sur mobile/tablette. Aucun markup à modifier
   dans les pages : il suffit d'inclure ce script.
   ===================================================================== */
(function () {
    function init() {
        var navContent = document.querySelector('nav .nav-content') || document.querySelector('nav');
        if (!navContent) return;
        var menu = navContent.querySelector('.menu') || document.querySelector('nav .menu');
        if (!menu || navContent.querySelector('.nav-burger')) return;

        var btn = document.createElement('button');
        btn.className = 'nav-burger';
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Ouvrir le menu');
        btn.setAttribute('aria-expanded', 'false');
        btn.innerHTML = '<i class="fas fa-bars"></i>';
        navContent.appendChild(btn);

        function setIcon(open) {
            btn.innerHTML = open ? '<i class="fas fa-times"></i>' : '<i class="fas fa-bars"></i>';
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            btn.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
        }
        function close() { menu.classList.remove('open'); setIcon(false); }
        function toggle(e) { e.stopPropagation(); setIcon(menu.classList.toggle('open')); }

        btn.addEventListener('click', toggle);
        menu.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', close); });

        document.addEventListener('click', function (e) {
            if (menu.classList.contains('open') && !menu.contains(e.target) && !btn.contains(e.target)) close();
        });
        window.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
        window.addEventListener('resize', function () { if (window.innerWidth > 1024) close(); });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
