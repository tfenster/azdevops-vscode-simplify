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

export function getBranchNameProposalSetting(): BranchNameProposal {
    let branchNameProposal = BranchNameProposal.nothing;
    const branchNameProposalAsString = vscode.workspace.getConfiguration('azdevops-vscode-simplify').get<string>('createBranch.branchNameProposal');
    if (branchNameProposalAsString) {
        branchNameProposal = BranchNameProposal[branchNameProposalAsString as any] as unknown as BranchNameProposal;
    } else {
        const useId: boolean = vscode.workspace.getConfiguration('azdevops-vscode-simplify').get('useWorkitemIdInBranchName', false) ||
            vscode.workspace.getConfiguration('azdevops-vscode-simplify').get('createBranch.useWorkitemIdInBranchName', false);
        if (useId) {
            branchNameProposal = BranchNameProposal.workitemId;
        }
    }
    return branchNameProposal;
}
export enum BranchNameProposal {
    "nothing",
    "workitemId",
    "workitemDescription",
    "workitemIdAndDescription"
}
export function createBranchBasedOn(): string {
    return vscode.workspace.getConfiguration('azdevops-vscode-simplify').get('createBranch.createBranchBasedOn', "default branch of remote repo");
}
export function askForBaseBranch(): boolean {
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