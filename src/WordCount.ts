'use strict';

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as config from './config';
import { TextEncoder } from 'util';

class WCStat {
    public numCharacters: number;
    public numBytes: number;
    public numWords: number;
    public numLines: number;

    constructor() {
        this.numCharacters = 0;
        this.numBytes = 0;
        this.numWords = 0;
        this.numLines = 0;
    }

    _reset() {
        this.numCharacters = 0;
        this.numBytes = 0;
        this.numWords = 0;
        this.numLines = 0;
    }

    eq(other: WCStat) {
        return this.numCharacters === other.numCharacters &&
            this.numBytes === other.numBytes &&
            this.numWords === other.numWords &&
            this.numLines === other.numLines;
    }

    add(other: WCStat) {
        this.numCharacters += other.numCharacters;
        this.numBytes += other.numBytes;
        this.numWords += other.numWords;
        this.numLines += other.numLines;
    }

    sub(other: WCStat) {
        this.numCharacters -= other.numCharacters;
        this.numBytes -= other.numBytes;
        this.numWords -= other.numWords;
        this.numLines -= other.numLines;
    }

    wordCount(target: string, spaceExp: RegExp, lineExp: RegExp, encoder: TextEncoder | undefined = undefined) {
        this._reset();
        // Count the bytes in the given encoding
        if (encoder !== undefined) {
            this.numBytes = encoder.encode(target).length;
        }

        let isWhite = true;
        for (const val of target) {
            if (spaceExp.test(val)) {
                // Space
                if (!isWhite) {
                    // It was word before, thus increase a word counter
                    isWhite = true;
                    this.numWords += 1;
                }
            } else {
                isWhite = false;
            }

            // count newlines
            if (lineExp.test(val)) {
                this.numLines += 1;
            }

            this.numCharacters += 1;
        }

        // count the final word
        if (!isWhite) {
            isWhite = true;
            this.numWords += 1;
        }
    }
}


class DocumentWCState {
    public prevText: string;

    public wcStat: WCStat;

    constructor() {
        this.prevText = "";
        this.wcStat = new WCStat();
    }
}

export class WordCount {
    private _currentConfiguration: vscode.WorkspaceConfiguration;
    private _disposables: vscode.Disposable[];
    private _documentStatusBarItem: vscode.StatusBarItem;
    private _selectionStatusBarItem: vscode.StatusBarItem;
    private _cache: Map<vscode.Uri, DocumentWCState>;
    private _encoder?: TextEncoder;
    private _spaceRegExp: RegExp;
    private _lineRegExp: RegExp;
    private _isDebug: boolean;
    private _enableSelection: boolean;
    private _enableDocument: boolean;

    constructor() {
        // States
        this._disposables = [];
        this._currentConfiguration = vscode.workspace.getConfiguration(config.EXTENSION_NAME);
        this._documentStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
        this._selectionStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
        this._cache = new Map();
        this._encoder = undefined;
        this._spaceRegExp = new RegExp("");
        this._lineRegExp = new RegExp("");
        this._isDebug = false;
        this._enableDocument = true;
        this._enableSelection = true;

        // Init functions
        this.update_config();

        // Listeners

        // Config update
        this._disposables.push(vscode.workspace.onDidChangeConfiguration(
            (event) => {
                if (event.affectsConfiguration(config.EXTENSION_NAME)) {
                    this._currentConfiguration = vscode.workspace.getConfiguration(config.EXTENSION_NAME);
                    this.update_config();
                    this.update_display();
                }
            }
        ));

        this._disposables.push(vscode.window.onDidChangeActiveTextEditor(
            (event) => {
                this.update_display();
            }
        ));

        this._disposables.push(vscode.window.onDidChangeTextEditorSelection(
            (event) => {
                this.update_display();
            }
        ));

        this._disposables.push(vscode.workspace.onDidCloseTextDocument(
            (event) => {
                // Clear the document cache
                console.log("Document closed. Clear the cache for the document.");
                this._cache.delete(event.uri);
            }
        ));

        this._disposables.push(vscode.workspace.onDidSaveTextDocument(
            (_) => {
                // TODO Consider clearing the incremental cache on save.
                // this._cache.delete(event.uri);
            }
        ));

        this._disposables.push(vscode.workspace.onDidOpenTextDocument(
            (event) => {
                // Clear the document cache
                this.update_statistics(event);
                this.update_display();
            }
        ));

        this._disposables.push(vscode.workspace.onDidChangeTextDocument(
            (event) => {
                this.update_statistics(event.document, event.contentChanges);
                this.update_display();
            }
        ));

        this.update_display();
    }

