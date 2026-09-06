# Changelog

## 1.0.0

First public GitHub release of Phrase Highlighter for Language Reactor.

- Meaning cards for the current Language Reactor line in a right sidebar
- Nested phrases both appear (for example `going to be` and `going to`)
- Meanings come from Language Reactor's own dictionary in the page
- Toolbar icon on languagereactor.com opens or closes the sidebar
- Open/closed preference is stored on the device with `chrome.storage.local`
- Content scripts run only on languagereactor.com (not youtube.com or netflix.com)
- Touch and coarse-pointer devices skip hover-hold locks so Language Reactor controls stay tappable
- Phrase save guard only blocks write saves on watch pages, so Saved Phrases list fetches load normally
