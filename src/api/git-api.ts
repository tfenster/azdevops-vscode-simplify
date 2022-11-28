import * as vscode from 'vscode';
import { API, InputBox, Repository } from '../types/git';

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

    public async appendToCheckinMessage(line: string): Promise<void> {
        await this.withSourceControlInputBox((inputBox: InputBox) => {
            const previousMessage = inputBox.value;
            if (previousMessage) {
                inputBox.value = previousMessage + "\n" + line;
            } else {
                inputBox.value = line;
            }
        });
    }

    private async withSourceControlInputBox(fn: (input: InputBox) => void) {
        const repo = await this.getRepo();
        if (repo) {
            const inputBox = repo.inputBox;
            if (inputBox) {
                fn(inputBox);
            }
        }
    }


    public async getRepo(): Promise<Repository | undefined> {
        const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
        while(GitExtension.gitApi.state === 'uninitialized'){ await sleep(100)}
        const repos = GitExtension.gitApi.repositories;
        if (repos && repos.length > 0) {
            return repos[0];
        } else {
            vscode.window.showErrorMessage("No Git repository found. This functionality only works when you have a Git repository open.");
        }
        return undefined;
    }

}