    update_display() {
        // No active text editor, close all.
        let editor = vscode.window.activeTextEditor;
        if (editor === undefined) {
            this._documentStatusBarItem.hide();
            this._selectionStatusBarItem.hide();
            return;
        }
        let document = editor.document;
        let count: number;

        if (this._enableSelection) {
            // Selection stat is enabled
            let selectionStat = new WCStat();
            let tempStat = new WCStat();

            let selections = editor.selections;
            selections.forEach((selection) => {
                let selectedText = document.getText(selection);
                tempStat.wordCount(selectedText, this._spaceRegExp, this._lineRegExp, this._encoder);
                selectionStat.add(tempStat);
            });

            if (selectionStat.numCharacters > 0) {
                if (this._encoder === undefined) {
                    count = selectionStat.numCharacters;
                } else {
                    count = selectionStat.numBytes;
                }
                let s = "";
                if (selections.length > 1) {
                    s = "s";
                }
                this._selectionStatusBarItem.text = `wc (sel): ( ${selectionStat.numLines} | ${selectionStat.numWords} | ${count} )`;
                if (selections.length > 1) {
                    this._selectionStatusBarItem.text += ` (${selections.length} selection${s})`;
                }
                this._selectionStatusBarItem.show();
            } else {
                this._selectionStatusBarItem.hide();
            }
        } else {
            // selection stat is disabled.
            if (editor.selection.isEmpty) {
                this._selectionStatusBarItem.hide();
            } else {
                this._selectionStatusBarItem.text = "wc (sel): ( - )";
                this._selectionStatusBarItem.show();
            }
        }

        if (this._enableDocument) {
            let cache = this._cache.get(document.uri);
            while (cache === undefined) {
                this.update_statistics(document);
                cache = this._cache.get(document.uri);
            }

            if (this._encoder === undefined) {
                count = cache.wcStat.numCharacters;
            } else {
                count = cache.wcStat.numBytes;
            }
            this._documentStatusBarItem.text = `wc (all): ( ${cache.wcStat.numLines} | ${cache.wcStat.numWords} | ${count} )`;
        } else {
            this._documentStatusBarItem.text = "wc (all): ( - )";
        }
        this._documentStatusBarItem.show();
    }

    toggleSelection() {
        this._enableSelection = !this._enableSelection;
        this.update_display();
    }

    toggleDocument() {
        this._enableDocument = !this._enableDocument;
        // We have to clear the cache
        console.log("Toggling document stat requires clearing the cache.");
        this._cache.clear();
        this.update_display();
    }

