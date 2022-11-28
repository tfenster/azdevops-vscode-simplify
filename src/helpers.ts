import * as vscode from 'vscode';
import { GitExtension } from './api/git-api';
import { AzDevOpsConnection } from './connection';

let azDevOpsConnection = new AzDevOpsConnection();
let gitExtension = new GitExtension();

export function getAzureDevOpsConnection(): AzDevOpsConnection {
    return azDevOpsConnection;
}

export function getGitExtension(): GitExtension {
    return gitExtension;
}

export function showWorkItemTypes(): string[] {
    return vscode.workspace.getConfiguration('azdevops-vscode-simplify').get('showWorkItemTypes', [])
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