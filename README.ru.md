# Phrase Highlighter for Language Reactor

[English](README.md) | [Türkçe](README.tr.md) | [Español](README.es.md) | [简体中文](README.zh-Hans.md) | **Русский**

Расширение Chrome для тех, кто учит языки с [Language Reactor](https://www.languagereactor.com). Работает только на languagereactor.com. На youtube.com и netflix.com его нет.

Откройте урок и нажмите значок Phrase Highlighter (первая кнопка на панели Language Reactor). Справа откроется боковая панель с карточками значений для текущей строки, а не для всего видео или книги. Вложенные выражения показываются оба, например `going to be` и `going to`. Значения берутся из словаря Language Reactor на странице. Сайта Language Reactor достаточно. Расширение Chrome от Language Reactor не нужно.

<img src="docs/screenshot.jpg" alt="Карточки выражений в боковой панели Language Reactor">

## Установка

Расширения нет в Chrome Web Store. Установите его из zip на GitHub Releases.

1. Скачайте [zip v1.0.0](https://github.com/official-burak/phrase-highlighter-for-language-reactor/releases/download/v1.0.0/phrase-highlighter-for-language-reactor-1.0.0.zip).
2. Распакуйте архив.
3. В Chrome откройте `chrome://extensions`.
4. Включите режим разработчика.
5. Нажмите «Загрузить распакованное».
6. Выберите папку с `manifest.json`.

После обновления перезагрузите расширение на этой странице, затем обновите вкладку languagereactor.com.

## Как пользоваться

1. Установите это расширение Chrome (см. Установка).
2. Откройте [languagereactor.com](https://www.languagereactor.com).
3. Откройте урок (видео, книгу, подкаст или текст).
4. Нажмите значок Phrase Highlighter на панели Language Reactor. Цветной значок значит, что панель открыта. Серый значит, что она закрыта, но нажать всё равно можно. Chrome запоминает ваш выбор.
5. Читайте карточки текущей строки. Если в строке нет выражений, панель остаётся открытой и показывает логотип расширения, пока выражения не появятся.

## Если значка нет

**Почему его нет на YouTube.com?**

Смотреть нужно через Language Reactor, а не на самом youtube.com.

**Значок пропал.**

Откройте урок. Его нет в каталоге, в сохранённом, в настройках и на главной.

Работает только на Language Reactor. Урок на посторонние серверы не отправляется. Проект не связан с Language Reactor или Dioco.

[Privacy](PRIVACY.md) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md) · [MIT License](LICENSE). Copyright 2026 Burak Keskin.
