import * as vscode from 'vscode';
import { AzDevOpsConnection } from './connection';
import { GitExtension } from './api/git-api';

let azDevOpsConnection = new AzDevOpsConnection();
let gitExtension = new GitExtension();

export function getAzureDevOpsConnection(): AzDevOpsConnection {
    return azDevOpsConnection;
}

export function getGitExtension(): GitExtension {
    return gitExtension;
}

export function hideWorkItemsWithState(): string[] {
    let def: string[] | undefined = vscode.workspace.getConfiguration('azdevops-vscode-simplify').get('hideWorkItemsWithState');
    if (def === undefined) { def = []; }
    return def;
}
export function sortOrderOfWorkItemState(): string[] {
    let def: string[] | undefined = vscode.workspace.getConfiguration('azdevops-vscode-simplify').get('sortOrderOfWorkItemState');
    if (def === undefined) { def = []; }
    return def;
}

export function maxNumberOfWorkItems(): Number {
    let def: Number | undefined = vscode.workspace.getConfiguration('azdevops-vscode-simplify').get('maxNumberOfWorkItems');
    if (def === undefined) { def = 25; }
    return def;
}