import * as vscode from 'vscode';
import { getOrganizations, getProjects, getQueries, getWorkItemTreeItems, OrganizationTreeItem, ProjectTreeItem, QueryTreeItem } from '../api/azdevops-api';

export class AzDevOpsProvider implements vscode.TreeDataProvider<vscode.TreeItem> {

    private _onDidChangeTreeData: vscode.EventEmitter<OrganizationTreeItem | undefined | void> = new vscode.EventEmitter<OrganizationTreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<OrganizationTreeItem | undefined | void> = this._onDidChangeTreeData.event;

    constructor() {
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (!element) {
            return await getOrganizations();
        } else if (element instanceof OrganizationTreeItem) {
            return await getProjects(element);
        } else if (element instanceof ProjectTreeItem) {
            return await getQueries(element);
        } else if (element instanceof QueryTreeItem) {
            return await getWorkItemTreeItems(element);
        }
        return [];
    }


}
