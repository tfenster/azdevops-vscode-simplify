import * as vscode from 'vscode';
import { getAllWorkItemsAsQuickpicks, WorkItem } from './api/azdevops-api';
import { AzDevOpsConnection } from './connection';
import { GitExtension } from './api/git-api';
import { AzDevOpsProvider } from './tree/azdevops-tree';

let azDevOpsConnection = new AzDevOpsConnection();
let gitExtension = new GitExtension();

export async function activate(context: vscode.ExtensionContext) {

	const azureAccountExtensionApi = azDevOpsConnection.getAzureAccountExtensionApi();
	if (!(await azureAccountExtensionApi.waitForLogin())) {
		await vscode.commands.executeCommand('azure-account.askForLogin');
	}

	const azDevOpsProvider = new AzDevOpsProvider();
	vscode.window.registerTreeDataProvider('workitems', azDevOpsProvider);

	context.subscriptions.push(vscode.commands.registerCommand('azdevops-vscode-simplify.refreshEntries', () => azDevOpsProvider.refresh()));
	context.subscriptions.push(vscode.commands.registerCommand('azdevops-vscode-simplify.openWorkItem', (wi: WorkItem) => {
		vscode.env.openExternal(vscode.Uri.parse(wi.url));
	}));
	context.subscriptions.push(vscode.commands.registerCommand('azdevops-vscode-simplify.addToCommitMessage', async (wi: WorkItem) => {
		gitExtension.appendToCheckinMessage(`#${wi.wiId}`);
	}));
	context.subscriptions.push(vscode.commands.registerCommand('azdevops-vscode-simplify.selectWorkItem', async (wi: WorkItem) => {
		await selectWorkItem();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('azdevops-vscode-simplify.createBranch', (wi: WorkItem) => {
		wi.createBranch();
	}));
}

export function getConnection(): AzDevOpsConnection {
	return azDevOpsConnection;
}

export function getGitExtension(): GitExtension {
	return gitExtension;
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

async function selectWorkItem() {
	const workItems = await getAllWorkItemsAsQuickpicks();
	if (workItems && workItems.length > 0) {
		const workItem = await vscode.window.showQuickPick(workItems, {
			title: 'Search for the title or ID of the work item you want to add to the commit message',
			ignoreFocusOut: true,
			matchOnDescription: true
		});
		if (workItem) {
			gitExtension.appendToCheckinMessage(workItem.description!);
		}
	}
}
