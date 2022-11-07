import * as vscode from 'vscode';
import { AzDevOpsConnection } from '../connection';
import { getAzureDevOpsConnection, getGitExtension, hideWorkItemsWithState, maxNumberOfWorkItems, sortOrderOfWorkItemState } from '../helpers';

let bugIcon = new vscode.ThemeIcon("bug");
let taskIcon = new vscode.ThemeIcon("pass");
let userStoryIcon = new vscode.ThemeIcon("book");

export async function getOrganizations(): Promise<Organization[]> {
    try {
        let connection = getAzureDevOpsConnection();
        let memberId = await connection.getMemberId();
        // https://learn.microsoft.com/en-us/rest/api/azure/devops/account/accounts/list?view=azure-devops-rest-7.1&tabs=HTTP
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
        let connection = getAzureDevOpsConnection();
        // https://learn.microsoft.com/en-us/rest/api/azure/devops/core/projects/list?view=azure-devops-rest-7.1&tabs=HTTP
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
                const orgUrl = `https://dev.azure.com/${pathSegments[0]}`;
                const projectNameHtmlEncoded = pathSegments[1];
                const relevantWorkItemTypes = await getRelevantWorkItemTypesOfProject(orgUrl, projectNameHtmlEncoded);
                const relevantWorkItemTypesAsString = relevantWorkItemTypes.map(entry => `'${entry.name}'`).join(',');
                const query = `Select [System.Id] From WorkItems WHERE [System.TeamProject] = @project AND [System.WorkItemType] IN (${relevantWorkItemTypesAsString}) ORDER BY [System.ChangedDate] DESC`;
                const projectUrl = `${orgUrl}/${projectNameHtmlEncoded}`;
                const responseWIDetails = await loadWorkItems(query, orgUrl, projectUrl, false);
                const wiDetails: vscode.QuickPickItem[] = responseWIDetails.value.map((wi: any) => {
                    const themeIcon = mapDevOpsWorkItemTypeToThemeIcon(relevantWorkItemTypes.find(entry => entry.name === wi.fields["System.WorkItemType"])!.devOpsIcon);
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

async function getWorkItemTypesOfProject(orgUrl: string, projectNameHtmlEncoded: string): Promise<{ name: string; devOpsIcon: string; referenceName: string }[]> {
    const devOpsProcess: { typeId: string; } | undefined = await getDevOpsProcessOfProject(orgUrl, projectNameHtmlEncoded);
    if (devOpsProcess) {
        return await getWorkItemTypesOfProcess(orgUrl, devOpsProcess.typeId);
    }
    return [];
}
async function getWorkItemTypesOfProcess(orgUrl: string, processTypeId: string): Promise<{ name: string; devOpsIcon: string; referenceName: string }[]> {
    const connection = getAzureDevOpsConnection();
    // https://learn.microsoft.com/en-us/rest/api/azure/devops/processes/work-item-types/list?view=azure-devops-rest-7.1&tabs=HTTP
    const workItemTypes = await connection.get(`${orgUrl}/_apis/work/processes/${processTypeId}/workitemtypes?api-version=7.1-preview.2`);
    if (workItemTypes && workItemTypes.value)
    {
        return workItemTypes.value.map((workItemType: any) => {
            return {
                name: workItemType.name,
                devOpsIcon: workItemType.icon,
                referenceName: workItemType.referenceName
            };
        });
    }
    return [];
}
async function getRelevantWorkItemTypesOfProject(orgUrl: string, projectNameHtmlEncoded: string): Promise<{ name: string; devOpsIcon: string }[]> {
    const devOpsProcess: { typeId: string; } | undefined = await getDevOpsProcessOfProject(orgUrl, projectNameHtmlEncoded);
    if (!devOpsProcess) { return []; }
    const workItemTypes = await getWorkItemTypesOfProcess(orgUrl, devOpsProcess.typeId);

    const relevantWorkItemTypes: { name: string; devOpsIcon: string }[] = [];
    relevantWorkItemTypes.push({ name: "Bug", devOpsIcon: workItemTypes.find(entry => entry.name === "Bug")!.devOpsIcon });
    const connection = getAzureDevOpsConnection();
    for (const workItemType of workItemTypes) {
        // https://learn.microsoft.com/en-us/rest/api/azure/devops/processes/work-item-types-behaviors/list?view=azure-devops-rest-7.1&tabs=HTTP
        const workItemTypeBehaviors = await connection.get(`${orgUrl}/_apis/work/processes/${devOpsProcess.typeId}/workitemtypesbehaviors/${workItemType.referenceName}/behaviors?api-version=7.1-preview.1`);
        if (workItemTypeBehaviors && workItemTypeBehaviors.value) {
            if (workItemTypeBehaviors.value.some((entry: any) => entry.behavior && ['System.TaskBacklogBehavior', 'System.RequirementBacklogBehavior'].includes(entry.behavior.id)))
            { relevantWorkItemTypes.push({ name: workItemType.name, devOpsIcon: workItemType.devOpsIcon }); };
        }
    }
    return relevantWorkItemTypes;
}
async function getDevOpsProcessOfProject(orgUrl: string, projectNameHtmlEncoded: string): Promise<{ typeId: string; } | undefined> {
    const connection = getAzureDevOpsConnection();
    // https://learn.microsoft.com/en-us/rest/api/azure/devops/processes/processes/list?view=azure-devops-rest-7.1&tabs=HTTP
    const devOpsProcesses = await connection.get(`${orgUrl}/_apis/work/processes?$expand=projects&api-version=7.1-preview.2`);
    if (devOpsProcesses && devOpsProcesses.value) {
        const devOpsProcess: { typeId: string; } | undefined = devOpsProcesses.value.find((process: { typeId: string; projects: { name: string; }[] | undefined; }) => {
            if (process.projects)
            { return process.projects.find((project: { name: string; }) => project.name === decodeURI(projectNameHtmlEncoded)); }
        });
        return devOpsProcess;
    }
    return undefined;
}

export async function getWorkItems(query: Query): Promise<WorkItem[]> {
    let responseWIDetails = await loadWorkItems(query.query, query.parent.parent.url, query.parent.url, true);
    let wiDetails = new Array<WorkItem>();
    const projectNameHtmlEncoded = query.parent.label;
    const workItemTypes = await getWorkItemTypesOfProject(query.parent.parent.url, projectNameHtmlEncoded);
    await responseWIDetails.value.forEach((wi: any) => {
        const themeIcon = mapDevOpsWorkItemTypeToThemeIcon(workItemTypes.find(workItemType => workItemType.name === wi.fields["System.WorkItemType"])!.devOpsIcon);
        wiDetails.push(new WorkItem(wi.fields["System.Title"], `${query.id}-${wi.id}`, wi.id, query, `${query.parent.parent.url}/_workitems/edit/${wi.id}`, wi.fields["System.State"], wi.fields["System.WorkItemType"], (wi.fields["System.AssignedTo"] === undefined ? "no one" : wi.fields["System.AssignedTo"].displayName), themeIcon, vscode.TreeItemCollapsibleState.None));
    });
    return wiDetails;
}

async function loadWorkItems(query: string, orgUrl: string, projectUrl: string, considerMaxNumberOfWorkItems: boolean): Promise<any> {
    try {
        let connection = getAzureDevOpsConnection();
        let maxNumberOfWorkItemsParam = "";
        if (considerMaxNumberOfWorkItems) { maxNumberOfWorkItemsParam = `&$top=${maxNumberOfWorkItems()}`; }
        // https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/wiql/query-by-wiql?view=azure-devops-rest-7.1&tabs=HTTP
        let responseWIIds = await connection.post(`${projectUrl}/_apis/wit/wiql?api-version=6.0${maxNumberOfWorkItemsParam}`, { "query": query });
        let wiIds: number[] = responseWIIds.workItems?.map((wi: any) => <Number>wi.id);

        if (wiIds?.length > 0) {
            let workItemPromises: Promise<any[]>[] = [];
            let skip = 0;
            let top = 200;
            do {
                workItemPromises.push(loadWorkItemPart(wiIds.slice(skip, skip + top), connection, orgUrl));
                skip += 200;
            } while (skip < wiIds.length);
            const resolvedWorkItemBlocks = await Promise.all<any[]>(workItemPromises);
            let workItems: any[] = [];
            for (const resolvedWorkItemBlock of resolvedWorkItemBlocks)
            { workItems = workItems.concat(resolvedWorkItemBlock); };
            workItems.sort(sortWorkItems);
            return { count: workItems.length, value: workItems };
        }
    } catch (error) {
        vscode.window.showErrorMessage(`An unexpected error occurred while retrieving work items: ${error}`);
        console.error(error);
    }
    return { count: 0, value: [] };

    async function loadWorkItemPart(wiIds: number[], connection: AzDevOpsConnection, orgUrl: string): Promise<any[]> {
        let bodyWIDetails = {
            "fields": ["System.Id", "System.Title", "System.State", "System.WorkItemType", "System.AssignedTo"],
            "ids": wiIds
        };
        // https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/get-work-items-batch?view=azure-devops-rest-7.1&tabs=HTTP
        let workItemsPart: { count: number; value: any[]; } = await connection.post(`${orgUrl}/_apis/wit/workitemsbatch?api-version=6.0`, bodyWIDetails);
        return workItemsPart.value;
    }
}

function sortWorkItems(a: any, b: any): number {
    const orderOfStates = sortOrderOfWorkItemState();
    const indexOfA = orderOfStates.indexOf(a.fields["System.State"]);
    const indexOfB = orderOfStates.indexOf(b.fields["System.State"]);
    if (indexOfA !== -1 && indexOfB === -1) { return -1; }
    else if (indexOfA === -1 && indexOfB !== -1) { return 1; }
    else if (indexOfA !== -1 && indexOfB !== -1 && indexOfA !== indexOfB) { return indexOfA - indexOfB; }
    else if (indexOfA === -1 && indexOfB === -1 && indexOfA !== indexOfB) { return a.fields["System.State"].localeCompare(b.fields["System.State"]); }
    return a.fields["System.Title"].localeCompare(b.fields["System.Title"]);
}

function mapDevOpsWorkItemTypeToThemeIcon(devOpsIcon: string): vscode.ThemeIcon {
    switch (devOpsIcon) {
        case 'icon_list': return new vscode.ThemeIcon("list-flat");
        case 'icon_book': return new vscode.ThemeIcon("book");
        case 'icon_sticky_note': return new vscode.ThemeIcon("note");
        case 'icon_clipboard': return new vscode.ThemeIcon("output");
        case 'icon_insect': return new vscode.ThemeIcon("bug");
        case 'icon_chat_bubble': return new vscode.ThemeIcon("comment-discussion");
        case 'icon_flame': return new vscode.ThemeIcon("flame");
        case 'icon_megaphone': return new vscode.ThemeIcon("megaphone");
        case 'icon_chart': return new vscode.ThemeIcon("graph-line");
        case 'icon_key': return new vscode.ThemeIcon("key");
        case 'icon_diamond': return new vscode.ThemeIcon("ruby");
        case 'icon_asterisk': return new vscode.ThemeIcon("star-full");
        case 'icon_government': return new vscode.ThemeIcon("law");
        case 'icon_parachute': return new vscode.ThemeIcon("lightbulb");
        case 'icon_palette': return new vscode.ThemeIcon("symbol-color");
        case 'icon_gear': return new vscode.ThemeIcon("gear");
        case 'icon_check_box': return new vscode.ThemeIcon("pass");
        case 'icon_gift': return new vscode.ThemeIcon("gift");
        case 'icon_test_beaker': return new vscode.ThemeIcon("beaker");
        case 'icon_broken_lightbulb': return new vscode.ThemeIcon("lightbulb");
        case 'icon_github': return new vscode.ThemeIcon("github");
        case 'icon_pull_request': return new vscode.ThemeIcon("git-pull-request");
        case 'icon_github_issue': return new vscode.ThemeIcon("info");
        default: return new vscode.ThemeIcon("question");
    }
}

export async function getQueries(project: Project): Promise<Query[]> {
    let closedFilter = "";
    for (const closedState of hideWorkItemsWithState()) {
        closedFilter += ` AND [System.State] <> '${closedState}' `;
    }
    let defaultFilter = "[System.TeamProject] = @project AND [System.WorkItemType] IN ('User Story','Bug','Task')";
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
                    let remoteRepo = await getAzureDevOpsConnection().get(`${this.parent.parent.url}/_apis/git/repositories/${remoteRepoName}?api-version=5.1-preview.1`);
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
                    await getAzureDevOpsConnection().patch(`${this.parent.parent.parent.url}/_apis/wit/workItems/${this.wiId}?api-version=4.0-preview`, [wiLink], "application/json-patch+json");
                    vscode.window.showInformationMessage(`Created branch ${newBranch} and linked it to work item ${this.wiId}`);
                } else {
                    vscode.window.showErrorMessage("No upstream branch found. This functionality only works with an upstream branch.");
                }
            }
        }
    }
}