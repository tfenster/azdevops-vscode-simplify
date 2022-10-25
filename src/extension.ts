import * as vscode from 'vscode';
import { WorkItem } from './azdevops-api';
import { Connection } from './connection';
import { AzDevOpsProvider } from './tree/azdevops-tree';

let connection = new Connection();

export async function activate(context: vscode.ExtensionContext) {

	const azureAccountExtensionApi = connection.getAzureAccountExtensionApi();
	if (!(await azureAccountExtensionApi.waitForLogin())) {
		return vscode.commands.executeCommand('azure-account.askForLogin');
	}

	const azDevOpsProvider = new AzDevOpsProvider();
	vscode.window.registerTreeDataProvider('workitems', azDevOpsProvider);

	context.subscriptions.push(vscode.commands.registerCommand('azdevops-vscode-simplify.refreshEntries', () => azDevOpsProvider.refresh()));
	context.subscriptions.push(vscode.commands.registerCommand('azdevops-vscode-simplify.openWorkItem', (wi: WorkItem) => {
		vscode.env.openExternal(vscode.Uri.parse(wi.url));
	}));
	context.subscriptions.push(vscode.commands.registerCommand('azdevops-vscode-simplify.addToCommitMessage', (wi: WorkItem) => {
		wi.appendToCheckinMessage(`#${wi.wiId}`);
	}));
}

export function getConnection(): Connection {
	return connection;
}

// this method is called when your extension is deactivated
export function deactivate() { }

export function hideClosedWorkItems(): boolean {
	let def: boolean | undefined = vscode.workspace.getConfiguration('azdevops-vscode-simplify').get('hideClosedWorkItems');
	if (def === undefined) { def = false; }
	return def;
}

export function maxNumberOfWorkItems(): Number {
	let def: Number | undefined = vscode.workspace.getConfiguration('azdevops-vscode-simplify').get('maxNumberOfWorkItems');
	if (def === undefined) { def = 25; }
	return def;
}