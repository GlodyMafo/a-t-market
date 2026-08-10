from patchright.sync_api import (
    sync_playwright,
    BrowserContext,
    Playwright,
)


class BrowserService:
    """
    Browser Factory optimisé pour le scraping anti-bot (Alibaba/Baxia).
    """

    def __init__(self):
        self.playwright: Playwright | None = None
        self.context: BrowserContext | None = None

    def start(self):
        if self.context:
            return

        self.playwright = sync_playwright().start()

        # 1. Utilisation de launch_persistent_context pour simuler un vrai navigateur avec cache/cookies
        # 2. Emploi du mode headless "new" (--headless=new) qui utilise le vrai moteur de rendu Chromium
        self.context = self.playwright.chromium.launch_persistent_context(
            user_data_dir="./browser_profile",  # Conserve le stockage local et les cookies
            headless=True,
            args=[
                "--headless=new",  # Masquage headless moderne (évite la plupart des détections)
                "--disable-dev-shm-usage",
                "--no-sandbox",
                "--disable-blink-features=AutomationControlled",  # Masque explicitement l'automation
                "--start-maximized",
            ],
            # User-Agent récent et cohérent
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/125.0.0.0 Safari/537.36"
            ),
            locale="fr-FR",
            viewport={"width": 1440, "height": 900},
            timezone_id="Africa/Lubumbashi",
            color_scheme="light",
            ignore_https_errors=True,
            java_script_enabled=True,
            accept_downloads=True,
            # Ajout d'en-têtes Sec-CH-UA réalistes
            extra_http_headers={
                "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
                "Sec-Ch-Ua": '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
                "Sec-Ch-Ua-Mobile": "?0",
                "Sec-Ch-Ua-Platform": '"Windows"',
            },
        )

        # Patch JavaScript au chargement de chaque page pour éliminer le drapeau automation
        self.context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
        """)

        self.context.set_default_timeout(60000)
        self.context.set_default_navigation_timeout(90000)

    def new_page(self):
        if self.context is None:
            raise RuntimeError(
                "BrowserService.start() doit être appelé avant new_page()."
            )

        page = self.context.new_page()
        return page

    def stop(self):
        try:
            if self.context:
                self.context.close()
            if self.playwright:
                self.playwright.stop()
        finally:
            self.context = None
            self.playwright = None
            

