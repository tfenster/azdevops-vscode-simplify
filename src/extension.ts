import * as vscode from 'vscode';
import { getAllWorkItemsAsQuickpicks, WorkItemQuickPickItems, WorkItemTreeItem } from './api/azdevops-api';
import { RepoSelection } from './api/git-api';
import { getAzureAccountExtension, getGitExtension } from './helpers';
import { AzDevOpsProvider } from './tree/azdevops-tree';

let tenantStatusBarItem: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext) {

	const azureAccountExtensionApi = getAzureAccountExtension().getAzureAccountExtensionApi();
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
	tenantStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
	tenantStatusBarItem.command = 'azure-account.selectTenant';
	context.subscriptions.push(tenantStatusBarItem);
	context.subscriptions.push(getAzureAccountExtension().getAzureAccountExtensionApi().onSessionsChanged(updateTenantStatusBarItem));
	context.subscriptions.push(getAzureAccountExtension().getAzureAccountExtensionApi().onStatusChanged(updateTenantStatusBarItem));
	context.subscriptions.push(getAzureAccountExtension().getAzureAccountExtensionApi().onSubscriptionsChanged(updateTenantStatusBarItem));
	context.subscriptions.push(getAzureAccountExtension().getAzureAccountExtensionApi().onFiltersChanged(updateTenantStatusBarItem));
}

export function deactivate() { }

async function updateTenantStatusBarItem() {
	let api = getAzureAccountExtension().getAzureAccountExtensionApi();
	let sessions = api.sessions;
	const tenants: TenantIdDescription[] = await ((api as any).loginHelper.tenantsTask);
	if (sessions && sessions.length > 0) {
		let matchingTenant = tenants.find(t => t.tenantId === sessions[0].tenantId);
		if (matchingTenant) {
			tenantStatusBarItem.text = `Azure tenant: ${matchingTenant?.displayName}`;
			tenantStatusBarItem.show();
		} else {
			tenantStatusBarItem.text = `Azure tenant: ${sessions[0].tenantId}`;
			tenantStatusBarItem.show();
		}
	} else {
		tenantStatusBarItem.hide();
	}
}

async function selectWorkItem() {
	try {
		const repo = await getGitExtension().getRepoOrShowWarning(RepoSelection.choose);
		if (!repo) {
			return;
		}
		const quickPick = vscode.window.createQuickPick<WorkItemQuickPickItems>();
		quickPick.busy = true;
		quickPick.title = 'Search for the title or ID of the work item you want to add to the commit message';
		quickPick.ignoreFocusOut = true;
		quickPick.matchOnDescription = true;
		quickPick.matchOnDetail = true;
		quickPick.canSelectMany = true;
		quickPick.show();
		const workItems = await getAllWorkItemsAsQuickpicks(repo);
		if (workItems && workItems.length > 0) {
			quickPick.busy = false;
			quickPick.onDidTriggerItemButton((args) => {
				if (args.button.tooltip === 'Add parent') {
					const parentOfItem = quickPick.items.find(entry => entry.workItemId === args.item.parentId);
					if (parentOfItem) {
						quickPick.selectedItems = quickPick.selectedItems.concat(parentOfItem);
					}
				}
			});
			quickPick.items = workItems;
			quickPick.onDidAccept(() => {
				quickPick.hide();
				for (const selectedItem of quickPick.selectedItems) {
					getGitExtension().appendToCheckinMessage(`#${selectedItem.workItemId}`, repo);
				}
			});
		} else {
			quickPick.hide();
			vscode.window.showWarningMessage('Uanble to load work items.');
		}
	} catch (error) {
		vscode.window.showErrorMessage(`An unexpected error occurred while retrieving work items: ${error}`);
		console.error(error);
		return [];
	}
}

export interface TenantIdDescription {
	tenantId: string;
	displayName: string;
}
