export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Team Chtaw</title>
    <link rel="icon" href="/favicon.ico?v=team-chtaw-3" sizes="16x16 32x32 48x48" />
    <link rel="icon" href="/favicon-32x32.png?v=team-chtaw-3" type="image/png" sizes="32x32" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #fafafa; color: #111; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #4b5563; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #111; color: #fff; }
      .secondary { background: #fff; color: #111; border-color: #d1d5db; }
    </style>
  </head>
  <body>
    <div class="card">
      <nav aria-label="Langue / Language"><button type="button" onclick="setSiteLanguage('fr')">FR</button> <button type="button" onclick="setSiteLanguage('en')">EN</button></nav>
      <h1 data-fr="Cette page n’a pas pu être chargée" data-en="This page could not be loaded">Cette page n’a pas pu être chargée</h1>
      <p data-fr="Vous pouvez réessayer ou revenir à l’accueil." data-en="You can try again or return to the home page.">Vous pouvez réessayer ou revenir à l’accueil.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()" data-fr="Réessayer" data-en="Try again">Réessayer</button>
        <a class="secondary" href="/" data-fr="Retour à l’accueil" data-en="Back to home">Retour à l’accueil</a>
      </div>
    </div>
  </body>
  <script>
    window.setSiteLanguage = function(language) {
      language = language === 'en' ? 'en' : 'fr';
      document.documentElement.lang = language;
      document.querySelectorAll('[data-fr]').forEach(function(element) { element.textContent = element.getAttribute('data-' + language); });
      try { localStorage.setItem('chtaw-language', language); } catch (error) {}
    };
    var selected = 'fr';
    try { selected = new URLSearchParams(location.search).get('lang') || localStorage.getItem('chtaw-language'); } catch (error) {}
    window.setSiteLanguage(selected);
  </script>
</html>`;
}
