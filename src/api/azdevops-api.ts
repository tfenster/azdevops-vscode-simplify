import * as vscode from 'vscode';
import { AzDevOpsConnection } from '../connection';
import { getConnection, getGitExtension, hideWorkItemsWithState, maxNumberOfWorkItems } from '../extension';

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

export async function getAllWorkItemsAsQuickpicks(): Promise<vscode.QuickPickItem[] | undefined> {
    const repo = getGitExtension().getRepo();
    if (repo) {
        if (repo.state.remotes[0].fetchUrl) {
            let remoteRepoName = repo.state.remotes[0].fetchUrl;
            let pathSegments: string[] | undefined;
            if (remoteRepoName.startsWith("git@")) {
                remoteRepoName = remoteRepoName.substring(remoteRepoName.indexOf("/") + 1);
                pathSegments = remoteRepoName.split("/");
            }
            else if (remoteRepoName.startsWith('https://')) {
                remoteRepoName = remoteRepoName.substring(remoteRepoName.indexOf("/", 10) + 1);
                pathSegments = remoteRepoName.split("/");
            }
            if (pathSegments && pathSegments.length > 1) {
                let orgUrl = `https://dev.azure.com/${pathSegments[0]}`;
                let projectUrl = `${orgUrl}/${pathSegments[1]}`;
                const query = "Select [System.Id] From WorkItems WHERE [System.TeamProject] = @project AND ([System.WorkItemType] = 'User Story' OR [System.WorkItemType] = 'Bug' OR [System.WorkItemType] = 'Task') ORDER BY [System.ChangedDate] DESC";
                let responseWIDetails = await loadWorkItems(query, orgUrl, projectUrl, false);
                let wiDetails: vscode.QuickPickItem[] = responseWIDetails.value.map((wi: any) => {
                    let themeIcon = getIconForWorkItemType(wi.fields["System.WorkItemType"]);
                    return {
                        label: `$(${themeIcon.id}) ${wi.fields["System.Title"]}`,
                        description: `${wi.id}`, 
                        detail: `Assigned to: ${(wi.fields["System.AssignedTo"] ? wi.fields["System.AssignedTo"].displayName : "")}`
                    };
                });
                return wiDetails;
            } else {
                vscode.window.showErrorMessage(`Couldn't identify the Azure DevOps organization and project from the remote repository fetchUrl <${remoteRepoName}>.`);
            }
        } else {
            vscode.window.showErrorMessage("No remote with fetchUrl found. This function is only with repositories with remote fetchUrls.");
        }
    }
}

export async function getWorkItems(query: Query): Promise<WorkItem[]> {
    let responseWIDetails = await loadWorkItems(query.query, query.parent.parent.url, query.parent.url, true);
    let wiDetails = new Array<WorkItem>();
    await responseWIDetails.value.forEach((wi: any) => {
        let themeIcon = getIconForWorkItemType(wi.fields["System.WorkItemType"]);
        wiDetails.push(new WorkItem(wi.fields["System.Title"], `${query.id}-${wi.id}`, wi.id, query, `${query.parent.parent.url}/_workitems/edit/${wi.id}`, wi.fields["System.State"], wi.fields["System.WorkItemType"], (wi.fields["System.AssignedTo"] === undefined ? "no one" : wi.fields["System.AssignedTo"].displayName), themeIcon, vscode.TreeItemCollapsibleState.None));
    });
    wiDetails.sort((a, b) => {
        const orderOfStates = ['New', 'Active', 'Resolved', 'Closed', 'Removed']
        const indexOfA = orderOfStates.indexOf(a.state);
        const indexOfB = orderOfStates.indexOf(b.state);
        if (indexOfA != -1 && indexOfB == -1)
            return -1
        else if (indexOfA == -1 && indexOfB != -1)
            return 1;
        else if (indexOfA != -1 && indexOfB != -1 && indexOfA != indexOfB)
            return indexOfA - indexOfB;
        else if (indexOfA == -1 && indexOfB == -1 && indexOfA != indexOfB)
            return a.state.localeCompare(b.state);
        return a.label.localeCompare(b.label)
    });
    return wiDetails;
}

async function loadWorkItems(query: string, orgUrl: string, projectUrl: string, considerMaxNumberOfWorkItems: boolean): Promise<any> {
    try {
        let connection = getConnection();
        let maxNumberOfWorkItemsParam = "";
        if (considerMaxNumberOfWorkItems) { maxNumberOfWorkItemsParam = `&$top=${maxNumberOfWorkItems()}`; }
        let responseWIIds = await connection.post(`${projectUrl}/_apis/wit/wiql?api-version=6.0${maxNumberOfWorkItemsParam}`, { "query": query });
        let wiIds: number[] = responseWIIds.workItems?.map((wi: any) => <Number>wi.id);

        if (wiIds?.length > 0) {
            let workItemPromises: Promise<any[]>[] = []
            let skip = 0;
            let top = 200;
            do {
                workItemPromises.push(loadWorkItemPart(wiIds.slice(skip, skip + top), connection, orgUrl));
                skip += 200;
            } while (skip < wiIds.length);
            const resolvedWorkItemBlocks = await Promise.all<any[]>(workItemPromises);
            let workItems: any[] = []
            for (const resolvedWorkItemBlock of resolvedWorkItemBlocks)
                workItems = workItems.concat(resolvedWorkItemBlock)

            return { count: workItems.length, value: workItems };
        }
    } catch (error) {
        vscode.window.showErrorMessage(`An unexpected error occurred while retrieving work items: ${error}`);
        console.error(error);
    }
    return [];

    async function loadWorkItemPart(wiIds: number[], connection: AzDevOpsConnection, orgUrl: string): Promise<any[]> {
        let bodyWIDetails = {
            "fields": ["System.Id", "System.Title", "System.State", "System.WorkItemType", "System.AssignedTo"],
            "ids": wiIds
        };
        let workItemsPart: { count: number; value: any[]; } = await connection.post(`${orgUrl}/_apis/wit/workitemsbatch?api-version=6.0`, bodyWIDetails);
        return workItemsPart.value;
    }
}

function getIconForWorkItemType(workItemType: string): vscode.ThemeIcon {
    let themeIcon = bugIcon;
    if (workItemType === "Task") {
        themeIcon = taskIcon;
    } else if (workItemType === "User Story") {
        themeIcon = userStoryIcon;
    }
    return themeIcon;
}

export async function getQueries(project: Project): Promise<Query[]> {
    let closedFilter = "";
    for (const closedState of hideWorkItemsWithState()) {
        closedFilter += ` AND [System.State] <> '${closedState}' `;
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

    public async createBranch() {
        const repo = getGitExtension().getRepo();
        if (repo) {
            let newBranch = await vscode.window.showInputBox({
                prompt: "Please enter the name of the new branch"
            });
            if (newBranch) {
                if (repo.state.HEAD?.upstream && repo.state.remotes.length > 0 && repo.state.remotes[0].fetchUrl) {
                    // get substring after last slash
                    let remoteRepoName = repo.state.remotes[0].fetchUrl;
                    remoteRepoName = remoteRepoName.substring(remoteRepoName.lastIndexOf("/") + 1);
                    let remoteRepo = await getConnection().get(`${this.parent.parent.url}/_apis/git/repositories/${remoteRepoName}?api-version=5.1-preview.1`);
                    let upstreamRef = repo.state.HEAD.upstream;
                    await repo.createBranch(newBranch, true);
                    await repo.push(upstreamRef.remote, newBranch, true);
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
        }
    }
}