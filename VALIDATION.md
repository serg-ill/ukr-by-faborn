# Звіт перевірки — 0.1.0-beta.1

Дата: 29 вересня 2026. Перша збірка; публікація в GitHub і встановлення на Samsung не виконувалися.

## Підтверджено

- **26 автоматичних тестів:** 10 Python + 16 Node.js, усі пройшли.
- JavaScript перевірено `node --check` та Acorn 8.18.0 з `ecmaVersion: 5`; workflow YAML прочитаний локальним YAML-парсером, наявні build/deploy jobs.
- Пошук українських/оригінальних назв; невідомі назви не підміняються випадковим відео.
- Побудова даних `Lampa.Player.play`: якість, субтитри, timeline, впорядкований плейлист, збереження останньої серії — перевірено в тестах контракту API з модельованим Tizen. Це не тест фізичного AVPlay.
- Автоперехід зупиняється перед розривом у нумерації або відомою недоступною серією.
- Перевірки помилок: HTTP, некоректний HLS, небажаний хост, відсутність українського аудіо в описі, скасування запиту, повторна ініціалізація.
- Індекс: **3 назви, 4 релізи, 18 записів відео**. Усі 18 master-маніфестів були прочитані; 17 записів пройшли наступну перевірку якісного маніфесту та перших 16 байтів першого відеосегмента. Повні фільми не завантажувалися.
- «Бджоляр» та «Профі»: master-маніфести оголошують 3840×1600, 1920×800, 1280×532 та 854×354. Попередня перевірка власного Ashdi-плеєра підтвердила відтворення 3840×1600.
- Локальний запуск зі справжнім ядром Lampa з репозиторію `yumata/lampa`: власна видима SVG-іконка й підпис; реальні меню Lampa; пошук; джерело/озвучення; сезон 3; 8 серій; якості; перехід до іншого озвучення; клавіші Down/Enter. Використано тестову картку, що надсилає стандартну подію `full/complite`, а не емулятор Samsung.
- GitHub-only архітектура: статичний JS/JSON на Pages, Python-оновлювач у GitHub Actions. Сторонніх resolver API, проксі та TorrServer у коді немає.

## Виявлені обмеження

1. **Реальний браузерний запуск у Lampa неуспішний:** `fragLoadError`. Master і варіантні маніфести мають `Access-Control-Allow-Origin: *`, проте відеосегменти — `Access-Control-Allow-Origin: https://ashdi.vip`. GET із зовнішнім Origin повертає байти серверному клієнту, але вебплеєр блокує їх за CORS. Це обмеження стосується й GitHub Pages; статичний хостинг його не усуває.
2. **Tizen / AVPlay — ще не перевірений шлях.** У коді Lampa є окремий нативний адаптер, вибраний при `Platform.is('tizen')` та `Storage.field('player') === 'tizen'`. Збірка дозволяє тест відтворення саме в такому режимі. На фізичному телевізорі поки не підтверджені старт, український звук, перемотування, продовження, субтитри та автоперехід.
3. **DniproFilm S03E08: HTTP 404** при перевірці сегмента. Запис має `state: unavailable`; UI показує пояснення. Uaflix S03E08 пройшла транспортну перевірку.
4. **UAKino Cloudflare 403** для автоматичного читання сторінок. Використано публічні посилання, раніше перевірені у браузері; захист не обходиться. Бета не гарантує відкриття нових назв/серій.
5. **Обмежений індекс із трьох назв.** Немає заяви про повне охоплення двох сайтів.
6. **Український звук — за описом джерела й розміткою озвучень.** Автоматичного акустичного розпізнавання або прослуховування доріжок у цьому тесті не було.
7. GitHub workflow перевірено локально на синтаксис/структуру; реальний запуск GitHub-hosted runner та GitHub Pages deploy ще не виконувалися.

## Відтворювані команди

```sh
python3 -m unittest discover -s tests -p 'test_*.py' -v
node --test tests/test_plugin.js
node --check ukr-by-faborn.js
python3 scripts/validate.py
```

Останні мережеві результати знаходяться у `data/status.json`; дата успішної перевірки кожного запису — `updatedAt` у `data/catalog.json`. Контрольні суми файлів — `SHA256SUMS.txt`.

## Вихідні джерела API

- https://github.com/yumata/lampa-source/blob/main/src/interaction/player.js
- https://github.com/yumata/lampa-source/blob/main/src/interaction/player/video.js
- https://github.com/yumata/lampa-source/blob/main/src/interaction/player/video/tizen.js
- https://github.com/yumata/lampa-source/blob/main/src/components/full/start/buttons.js
- https://developer.samsung.com/smarttv/develop/guides/multimedia/media-playback/using-avplay.html
- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
