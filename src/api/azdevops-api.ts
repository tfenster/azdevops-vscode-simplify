import * as vscode from 'vscode';
import { getConnection, getGitExtension, hideClosedWorkItems, maxNumberOfWorkItems } from '../extension';
import { InputBox } from '../types/git';

let bugIcon = new vscode.ThemeIcon("bug");
let taskIcon = new vscode.ThemeIcon("pass");
let userStoryIcon = new vscode.ThemeIcon("book");

export async function getOrganizations(): Promise<Organization[]> {
    try {
        let connection = getConnection();
        let memberId = await connection.getMemberId();
        let responseAccounts = await connection.get(`https://app.vssps.visualstudio.com/_apis/accounts?memberId=${memberId}&api-version=6.0-preview.1`);
        let orgs = new Array<Organization>();
        await responseAccounts.value.forEach((account: any) => {
            orgs.push(new Organization(account.accountName, `https://dev.azure.com/${account.accountName}`,
                account.accountId, vscode.TreeItemCollapsibleState.Collapsed));
        });
        orgs.sort((a, b) => a.label.localeCompare(b.label));
        return orgs;
    } catch (error) {
        vscode.window.showErrorMessage(`An unexpected error occurred while retrieving organizations: ${error}`);
        console.error(error);
        return [];
    }
}

export async function getProjects(organization: Organization): Promise<Project[]> {
    try {
        let connection = getConnection();
        let responseProjects = await connection.get(`${organization.url}/_apis/projects?api-version=6.0`);
        let projects = new Array<Project>();
        await responseProjects.value.forEach((project: any) => {
            projects.push(new Project(project.name, `${organization.url}/${project.id}`, project.id, organization,
                vscode.TreeItemCollapsibleState.Collapsed));
        });
        projects.sort((a, b) => a.label.localeCompare(b.label));
        return projects;
    } catch (error) {
        vscode.window.showErrorMessage(`An unexpected error occurred while retrieving projects: ${error}`);
        console.error(error);
        return [];
    }
}

export async function getWorkItems(query: Query): Promise<WorkItem[]> {
    try {
        let connection = getConnection();
        let responseWIIds = await connection.post(`${query.parent.url}/_apis/wit/wiql?api-version=6.0&$top=${maxNumberOfWorkItems()}`, { "query": query.query });
        let wiIds = responseWIIds.workItems?.map((wi: any) => <Number>wi.id);

        if (wiIds?.length > 0) {
            let bodyWIDetails = {
                "fields": ["System.Id", "System.Title", "System.State", "System.WorkItemType", "System.AssignedTo"],
                "ids": wiIds
            };
            let responseWIDetails = await connection.post(`${query.parent.parent.url}/_apis/wit/workitemsbatch?api-version=6.0`, bodyWIDetails);
            let wiDetails = new Array<WorkItem>();
            await responseWIDetails.value.forEach((wi: any) => {
                let themeIcon = bugIcon;
                if (wi.fields["System.WorkItemType"] === "Task") {
                    themeIcon = taskIcon;
                } else if (wi.fields["System.WorkItemType"] === "User Story") {
                    themeIcon = userStoryIcon;
                }
                wiDetails.push(new WorkItem(wi.fields["System.Title"], `${query.id}-${wi.id}`, wi.id, query, `${query.parent.parent.url}/_workitems/edit/${wi.id}`, wi.fields["System.State"], wi.fields["System.WorkItemType"], (wi.fields["System.AssignedTo"] === undefined ? "no one" : wi.fields["System.AssignedTo"].displayName), themeIcon, vscode.TreeItemCollapsibleState.None));
            });
            wiDetails.sort((a, b) => a.label.localeCompare(b.label));
            return wiDetails;
        }
    } catch (error) {
        vscode.window.showErrorMessage(`An unexpected error occurred while retrieving work items: ${error}`);
        console.error(error);
    }
    return [];
}

export async function getQueries(project: Project): Promise<Query[]> {
    let closedFilter = "";
    if (hideClosedWorkItems()) {
        closedFilter = " AND [System.State] <> 'Closed' ";
    }
    let defaultFilter = "[System.TeamProject] = @project AND ([System.WorkItemType] = 'User Story' OR [System.WorkItemType] = 'Bug' OR [System.WorkItemType] = 'Task')";
    let orderBy = "ORDER BY [System.ChangedDate] DESC";
    return [
        new Query("Assigned to me", "1", project, `Select [System.Id] From WorkItems WHERE ${defaultFilter}${closedFilter} AND [System.AssignedTo] = @me ${orderBy}`, vscode.TreeItemCollapsibleState.Collapsed),
        new Query("Followed by me", "2", project, `Select [System.Id] From WorkItems WHERE ${defaultFilter}${closedFilter} AND [System.Id] IN (@Follows) ${orderBy}`, vscode.TreeItemCollapsibleState.Collapsed),
        new Query("Recent activity by me", "3", project, `Select [System.Id] From WorkItems WHERE ${defaultFilter}${closedFilter} AND [System.Id] IN (@MyRecentActivity) ${orderBy}`, vscode.TreeItemCollapsibleState.Collapsed),
        new Query("Recent activity in project", "4", project, `Select [System.Id] From WorkItems WHERE ${defaultFilter}${closedFilter} AND [System.Id] IN (@RecentProjectActivity) ${orderBy}`, vscode.TreeItemCollapsibleState.Collapsed),
        new Query("Recently mentioned", "5", project, `Select [System.Id] From WorkItems WHERE ${defaultFilter}${closedFilter} AND [System.Id] IN (@RecentMentions) ${orderBy}`, vscode.TreeItemCollapsibleState.Collapsed),
    ];
}


