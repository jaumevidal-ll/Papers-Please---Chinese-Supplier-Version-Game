# Papers-Please---Chinese-Supplier-Version-Game
A version of the famous game "Papers Please" adapted to a chinese supplier's paperwork. It follows official standards for purchase orders, commercial invoices, packing lists, and bills of lading The language is in Mandarin, with the goal of helping you learn it. It has pinying and the translation of every character if you hover over them.

## Run locally

Open `index.html` through a local web server:

```bash
python3 -m http.server 8765
```

Then visit `http://localhost:8765`.

On macOS, the bundled `desktop-app/CCCP Paperwork.app` starts the server automatically and opens the game in the default browser.

The game includes Mandarin text, sentence-level pinyin, and word hover cards showing an English translation plus the pinyin and meaning of each character. Unknown names and expressions fall back to individual character glosses. Its fictional paperwork follows the common structure of purchase orders, commercial invoices, packing lists, and bills of lading for training purposes.

Word glosses are a reduced CC-CEDICT subset tailored to the game text. To regenerate them from a CC-CEDICT download, run `node scripts/build-word-meanings.js path/to/cedict_1_0_ts_utf-8_mdbg.txt.gz`. See [dictionary attribution](assets/vendor/CC-CEDICT-NOTICE.md).
