import * as vscode from 'vscode';
import { AzDevOpsConnection } from '../connection';
import { getAzureDevOpsConnection, getGitExtension, hideWorkItemsWithState, maxNumberOfWorkItems, showWorkItemTypes, sortOrderOfWorkItemState, useWorkitemIdInBranchName } from '../helpers';
import { Ref, RefType } from '../types/git';
import { Repository } from '../types/git';

interface IWorkItemType { name: string; devOpsIcon: string; referenceName?: string };
interface IWorkItem { id: string; fields: { [key: string]: string | any; }; themeIcon: vscode.ThemeIcon; }
const workItemTypesOfProjects: Map<string, IWorkItemType[]> = new Map();

export async function getOrganizations(): Promise<OrganizationTreeItem[]> {
    try {
        const repo = await getGitExtension().getRepo(false);
        let repoAnalysis: RepoAnalysis | undefined;
        if (repo) {
            repoAnalysis = analyzeGitRepo(repo);
        }

        let connection = getAzureDevOpsConnection();
        let memberId = await connection.getMemberId();
        if (memberId === undefined) {
            return [];
        }
        // https://learn.microsoft.com/en-us/rest/api/azure/devops/account/accounts/list?view=azure-devops-rest-7.1&tabs=HTTP
        let responseAccounts = await connection.get(`https://app.vssps.visualstudio.com/_apis/accounts?memberId=${memberId}&api-version=6.0-preview.1`);
        if (responseAccounts === undefined) {
            return [];
        }
        let orgs = new Array<OrganizationTreeItem>();
        await responseAccounts.value.forEach((account: any) => {
            let collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            if (account.accountName === repoAnalysis?.orgName) {
                collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
            }
            orgs.push(new OrganizationTreeItem(account.accountName, `https://dev.azure.com/${account.accountName}`, account.accountId, collapsibleState));
        });
        orgs.sort((a, b) => a.label.localeCompare(b.label));
        return orgs;
    } catch (error) {
        vscode.window.showErrorMessage(`An unexpected error occurred while retrieving organizations: ${error}`);
        console.error(error);
        return [];
    }
}