export class Organization extends vscode.TreeItem {

    constructor(
        public readonly label: string,
        public readonly url: string,
        public readonly id: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);

        this.tooltip = this.label;
        this.description = '';
    }

    iconPath = new vscode.ThemeIcon('globe');

    contextValue = 'organization';
}

export class Project extends vscode.TreeItem {

    constructor(
        public readonly label: string,
        public readonly url: string,
        public readonly id: string,
        public readonly parent: Organization,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);

        this.tooltip = this.label;
        this.description = '';
    }

    iconPath = new vscode.ThemeIcon('project');

    contextValue = 'project';
}

export class Query extends vscode.TreeItem {

    constructor(
        public readonly label: string,
        public readonly id: string,
        public readonly parent: Project,
        public readonly query: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);

        this.tooltip = this.label;
        this.description = '';
    }

    iconPath = new vscode.ThemeIcon('list-filter');

    contextValue = 'query';
}

export class WorkItem extends vscode.TreeItem {

    constructor(
        public readonly label: string,
        public readonly id: string,
        public readonly wiId: string,
        public readonly parent: Query,
        public readonly url: string,
        public readonly state: string,
        public readonly type: string,
        public readonly assignedTo: string,
        public iconPath: vscode.ThemeIcon,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);

        this.tooltip = `${this.state}, assigned to ${this.assignedTo}`;
        this.description = '# ' + this.wiId;
    }

    contextValue = 'workitem';

    public appendToCheckinMessage(line: string): void {
        this.withSourceControlInputBox((inputBox: InputBox) => {
            const previousMessage = inputBox.value;
            if (previousMessage) {
                inputBox.value = previousMessage + "\n" + line;
            } else {
                inputBox.value = line;
            }
        });
    }

    private withSourceControlInputBox(fn: (input: InputBox) => void) {
        const gitExtensionApi = getGitExtension().getGitApi();
        const repos = gitExtensionApi.repositories;
        if (repos && repos.length > 0) {
            const inputBox = repos[0].inputBox;
            if (inputBox) {
                fn(inputBox);
            }
        } else {
            vscode.window.showErrorMessage("No Git repository found. This functionality only works when you have a Git repository open.");
        }
    }

    public async createBranch() {
        const gitExtensionApi = getGitExtension().getGitApi();
        const repos = gitExtensionApi.repositories;
        if (repos && repos.length > 0) {
            let newBranch = await vscode.window.showInputBox({
                prompt: "Please enter the name of the new branch"
            });
            if (newBranch) {
                if (repos[0].state.HEAD?.upstream && repos[0].state.remotes.length > 0 && repos[0].state.remotes[0].fetchUrl) {
                    // get substring after last slash
                    let remoteRepoName = repos[0].state.remotes[0].fetchUrl;
                    remoteRepoName = remoteRepoName.substring(remoteRepoName.lastIndexOf("/") + 1);
                    let remoteRepo = await getConnection().get(`${this.parent.parent.url}/_apis/git/repositories/${remoteRepoName}?api-version=5.1-preview.1`);
                    let upstreamRef = repos[0].state.HEAD.upstream;
                    await repos[0].createBranch(newBranch, true);
                    await repos[0].push(upstreamRef.remote, newBranch, true);
                    let wiLink = {
                        // eslint-disable-next-line @typescript-eslint/naming-convention
                        "Op": 0,
                        // eslint-disable-next-line @typescript-eslint/naming-convention
                        "Path": "/relations/-",
                        // eslint-disable-next-line @typescript-eslint/naming-convention
                        "Value": {
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            "rel": "ArtifactLink",
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            "url": `vstfs:///Git/Ref/${this.parent.parent.id}%2F${remoteRepo.id}%2FGB${newBranch}`,
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            "attributes": {
                                // eslint-disable-next-line @typescript-eslint/naming-convention
                                "name": "Branch"
                            }
                        }
                    };
                    await getConnection().patch(`${this.parent.parent.parent.url}/_apis/wit/workItems/${this.wiId}?api-version=4.0-preview`, [wiLink], "application/json-patch+json");
                    vscode.window.showInformationMessage(`Created branch ${newBranch} and linked it to work item ${this.wiId}`);
                } else {
                    vscode.window.showErrorMessage("No upstream branch found. This functionality only works with an upstream branch.");
                }
            }
        } else {
            vscode.window.showErrorMessage("No Git repository found. This functionality only works when you have a Git repository open.");
        }
    }
}