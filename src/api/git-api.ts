import * as vscode from 'vscode';
import { API } from '../types/git';

export class GitExtension {
    private static gitApi: API;

    constructor() {
        if (GitExtension.gitApi === undefined) {
            const gitExtension = vscode.extensions.getExtension("vscode.git");
            if (gitExtension) {
                GitExtension.gitApi = gitExtension.exports.getAPI(1);
            } else {
                vscode.window.showErrorMessage("Git extension not found. This extension is required for the full functionality of Azure DevOps Simplify.");
            }
        }
    }

    public getGitApi(): API {
        return GitExtension.gitApi;
    }
}