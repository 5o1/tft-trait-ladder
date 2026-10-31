# Browser languages

The page supports English and Simplified Chinese. It checks `navigator.languages` in preference order, using `navigator.language` when the list is unavailable. The first `en` or `zh` language tag selects the interface; other languages fall back to English. Chinese regional tags, including `zh-TW` and `zh-Hant`, use the Simplified Chinese interface.

`web/index.html` contains the English default page. `web/i18n.js` contains the Chinese and English interface copy, champion and trait names, and dynamic status messages. Algorithm and rule paragraphs retain their mathematical HTML in both languages.

`web/app.js` translates at explicit rendering boundaries. Text, tooltips, accessible labels, and image fallbacks use the selected language. Search accepts English names, Chinese names, and Chinese aliases in either interface language; multiple search terms can match a unit and its traits. It also accepts the official naming variants documented below.

Canonical Chinese names remain the identifiers used by the calculation engine, Worker messages, JSON exports, and saved game records. Opening the same saved game with another browser language preserves ownership, emblems, confirmed evolutions, and progression history.

The DOM and real-Worker regression exercises both languages, language preference ordering, the English fallback, name coverage, accessible labels, searches, and saved-game continuity. Run it with `npm run test:web`.

## Terminology references

Reviewed on October 31, 2026. The catalog contains 65 base units and 9 additional Lux forms, for 74 entries, plus 36 traits. Base-unit names match the [official Golden Spatula Comp Simulator catalog](https://goldenspatula.com/act/jkxsimulator241204/English/index.html), treating straight and curly apostrophes as typographic variants. The simulator's indexed catalog was available to search; its direct page exposed no readable text during this review.

Riot's [Enchanted Wilds overview](https://teamfighttactics.leagueoflegends.com/en-us/news/game-updates/enchanted-wilds-overview/) confirms the set name, all nine Lux origins, and the Riftbeast names Cinderling, Pebbles, Murkwolf, Gromp, Scuttlecrab, Mama Beak, Krug, Brambleback, Sentinel, and Elder Dragon. The [League of Legends champion directory](https://www.leagueoflegends.com/en-us/champions/) provides an additional spelling reference for League champions.

The official simulator and other official pages use different English names for three traits:

| Chinese identifier | Display name | Simulator variant | Display-name reference |
| --- | --- | --- | --- |
| 斗士 | Brawler | Bruiser | Riot's overview describes Alistar as a Brawler. |
| 法师 | Spellweaver | Arcanist | The [Golden Spatula English homepage](https://goldenspatula.com/en/) lists Alune as a Spellweaver. |
| 约德尔人和朋友 | Sprykin | Yordle | Riot's overview names and describes Sprykin. |

Both names in each row are accepted by search. The remaining 33 trait names match the simulator catalog. [Patch 18.2](https://teamfighttactics.leagueoflegends.com/en-us/news/game-updates/teamfight-tactics-patch-18-2/) also confirms Ravager, Hunter, Solar, and Rapidfire; [patch 18.5](https://teamfighttactics.leagueoflegends.com/en-us/news/game-updates/teamfight-tactics-patch-18-5/) confirms Flora Fatalis and Attuned.

The game name follows the [Golden Spatula official website](https://goldenspatula.com/en/). Crown controls use the item name Tactician's Crown, as listed in Riot's [patch 14.6 item changes](https://teamfighttactics.leagueoflegends.com/en-us/news/game-updates/teamfight-tactics-patch-14-6-notes/). English interface copy uses singular and plural forms for trait, slot, level, and lineup counts. Lineup acquisition cost is distinguished from the gold cost of buying units.
