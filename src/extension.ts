import * as vscode from 'vscode';
import { getAllWorkItemsAsQuickpicks, WorkItemTreeItem } from './api/azdevops-api';
import { getAzureDevOpsConnection, getGitExtension } from './helpers';
import { AzDevOpsProvider } from './tree/azdevops-tree';

export async function activate(context: vscode.ExtensionContext) {

	const azureAccountExtensionApi = getAzureDevOpsConnection().getAzureAccountExtensionApi();
	if (!(await azureAccountExtensionApi.waitForLogin())) {
		await vscode.commands.executeCommand('azure-account.askForLogin');
	}

	const azDevOpsProvider = new AzDevOpsProvider();
	vscode.window.registerTreeDataProvider('workitems', azDevOpsProvider);

	context.subscriptions.push(vscode.commands.registerCommand('azdevops-vscode-simplify.refreshEntries', () => azDevOpsProvider.refresh()));
	context.subscriptions.push(vscode.commands.registerCommand('azdevops-vscode-simplify.openWorkItem', (wi: WorkItemTreeItem) => {
		vscode.env.openExternal(vscode.Uri.parse(wi.url));
	}));
	context.subscriptions.push(vscode.commands.registerCommand('azdevops-vscode-simplify.addToCommitMessage', async (wi: WorkItemTreeItem) => {
		getGitExtension().appendToCheckinMessage(`#${wi.wiId}`);
	}));
	context.subscriptions.push(vscode.commands.registerCommand('azdevops-vscode-simplify.selectWorkItem', async () => {
		await selectWorkItem();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('azdevops-vscode-simplify.createBranch', (wi: WorkItemTreeItem) => {
		wi.createBranch();
	}));
}

export function deactivate() { }

async function selectWorkItem() {
	try {
		const workItems = await getAllWorkItemsAsQuickpicks();
		if (workItems && workItems.length > 0) {
			const workItem = await vscode.window.showQuickPick(workItems, {
				title: 'Search for the title or ID of the work item you want to add to the commit message',
				ignoreFocusOut: true,
				matchOnDescription: true
			});
			if (workItem) {
				getGitExtension().appendToCheckinMessage(`#${workItem.description!}`);
			}
		}
	} catch (error) {
		vscode.window.showErrorMessage(`An unexpected error occurred while retrieving work items: ${error}`);
		console.error(error);
		return [];
	}
}
