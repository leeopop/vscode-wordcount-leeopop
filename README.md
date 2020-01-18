# Word count

## What is this

This tool does "wc" of the whole document and also on the selections.
This tool is as simple as that of Linux tool "wc", i.e. any non-space sequence is considered as a word.
For example, "a:b a-b" has two words.

This tool supports two methods of counting characters.
It counts either the number of characters or the number of bytes in the UTF-8 encoding.

It supports incremental update, so that frequent update on a large text document will not cause serious performance degradation.

You may click on the status bar to toggle the whole document statistics or the selection statistics.

This tool supports multiple segments of selected areas (by Alt-drag).

## Internal structure (for developers)

This information may be helpful for those who want to modify/extend this extension.


### config.ts

Shared constants.
Currently, there is only one.

### WordCount.ts

Main application logic.

1. WCStat: a set of numbers for a WC statistics. Support add, sub, and eq operation.
        1. WCStat.wordCount: Do wc and store the result in it (overwrite). This operation is parameterized by:
                1. Input string: string
                1. RegExp for a single space character (including newline)
                1. RegExp for a single newline character (only a newline). For example, newline for "\\r\\n" should be "\\n". Otherwise, the "\\r\\n" will be counted as two newline characters.
                1. Encoder object to count actual bytes. undefined represents that the number of characters will be counted.
        1. WCStat stores the number of bytes and the number of characters in separated spaces. Num of characters is always calculated while num of bytes is calculated when needed.
1. DocumentWCState: stores per-document cache for incremental update. Each document is identified by its URI. Thus, a single document opened by multiple editors will have only a single document cache.
1. WordCount: A singleton object representing this extension.
        1. update_display updates the statistics according to WordCount's internal state. It automatically allocates new document cache so that it can be invoked almost everywhere (actually, update_statistics does it and update_display invokes it).
        1. update_statistics updates the statistics of a document. It does incremental update when the hint is given.
        1. toggleDocument/Selection: enable or disable each functionality.
        1. update_config updates configuration and clears the document cache. Thus, the callee should determine whether the update is really needed. Also, the callee should update this._currentConfiguration before calling it.
        1. The selection statistics is not cached.
1. Any disposable objects are inserted into this._disposables. However, dynamic objects (e.g. statusBarItem) are manually disposed in this.dispose().

### extension.ts

It registers commands and maps the commands to the implementation in 'extension.ts'.