from playwright.sync_api import Page

from services.browser import BrowserService


class PlaywrightService:

    def __init__(self):

        self.browser = BrowserService()

        self.page: Page | None = None

    def open(

        self,

        url: str,

        timeout: int = 90000,

        wait_until: str = "domcontentloaded",

    ) -> Page:

        self.browser.start()

        self.page = self.browser.new_page()

        self.page.goto(

            url,

            timeout=timeout,

            wait_until=wait_until,

        )

        return self.page

    def wait(

        self,

        milliseconds: int = 2000,

    ):

        if self.page:

            self.page.wait_for_timeout(milliseconds)

    def locator(

        self,

        selector: str,

    ):

        return self.page.locator(selector)

    def title(self):

        return self.page.title()

    def html(self):

        return self.page.content()

    def url(self):

        return self.page.url

    def screenshot(

        self,

        path: str,

    ):

        if self.page:

            self.page.screenshot(

                path=path,

                full_page=True,

            )

    def close(self):

        self.browser.stop()