export async function getProjects(organization: OrganizationTreeItem): Promise<ProjectTreeItem[]> {
    const repo = await getGitExtension().getRepo(false);
    let repoAnalysis: RepoAnalysis | undefined;
    if (repo) {
        repoAnalysis = analyzeGitRepo(repo);
    }
    try {
        let connection = getAzureDevOpsConnection();
        // https://learn.microsoft.com/en-us/rest/api/azure/devops/core/projects/list?view=azure-devops-rest-7.1&tabs=HTTP
        let responseProjects = await connection.get(`${organization.url}/_apis/projects?api-version=6.0`);
        if (responseProjects === undefined) {
            return [];
        }
        let projects = new Array<ProjectTreeItem>();
        await responseProjects.value.forEach((project: any) => {
            let collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            if (project.name === repoAnalysis?.projectNameOrId) {
                collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
            }
            projects.push(new ProjectTreeItem(project.name, `${organization.url}/${project.id}`, project.id, organization,
                collapsibleState));
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
    const repo = await getGitExtension().getRepo();
    if (repo) {
        const repoAnalysis = analyzeGitRepo(repo);
        if (repoAnalysis) {
            const query = await createQueryString("", repoAnalysis.projectUrl);
            const workItems = await loadWorkItemObjects(query, repoAnalysis.orgUrl, repoAnalysis.projectUrl, false);
            const wiDetails: vscode.QuickPickItem[] = workItems.map((wi: IWorkItem) => {
                return {
                    label: `$(${wi.themeIcon.id}) ${wi.fields["System.Title"]}`,
                    description: `${wi.id}`,
                    detail: `Assigned to: ${(wi.fields["System.AssignedTo"] ? wi.fields["System.AssignedTo"].displayName : "")}`
                };
            });
            return wiDetails;
        }
    }
}

async function getWorkItemTypesOfProject(projectUrl: string): Promise<IWorkItemType[]> {
    const devOpsProcess: { typeId: string; } | undefined = await getDevOpsProcessOfProject(projectUrl);
    if (devOpsProcess) {
        return await getWorkItemTypesOfProcess(analyzeProjectUrl(projectUrl).orgUrl, devOpsProcess.typeId);
    }
    return [];
}
async function getWorkItemTypesOfProcess(orgUrl: string, processTypeId: string): Promise<IWorkItemType[]> {
    const connection = getAzureDevOpsConnection();
    // https://learn.microsoft.com/en-us/rest/api/azure/devops/processes/work-item-types/list?view=azure-devops-rest-7.1&tabs=HTTP
    const workItemTypes = await connection.get(`${orgUrl}/_apis/work/processes/${processTypeId}/workitemtypes?api-version=7.1-preview.2`);
    if (workItemTypes === undefined) {
        return [];
    }
    if (workItemTypes.value) {
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

async function getRelevantWorkItemTypesOfProject(projectUrl: string): Promise<IWorkItemType[]> {
    if (workItemTypesOfProjects.has(projectUrl)) {
        return workItemTypesOfProjects.get(projectUrl)!;
    }

    const orgUrl = analyzeProjectUrl(projectUrl).orgUrl;

    let defaultWorkItemTypeToIconMapping: IWorkItemType[] = [
        { name: 'User Story', devOpsIcon: 'icon_book' },
        { name: 'Bug', devOpsIcon: 'icon_insect' },
        { name: 'Task', devOpsIcon: 'icon_clipboard' }
    ];
    let workItemTypesOfProject: IWorkItemType[];
    const settingShowWorkItemTypes: string[] = showWorkItemTypes();
    try {
        const devOpsProcess: { typeId: string; } | undefined = await getDevOpsProcessOfProject(projectUrl);
        if (!devOpsProcess) { return []; }
        const customWorkItemTypesSetUpInDevOps: IWorkItemType[] = await getWorkItemTypesOfProcess(orgUrl, devOpsProcess.typeId);
        if (settingShowWorkItemTypes.length > 0) {
            workItemTypesOfProject = enrichWorkItemTypeNamesWithIcons(settingShowWorkItemTypes, customWorkItemTypesSetUpInDevOps);
        } else {
            workItemTypesOfProject = await getRelevantWorkItemsBasedOnDevOps(customWorkItemTypesSetUpInDevOps, orgUrl, devOpsProcess.typeId);
        }
    } catch {
        if (settingShowWorkItemTypes.length > 0) {
            workItemTypesOfProject = enrichWorkItemTypeNamesWithIcons(settingShowWorkItemTypes, defaultWorkItemTypeToIconMapping);
        } else {
            workItemTypesOfProject = defaultWorkItemTypeToIconMapping;
        }
    }
    workItemTypesOfProjects.set(projectUrl, workItemTypesOfProject);
    return workItemTypesOfProject;

    function enrichWorkItemTypeNamesWithIcons(settingShowWorkItemTypeNames: string[], workItemTypes: IWorkItemType[]): IWorkItemType[] {
        const returnWorkItemTypes: IWorkItemType[] = [];
        for (const settingShowWorkItemTypeName of settingShowWorkItemTypeNames) {
            const workItemType: IWorkItemType | undefined = workItemTypes.find(entry => entry.name === settingShowWorkItemTypeName);
            if (workItemType) {
                returnWorkItemTypes.push(workItemType);
            } else {
                returnWorkItemTypes.push({
                    name: settingShowWorkItemTypeName,
                    devOpsIcon: 'icon_github_issue'
                });
            }
        }
        return returnWorkItemTypes;
    }
    async function getRelevantWorkItemsBasedOnDevOps(workItemTypes: IWorkItemType[], orgUrl: string, devOpsProcessTypeId: string) {
        const relevantWorkItemTypes: { name: string; devOpsIcon: string }[] = [];
        const bugWorkItemType: IWorkItemType | undefined = workItemTypes.find(entry => entry.name === "Bug");
        if (bugWorkItemType) {
            relevantWorkItemTypes.push(bugWorkItemType);
        }

        const connection = getAzureDevOpsConnection();
        const checkWorkItemPromises: Promise<{ workItemType: IWorkItemType; isRelevant: boolean; }>[] = [];
        for (const workItemType of workItemTypes) {
            checkWorkItemPromises.push(checkIsRelevantWorkItemTypeOfProject(connection, orgUrl, devOpsProcessTypeId, workItemType));
        }
        const checkedworkItems = await Promise.all(checkWorkItemPromises);
        for (const checkedWorkItem of checkedworkItems) {
            if (checkedWorkItem.isRelevant) {
                relevantWorkItemTypes.push(checkedWorkItem.workItemType);
            }
        }
        return relevantWorkItemTypes;
    }
}
async function checkIsRelevantWorkItemTypeOfProject(connection: AzDevOpsConnection, orgUrl: string, devOpsProcessTypeId: string, workItemType: IWorkItemType): Promise<{ workItemType: IWorkItemType, isRelevant: boolean }> {
    let isRelevant = false;
    if (workItemType.referenceName) {
        // https://learn.microsoft.com/en-us/rest/api/azure/devops/processes/work-item-types-behaviors/list?view=azure-devops-rest-7.1&tabs=HTTP
        const workItemTypeBehaviors = await connection.get(`${orgUrl}/_apis/work/processes/${devOpsProcessTypeId}/workitemtypesbehaviors/${workItemType.referenceName}/behaviors?api-version=7.1-preview.1`);
        if (workItemTypeBehaviors && workItemTypeBehaviors.value) {
            isRelevant = workItemTypeBehaviors.value.some((entry: any) => entry.behavior && ['System.TaskBacklogBehavior', 'System.RequirementBacklogBehavior'].includes(entry.behavior.id));
        }
    }
    return { workItemType, isRelevant };
}
async function getDevOpsProcessOfProject(projectUrl: string): Promise<{ typeId: string; } | undefined> {
    const projectUrlParts = analyzeProjectUrl(projectUrl);

    const connection = getAzureDevOpsConnection();
    // https://learn.microsoft.com/en-us/rest/api/azure/devops/processes/processes/list?view=azure-devops-rest-7.1&tabs=HTTP
    const devOpsProcesses = await connection.get(`${projectUrlParts.orgUrl}/_apis/work/processes?$expand=projects&api-version=7.1-preview.2`);
    if (devOpsProcesses === undefined) {
        return undefined;
    }
    if (devOpsProcesses.value) {
        const devOpsProcess: { typeId: string; } | undefined = devOpsProcesses.value.find((process: { typeId: string; projects: { id: string; name: string }[] | undefined; }) => {
            if (process.projects) { return process.projects.find((project: { id: string; name: string }) => [project.id, project.name].includes(projectUrlParts.projectNameOrId)); }
        });
        return devOpsProcess;
    }
    return undefined;
}

export async function getWorkItemTreeItems(queryTreeItem: QueryTreeItem): Promise<WorkItemTreeItem[]> {
    try {
        const workItems: IWorkItem[] = await loadWorkItemObjects(queryTreeItem.query, queryTreeItem.parent.parent.url, queryTreeItem.parent.url, true);
        const wiDetails = new Array<WorkItemTreeItem>();
        for (const wi of workItems) {
            wiDetails.push(new WorkItemTreeItem(wi.fields["System.Title"], `${queryTreeItem.id}-${wi.id}`, wi.id, queryTreeItem, `${queryTreeItem.parent.parent.url}/_workitems/edit/${wi.id}`, wi.fields["System.State"], wi.fields["System.WorkItemType"], (wi.fields["System.AssignedTo"] === undefined ? "no one" : wi.fields["System.AssignedTo"].displayName), wi.themeIcon, vscode.TreeItemCollapsibleState.None));
        }
        return wiDetails;
    } catch (error) {
        vscode.window.showErrorMessage(`An unexpected error occurred while retrieving work items: ${error}`);
        console.error(error);
        return [];
    }
}
async function loadWorkItemObjects(query: string, orgUrl: string, projectUrl: string, considerMaxNumberOfWorkItems: boolean): Promise<IWorkItem[]> {
    const workItems: IWorkItem[] = await loadWorkItems(query, orgUrl, projectUrl, considerMaxNumberOfWorkItems);
    const workItemTypes = await getWorkItemTypesOfProject(projectUrl);
    for (const workItem of workItems) {
        const workItemType = workItemTypes.find(entry => entry.name === workItem.fields["System.WorkItemType"])!;
        workItem.themeIcon = mapDevOpsWorkItemTypeToThemeIcon(workItemType.devOpsIcon);
    }
    return workItems;

    async function loadWorkItems(query: string, orgUrl: string, projectUrl: string, considerMaxNumberOfWorkItems: boolean): Promise<IWorkItem[]> {
        try {
            let connection = getAzureDevOpsConnection();
            let maxNumberOfWorkItemsParam = "";
            if (considerMaxNumberOfWorkItems) { maxNumberOfWorkItemsParam = `&$top=${maxNumberOfWorkItems()}`; }
            // https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/wiql/query-by-wiql?view=azure-devops-rest-7.1&tabs=HTTP
            let responseWIIds = await connection.post(`${projectUrl}/_apis/wit/wiql?api-version=6.0${maxNumberOfWorkItemsParam}`, { "query": query });
            if (responseWIIds === undefined) {
                return [];
            }
            let wiIds: number[] = responseWIIds.workItems?.map((wi: any) => <Number>wi.id);

            if (wiIds?.length > 0) {
                let workItemPromises: Promise<IWorkItem[]>[] = [];
                let skip = 0;
                let top = 200;
                do {
                    workItemPromises.push(loadWorkItemPart(wiIds.slice(skip, skip + top), connection, orgUrl));
                    skip += 200;
                } while (skip < wiIds.length);
                const resolvedWorkItemBlocks = await Promise.all<IWorkItem[]>(workItemPromises);
                let workItems: IWorkItem[] = [];
                for (const resolvedWorkItemBlock of resolvedWorkItemBlocks) { workItems = workItems.concat(resolvedWorkItemBlock); };
                workItems.sort(sortWorkItems);
                return workItems;
            }
        } catch (error) {
            vscode.window.showErrorMessage(`An unexpected error occurred while retrieving work items: ${error}`);
            console.error(error);
        }
        return [];

        async function loadWorkItemPart(wiIds: number[], connection: AzDevOpsConnection, orgUrl: string): Promise<IWorkItem[]> {
            let bodyWIDetails = {
                "fields": ["System.Id", "System.Title", "System.State", "System.WorkItemType", "System.AssignedTo"],
                "ids": wiIds
            };
            // https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/get-work-items-batch?view=azure-devops-rest-7.1&tabs=HTTP
            let workItemsPartResponse = await connection.post(`${orgUrl}/_apis/wit/workitemsbatch?api-version=6.0`, bodyWIDetails);
            if (workItemsPartResponse === undefined || workItemsPartResponse.value === undefined) {
                return [];
            }
            return workItemsPartResponse.value;
        }
    }
}

function analyzeProjectUrl(projectUrl: string): { orgUrl: string, orgName: string, projectNameOrId: string } {
    const urlParts = projectUrl.split('/');
    const projectNameOrId = decodeURI(urlParts.pop()!);
    const orgName = urlParts[urlParts.length - 1];
    const orgUrl = urlParts.join('/');
    return { orgUrl, orgName, projectNameOrId };
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

export async function getQueries(project: ProjectTreeItem): Promise<QueryTreeItem[]> {
    return [
        new QueryTreeItem("Assigned to me", `${project.id}-1`, project, await createQueryString("[System.AssignedTo] = @me", project.url), vscode.TreeItemCollapsibleState.Collapsed),
        new QueryTreeItem("Followed by me", `${project.id}-2`, project, await createQueryString("[System.Id] IN (@Follows)", project.url), vscode.TreeItemCollapsibleState.Collapsed),
        new QueryTreeItem("Recent activity by me", `${project.id}-3`, project, await createQueryString("[System.Id] IN (@MyRecentActivity)", project.url), vscode.TreeItemCollapsibleState.Collapsed),
        new QueryTreeItem("Recent activity in project", `${project.id}-4`, project, await createQueryString("[System.Id] IN (@RecentProjectActivity)", project.url), vscode.TreeItemCollapsibleState.Collapsed),
        new QueryTreeItem("Recently mentioned", `${project.id}-5`, project, await createQueryString("[System.Id] IN (@RecentMentions)", project.url), vscode.TreeItemCollapsibleState.Collapsed),
    ];
}
async function createQueryString(additionalFilter: string | undefined, projectUrl: string): Promise<string> {
    const relevantWorkItemTypes = await getRelevantWorkItemTypesOfProject(projectUrl);
    const filterWorkItemTypes = `${relevantWorkItemTypes.map((workItemType) => `'${workItemType.name}'`).join(',')}`;

    let query = `Select [System.Id] From WorkItems WHERE [System.TeamProject] = @project AND [System.WorkItemType] IN (${filterWorkItemTypes})`;
    for (const closedState of hideWorkItemsWithState()) {
        query += ` AND [System.State] <> '${closedState}'`;
    }
    if (additionalFilter) {
        query += ` AND ${additionalFilter}`;
    }
    query += " ORDER BY [System.ChangedDate] DESC";
    return query;
}

function analyzeGitRepo(repo: Repository): RepoAnalysis | undefined {
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
            const orgName = decodeURI(pathSegments[0]);
            const projectUrl = `${orgUrl}/${pathSegments[1]}`;
            const projectNameOrId = decodeURI(pathSegments[1]);
            const repoUrl = `${orgUrl}/${pathSegments[1]}/_git/${pathSegments[2]}`;
            const repoNameOrId = decodeURI(pathSegments[2]);
            return { orgName, projectNameOrId, repoNameOrId, orgUrl, projectUrl, repoUrl };
        } else {
            vscode.window.showErrorMessage(`Couldn't identify the Azure DevOps organization and project from the remote repository fetchUrl <${remoteRepoName}>.`);
        }
    } else {
        console.log(repo);
        console.log(repo.state.remotes);
        console.log(repo.state.remotes[0]);
        vscode.window.showErrorMessage("No remote with fetchUrl found. This function is only with repositories with remote fetchUrls.");
    }
    return undefined;
}

export interface RepoAnalysis {
    orgName: string,
    projectNameOrId: string,
    repoNameOrId: string,
    orgUrl: string,
    projectUrl: string,
    repoUrl: string
}

export class OrganizationTreeItem extends vscode.TreeItem {

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

export class ProjectTreeItem extends vscode.TreeItem {

    constructor(
        public readonly label: string,
        public readonly url: string,
        public readonly id: string,
        public readonly parent: OrganizationTreeItem,
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

export class QueryTreeItem extends vscode.TreeItem {

    constructor(
        public readonly label: string,
        public readonly id: string,
        public readonly parent: ProjectTreeItem,
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

export class WorkItemTreeItem extends vscode.TreeItem {

    constructor(
        public readonly label: string,
        public readonly id: string,
        public readonly wiId: string,
        public readonly parent: QueryTreeItem,
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
        const repo = await getGitExtension().getRepo();
        if (repo) {
            let repoAnalysis = analyzeGitRepo(repo);
            if (repoAnalysis) {
                let remoteRefs: string[] = await getRemoteRefs(this.parent.parent.url, repoAnalysis.repoNameOrId);
                const localRefs: string[] = repo.state.refs.filter(ref => ref.name !== undefined && ref.type !== RefType.RemoteHead).map(ref => ref.name!);
                const existingRefs = remoteRefs.concat(localRefs);
                const gitPrefix = vscode.workspace.getConfiguration('git').get('branchPrefix', "");
                let newBranch = await vscode.window.showInputBox({
                    prompt: "Please enter the name of the new branch",
                    value: `${gitPrefix !== "" ? `${gitPrefix}` : ""}${useWorkitemIdInBranchName() ? this.wiId : ""}`,
                    validateInput: (value: string) => {
                        const existingref = existingRefs.find(refName => refName.toLowerCase() === value.toLowerCase());
                        if (existingref) {
                            return `Branch ${existingref} already exists. Please choose another one`;
                        }
                        return undefined;
                    }
                });
                if (newBranch) {
                    if (repo.state.HEAD?.upstream && repo.state.remotes.length > 0 && repo.state.remotes[0].fetchUrl) {
                        // get substring after last slash
                        let remoteRepoName = repo.state.remotes[0].fetchUrl;
                        remoteRepoName = remoteRepoName.substring(remoteRepoName.lastIndexOf("/") + 1);
                        try {
                            let remoteRepo = await getAzureDevOpsConnection().get(`${this.parent.parent.url}/_apis/git/repositories/${remoteRepoName}?api-version=5.1-preview.1`);
                            if (remoteRepo === undefined) {
                                return;
                            }
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
                        } catch (error) {
                            vscode.window.showErrorMessage(`Failed to create branch ${newBranch} and/or link it to work item ${this.wiId}`);
                        }
                    } else {
                        vscode.window.showErrorMessage("No upstream branch found. This functionality only works with an upstream branch.");
                    }
                }
            }
        }

        async function getRemoteRefs(projectUrl: string, repo: string) {
            const listRefResponse = await getAzureDevOpsConnection().get(`${projectUrl}/_apis/git/repositories/${repo}/refs?api-version=7.0`);
            let remoteRefs: string[] = [];
            if (listRefResponse && listRefResponse.value && listRefResponse.value.length > 0) {
                listRefResponse.value.forEach((ref: { name: string; }) => {
                    if (ref.name.startsWith('refs/heads/')) {
                        remoteRefs.push(ref.name.substring('refs/heads/'.length));
                    }
                    if (ref.name.startsWith('refs/tags/')) {
                        remoteRefs.push(ref.name.substring('refs/tags/'.length));
                    }
                });
            }
            return remoteRefs;
        }
    }
}