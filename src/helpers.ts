import * as vscode from 'vscode';
import { AzureAccountExtension } from './api/azure-account-api';
import { GitExtension } from './api/git-api';
import { AzDevOpsConnection } from './connection';

let azDevOpsConnection = new AzDevOpsConnection();
let gitExtension = new GitExtension();
let azureAccountExtension = new AzureAccountExtension();

export function getAzureDevOpsConnection(): AzDevOpsConnection {
    return azDevOpsConnection;
}

export function getGitExtension(): GitExtension {
    return gitExtension;
}

export function getAzureAccountExtension(): AzureAccountExtension {
    return azureAccountExtension;
}

export function showWorkItemTypes(): string[] {
    return vscode.workspace.getConfiguration('azdevops-vscode-simplify').get('showWorkItemTypes', []);
}

export function useWorkitemIdInBranchName(): boolean {
    return vscode.workspace.getConfiguration('azdevops-vscode-simplify').get('useWorkitemIdInBranchName', false) ||
        vscode.workspace.getConfiguration('azdevops-vscode-simplify').get('createBranch.useWorkitemIdInBranchName', false);
}
export function createBranchBasedOn(): string{
    return vscode.workspace.getConfiguration('azdevops-vscode-simplify').get('createBranch.createBranchBasedOn', "default branch of remote repo");
}
export function askForBaseBranch(): boolean{
    return vscode.workspace.getConfiguration('azdevops-vscode-simplify').get('createBranch.askForBaseBranch', false);
}

export function hideWorkItemsWithState(): string[] {
    return vscode.workspace.getConfiguration('azdevops-vscode-simplify').get('hideWorkItemsWithState', []);
}
export function sortOrderOfWorkItemState(): string[] {
    return vscode.workspace.getConfiguration('azdevops-vscode-simplify').get('sortOrderOfWorkItemState', []);
}

export function maxNumberOfWorkItems(): Number {
    return vscode.workspace.getConfiguration('azdevops-vscode-simplify').get('maxNumberOfWorkItems', 25);
}