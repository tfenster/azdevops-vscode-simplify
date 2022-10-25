import * as vscode from 'vscode';
import { getOrganizations, getProjects, getQueries, getWorkItems, Organization, Project, Query } from '../azdevops-api';

export class AzDevOpsProvider implements vscode.TreeDataProvider<vscode.TreeItem> {

    private _onDidChangeTreeData: vscode.EventEmitter<Organization | undefined | void> = new vscode.EventEmitter<Organization | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<Organization | undefined | void> = this._onDidChangeTreeData.event;

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
        } else if (element instanceof Organization) {
            return await getProjects(element);
        } else if (element instanceof Project) {
            return await getQueries(element);
        } else if (element instanceof Query) {
            return await getWorkItems(element);
        }
        return [];
    }


}
