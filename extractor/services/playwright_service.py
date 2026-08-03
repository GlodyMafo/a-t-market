from services.browser import BrowserService


class PlaywrightService:

    def __init__(self):

        self.browser_service = BrowserService()

        self.page = None

    def open(
        self,
        url: str,
        timeout: int = 60000
    ):

        self.browser_service.start()

        self.page = (
            self.browser_service
            .new_page()
        )

        self.page.goto(
            url,
            wait_until="domcontentloaded",
            timeout=timeout
        )

        self.page.wait_for_timeout(3000)

        return self.page

    def get_page(self):
        return self.page

    def close(self):

        self.browser_service.stop()