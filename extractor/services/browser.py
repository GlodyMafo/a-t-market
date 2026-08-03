from playwright.sync_api import sync_playwright


class BrowserService:

    def __init__(self):

        self.playwright = None
        self.browser = None
        self.context = None

    def start(self):

        if self.browser:
            return

        self.playwright = sync_playwright().start()

        self.browser = self.playwright.chromium.launch(
            headless=True
        )

        self.context = self.browser.new_context(
            locale="fr-FR",
            viewport={
                "width": 1440,
                "height": 900
            },
            user_agent=(
                "Mozilla/5.0 "
                "(Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 "
                "(KHTML, like Gecko) "
                "Chrome/138.0 Safari/537.36"
            )
        )

    def new_page(self):

        if not self.context:
            raise RuntimeError(
                "BrowserService non démarré"
            )

        return self.context.new_page()

    def stop(self):

        try:

            if self.context:
                self.context.close()

            if self.browser:
                self.browser.close()

            if self.playwright:
                self.playwright.stop()

        finally:

            self.context = None
            self.browser = None
            self.playwright = None