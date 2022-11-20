import { AccessToken } from "@azure/core-auth";
import { AzureExtensionApiProvider } from "@microsoft/vscode-azext-utils/api";
import axios from "axios";
import * as vscode from 'vscode';
import { AzureAccountExtensionApi } from "./types/azure-account.api";

export class AzDevOpsConnection {
    private static memberId: string | undefined;
    private static token: AccessToken | undefined;
    private static azureAccountExtensionApi: AzureAccountExtensionApi;

    constructor() {
        if (AzDevOpsConnection.azureAccountExtensionApi === undefined) {
            const azureAccountExtension = vscode.extensions.getExtension<AzureExtensionApiProvider>("ms-vscode.azure-account");
            if (azureAccountExtension) {
                AzDevOpsConnection.azureAccountExtensionApi = azureAccountExtension.exports.getApi('1.0.0');
            } else {
                vscode.window.showErrorMessage("Azure Account extension not found. This extension is required for the full functionality of Azure DevOps Simplify.");
            }
        }
    }

    public getAzureAccountExtensionApi(): AzureAccountExtensionApi {
        return AzDevOpsConnection.azureAccountExtensionApi;
    }

    public async getMemberId(): Promise<string | undefined> {
        if (AzDevOpsConnection.memberId === undefined) {
            // https://learn.microsoft.com/en-us/rest/api/azure/devops/profile/profiles/get?view=azure-devops-rest-7.1&tabs=HTTP
            const memberIdData = await this.get('https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=6.0');
            if (!memberIdData || !memberIdData.responseData || !memberIdData.responseData.id) {
                return undefined;
            }
            AzDevOpsConnection.memberId = memberIdData.responseData.id;
        }
        return AzDevOpsConnection.memberId;
    }

    private async getToken(): Promise<AccessToken | undefined> {
        if (AzDevOpsConnection.token === undefined || AzDevOpsConnection.token.expiresOnTimestamp <= Date.now()) {
            if (AzDevOpsConnection.azureAccountExtensionApi === undefined || !AzDevOpsConnection.azureAccountExtensionApi.sessions.length
                || !AzDevOpsConnection.azureAccountExtensionApi.sessions[0].credentials2) {
                vscode.window.showErrorMessage("The Azure login failed. Please try to run 'Azure: Sign Out' and 'Azure: Sign In' manually.");
                return undefined;
            }

            let newToken = await AzDevOpsConnection.azureAccountExtensionApi.sessions[0].credentials2.getToken('https://management.core.windows.net//.default');
            if (!newToken) {
                vscode.window.showErrorMessage("The retrieval of a new authentication token for Azure failed. Please try to run 'Azure: Sign Out' and 'Azure: Sign In' manually.");
                return undefined;
            }
            AzDevOpsConnection.token = newToken;
        }

        return AzDevOpsConnection.token;
    }

    public async get(url: string): Promise<{ responseData: any | undefined, authFailure: boolean }> {
        try {
            let token = await this.getToken();
            if (token === undefined) {
                return { responseData: undefined, authFailure: true };
            }
            const response = axios.get(url, {
                headers: {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    "Authorization": `Bearer ${token?.token}`
                }
            });
            return { responseData: (await response).data, authFailure: false };
        } catch (error) {
            vscode.window.showErrorMessage(`An unexpected error occurred during a get request to the backend: ${error}`);
            console.error(error);
            console.error(`url: ${url}`);
            return { responseData: undefined, authFailure: false };
        }
    }

    public async post(url: string, body: any): Promise<{ responseData: any | undefined, authFailure: boolean }> {
        try {
            let token = await this.getToken();
            if (token === undefined) {
                return { responseData: undefined, authFailure: true };
            }
            const response = axios.post(url, JSON.stringify(body), {
                headers: {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    "Authorization": `Bearer ${token?.token}`,
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    "Content-Type": "application/json"
                }
            });
            return { responseData: (await response).data, authFailure: false };
        } catch (error) {
            vscode.window.showErrorMessage(`An unexpected error occurred during a post request to the backend: ${error}`);
            console.error(error);
            console.error(`url: ${url}, body: ${JSON.stringify(body)}`);
            return { responseData: undefined, authFailure: false };
        }
    }

    public async patch(url: string, body: any, contentType: string = "application/json"): Promise<{ responseData: any | undefined, authFailure: boolean }> {
        try {
            let token = await this.getToken();
            if (token === undefined) {
                return { responseData: undefined, authFailure: true };
            }
            const response = axios.patch(url, JSON.stringify(body), {
                headers: {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    "Authorization": `Bearer ${token?.token}`,
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    "Content-Type": contentType
                }
            });
            return { responseData: (await response).data, authFailure: false };
        } catch (error) {
            vscode.window.showErrorMessage(`An unexpected error occurred during a patch request to the backend: ${error}`);
            console.error(error);
            console.error(`url: ${url}, body: ${JSON.stringify(body)}`);
            return { responseData: undefined, authFailure: false };
        }
    }
}