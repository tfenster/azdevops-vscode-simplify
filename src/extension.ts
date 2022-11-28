import * as vscode from 'vscode';
import { getAllWorkItemsAsQuickpicks, WorkItem } from './api/azdevops-api';
import { getAzureDevOpsConnection, getGitExtension } from './helpers';
import { AzDevOpsProvider } from './tree/azdevops-tree';

let tenantStatusBarItem: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext) {

	const azureAccountExtensionApi = getAzureDevOpsConnection().getAzureAccountExtensionApi();
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
		getGitExtension().appendToCheckinMessage(`#${wi.wiId}`);
	}));
	context.subscriptions.push(vscode.commands.registerCommand('azdevops-vscode-simplify.selectWorkItem', async () => {
		await selectWorkItem();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('azdevops-vscode-simplify.createBranch', (wi: WorkItem) => {
		wi.createBranch();
	}));
	tenantStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
	tenantStatusBarItem.command = 'azure-account.selectTenant';
	context.subscriptions.push(tenantStatusBarItem);
	context.subscriptions.push(getAzureDevOpsConnection().getAzureAccountExtensionApi().onSessionsChanged(updateTenantStatusBarItem));
	context.subscriptions.push(getAzureDevOpsConnection().getAzureAccountExtensionApi().onStatusChanged(updateTenantStatusBarItem));
	context.subscriptions.push(getAzureDevOpsConnection().getAzureAccountExtensionApi().onSubscriptionsChanged(updateTenantStatusBarItem));
	context.subscriptions.push(getAzureDevOpsConnection().getAzureAccountExtensionApi().onFiltersChanged(updateTenantStatusBarItem));
}

export function deactivate() { }

async function updateTenantStatusBarItem() {
	let api = getAzureDevOpsConnection().getAzureAccountExtensionApi();
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

export interface TenantIdDescription {
	tenantId: string;
	displayName: string;
}
