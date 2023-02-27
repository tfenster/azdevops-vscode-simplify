import * as vscode from 'vscode';
import { API, InputBox, Repository } from '../types/git';
import { analyzeGitRepo, RepoAnalysis } from './azdevops-api';

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

    public async appendToCheckinMessage(line: string, repo?: Repository): Promise<void> {
        await this.withSourceControlInputBox((inputBox: InputBox) => {
            const previousMessage = inputBox.value;
            if (previousMessage) {
                inputBox.value = previousMessage + "\n" + line;
            } else {
                inputBox.value = line;
            }
        }, repo);
    }

    private async withSourceControlInputBox(fn: (input: InputBox) => void, repo?: Repository) {
        if (!repo) {
            repo = await this.getRepoOrShowWarning(RepoSelection.choose);
        }
        if (repo) {
            const inputBox = repo.inputBox;
            if (inputBox) {
                fn(inputBox);
            }
        }
    }

    public async getRepoOrShowWarning(repoSelection: RepoSelection): Promise<Repository | undefined> {
        return await this.getRepo(true, repoSelection);
    }
    public async getRepoSilent(): Promise<Repository | undefined> {
        return await this.getRepo(false, RepoSelection.takeFirst);
    }
    private async getRepo(showWarningIfFailed: boolean, repoSelection: RepoSelection): Promise<Repository | undefined> {
        const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
        while (GitExtension.gitApi.state === 'uninitialized') { await sleep(100); }
        const repos = GitExtension.gitApi.repositories;
        let reposWithRemote: Repository[] = [];
        if (repos) {
            reposWithRemote = repos.filter(repo => repo.state.remotes.length > 0 && repo.state.remotes[0].fetchUrl);
        }
        if (reposWithRemote.length > 0) {
            if (this.shouldChooseRepo(repoSelection, reposWithRemote)) {
                return await this.chooseRepo(reposWithRemote);
            } else {
                return reposWithRemote[0];
            }
        } else {
            if (showWarningIfFailed) {
                vscode.window.showErrorMessage("No Git repository found. This functionality only works when you have a Git repository with a remote open.");
            }
        }
        return undefined;
    }

    private shouldChooseRepo(repoSelection: RepoSelection, reposWithRemote: Repository[]) {
        return repoSelection === RepoSelection.choose && reposWithRemote.length > 1;
    }
    private async chooseRepo(reposWithRemote: Repository[]) {
        interface QuickPickItemWithRepo { label: string, repo: Repository };
        const repoQuickPicks: QuickPickItemWithRepo[] = reposWithRemote.map(repoWithRemote => {
            return {
                label: repoWithRemote.state.remotes[0].fetchUrl!,
                repo: repoWithRemote
            };
        });
        const repoPick: QuickPickItemWithRepo | undefined = await vscode.window.showQuickPick(repoQuickPicks, { title: 'Please select a repository' });
        return repoPick ? repoPick.repo : undefined;
    }
}
export enum RepoSelection {
    takeFirst,
    choose
}