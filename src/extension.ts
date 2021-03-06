'use strict';

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { WordCount } from './WordCount';
import * as config from './config';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log(`${config.EXTENSION_NAME} is now active`);

	let wcObject = new WordCount();
	context.subscriptions.push(vscode.commands.registerCommand(
		`${config.EXTENSION_NAME}.toggleSelection`,
		() => {
			wcObject.toggleSelection();
		}));
	context.subscriptions.push(vscode.commands.registerCommand(
		`${config.EXTENSION_NAME}.toggleDocument`,
		() => {
			wcObject.toggleDocument();
		}));
	context.subscriptions.push(wcObject);
}

// this method is called when your extension is deactivated
export function deactivate() {
	console.log(`${config.EXTENSION_NAME} is now inactive`);
}
