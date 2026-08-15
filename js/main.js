// La Clef Provençale — comportements communs à toutes les pages

document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.getElementById('nav-toggle');
  var nav = document.getElementById('main-nav');
  if (toggle && nav) {
    var closeMenu = function () {
      nav.classList.remove('open');
      document.body.classList.remove('nav-open');
      var icon = toggle.querySelector('i');
      icon.classList.remove('fa-xmark');
      icon.classList.add('fa-bars');
      toggle.setAttribute('aria-label', 'Ouvrir le menu');
    };
    var openMenu = function () {
      nav.classList.add('open');
      document.body.classList.add('nav-open');
      var icon = toggle.querySelector('i');
      icon.classList.remove('fa-bars');
      icon.classList.add('fa-xmark');
      toggle.setAttribute('aria-label', 'Fermer le menu');
    };

    toggle.addEventListener('click', function () {
      if (nav.classList.contains('open')) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    // Ferme le menu mobile après un clic sur un lien
    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', closeMenu);
    });

    // Ferme le menu si on repasse en affichage desktop (resize)
    window.addEventListener('resize', function () {
      if (window.innerWidth > 900) {
        closeMenu();
      }
    });
  }
});