    update_statistics(document: vscode.TextDocument, hints?: vscode.TextDocumentContentChangeEvent[]) {
        const documentUri = document.uri;

        const cache = this._cache.get(documentUri);
        if (cache === undefined) {
            console.log("Create new cache: " + documentUri);
            let new_cache = new DocumentWCState();
            new_cache.prevText = document.getText();
            new_cache.wcStat.wordCount(new_cache.prevText, this._spaceRegExp, this._lineRegExp, this._encoder);
            this._cache.set(documentUri, new_cache);
        } else {
            if (hints === undefined) {
                console.log("Full update an existing cache: " + documentUri);
                cache.prevText = document.getText();
                cache.wcStat.wordCount(cache.prevText, this._spaceRegExp, this._lineRegExp, this._encoder);
            } else {
                console.log("Update diff for an existing cache: " + documentUri);
                // has the previous cache and has the diff.
                let prevStat = new WCStat();
                let newStat = new WCStat();
                hints.forEach((hint) => {
                    let prevChar = "";
                    let nextChar = "";
                    let start = hint.rangeOffset;
                    let end = hint.rangeOffset + hint.rangeLength;
                    if (start > 0) {
                        prevChar = cache.prevText.charAt(start - 1);
                    }
                    if (end < cache.prevText.length) {
                        nextChar = cache.prevText.charAt(end);
                    }
                    let prevBody = cache.prevText.substring(start, end);
                    let newBody = hint.text;

                    prevStat.wordCount(prevChar + prevBody + nextChar,
                        this._spaceRegExp, this._lineRegExp, this._encoder);
                    newStat.wordCount(prevChar + newBody + nextChar,
                        this._spaceRegExp, this._lineRegExp, this._encoder);

                    cache.wcStat.add(newStat);
                    cache.wcStat.sub(prevStat);
                });

                // update the prev text
                cache.prevText = document.getText();

                if (this._isDebug) {
                    let debug_stat = new WCStat();
                    debug_stat.wordCount(document.getText(),
                        this._spaceRegExp, this._lineRegExp, this._encoder);
                    if (!debug_stat.eq(cache.wcStat)) {
                        vscode.window.showErrorMessage("Incremental wc failed!!! " + documentUri);
                    }
                }

            }
        }
    }

    // call only when update is needed. assume that the new config differs from the current one
    update_config() {
        let spaceString = this._currentConfiguration.get<string>("whiteSpace");
        if (spaceString === undefined) {
            vscode.window.showErrorMessage("Regexp for white space is not defined.");
            return;
        }
        let lineString = this._currentConfiguration.get<string>("newLine");
        if (lineString === undefined) {
            vscode.window.showErrorMessage("Regexp for newline is not defined.");
            return;
        }

        let docPri = this._currentConfiguration.get<number>("documentPriority");

        let selPri = this._currentConfiguration.get<number>("selectionPriority");

        this._isDebug = this._currentConfiguration.get<boolean>("debug", true);
        this._enableSelection = this._currentConfiguration.get<boolean>("defaultSelectionToggle", true);
        this._enableDocument = this._currentConfiguration.get<boolean>("defaultDocumentToggle", true);

        let countMode = this._currentConfiguration.get<string>("characterCount");
        if (countMode === "character") {
            this._encoder = undefined;
        } else if (countMode === "byte") {
            this._encoder = new TextEncoder();
        } else {
            vscode.window.showErrorMessage("Unexpected character count mode (should never occur).");
        }

        this._documentStatusBarItem.dispose();
        this._documentStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, docPri);
        this._selectionStatusBarItem.dispose();
        this._selectionStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, selPri);

        this._selectionStatusBarItem.command = `${config.EXTENSION_NAME}.toggleSelection`;
        this._documentStatusBarItem.command = `${config.EXTENSION_NAME}.toggleDocument`;

        this._documentStatusBarItem.tooltip = `Word count statistics for the whole document. (lines | words | ${countMode}s)`;
        this._selectionStatusBarItem.tooltip = `Word count statistics for the selection. (lines | words | ${countMode}s) (n selections)`;

        this._spaceRegExp = new RegExp(spaceString);
        this._lineRegExp = new RegExp(lineString);

        // Config has changed. Clear the cache.
        console.log("config changed. clear the cache.");
        this._cache.clear();
    }

    // Disposable
    dispose() {
        this._disposables.forEach(element => {
            element.dispose();
        });
        this._disposables = [];
        this._documentStatusBarItem.dispose();
        this._selectionStatusBarItem.dispose();
        console.log("WordCount instance disposed");
    }
}
