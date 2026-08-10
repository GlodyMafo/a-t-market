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
        



class PddAnonymousExtractor:
    def __init__(self):
        self.playwright: Playwright | None = None
        self.context: BrowserContext | None = None

    def start(self):
        if self.context:
            return

        self.playwright = sync_playwright().start()

        # Profil mobile obligatoire pour éviter d'être rejeté dès la poignée de main
        self.context = self.playwright.chromium.launch_persistent_context(
            user_data_dir="./pdd_anon_profile",
            headless=True,
            args=[
                "--headless=new",
                "--disable-dev-shm-usage",
                "--no-sandbox",
                "--disable-blink-features=AutomationControlled",
            ],
            user_agent=(
                "Mozilla/5.0 (Linux; Android 13; SM-S918B) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/125.0.0.0 Mobile Safari/537.36"
            ),
            viewport={"width": 393, "height": 851},
            is_mobile=True,
            has_touch=True,
            locale="zh-CN",
            timezone_id="Asia/Shanghai",
            extra_http_headers={
                "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
                "Sec-Ch-Ua-Mobile": "?1",
                "Sec-Ch-Ua-Platform": '"Android"',
            },
        )

        # 1. Bloquer la redirection côté navigateur si elle est faite en JS
        self.context.add_init_script("""
            // Désactive les redirections automatiques provoquées par location.href / location.replace
            window.onbeforeunload = function() { return False; };
        """)

    def extract_goods_data(self, goods_id: str) -> dict | None:
        page = self.context.new_page()
        data = None

        # Bloquer les ressources inutiles pour accélérer l'exécution
        page.route("**/*.{png,jpg,jpeg,gif,svg,css,woff,woff2}", lambda route: route.abort())

        try:
            # URL alternative de partage (moins agressive sur le login que goods1.html)
            url = f"https://mobile.yangkeduo.com/goods.html?goods_id={goods_id}"

            # Naviguer jusqu'à "commit" (dès que la réponse HTML commence à être reçue)
            page.goto(url, wait_until="commit", timeout=15000)

            # 2. Intercepter window.rawData immédiatement depuis la mémoire du navigateur
            try:
                data = page.evaluate("""() => {
                    return window.rawData || window.__INITIAL_STATE__ || null;
                }""")
            except Exception:
                pass

            # 3. Si window.rawData est vide, extraire directement depuis le code source HTML brut
            if not data:
                html_content = page.content()
                
                # Chercher l'objet JSON window.rawData injecté dans les balises <script>
                match = re.search(r'window\.rawData\s*=\s*(\{.*?\});', html_content)
                if match:
                    data = json.loads(match.group(1))

        except Exception as e:
            print(f"Erreur d'extraction : {e}")
        finally:
            page.close()

        return data

    def stop(self):
        if self.context:
            self.context.close()
        if self.playwright:
            self.playwright.stop()


# --- TEST D'UTILISATION ---
if __name__ == "__main__":
    extractor = PddAnonymousExtractor()
    extractor.start()

    # ID extrait de votre diagnostic réseau précédent (974159340645)
    goods_id = "974159340645"
    resultat = extractor.extract_goods_data(goods_id)

    if resultat:
        print(" Extraction réussie sans connexion !")
        # Affichage des informations clés du produit si présentes
        goods_info = resultat.get("store", {}).get("goods", {})
        print(f"Titre : {goods_info.get('goodsName')}")
        print(f"Prix : {goods_info.get('minGroupPrice')}")
    else:
        print(" Échec : La page a redirigé avant l'injection du JSON ou le blocage anti-bot est actif.")

    extractor.stop()