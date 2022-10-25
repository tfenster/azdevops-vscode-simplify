import { AccessToken } from "@azure/core-auth";
import { AzureExtensionApiProvider } from "@microsoft/vscode-azext-utils/api";
import axios from "axios";
import * as vscode from 'vscode';
import { AzureAccountExtensionApi } from "./azure-account.api";

export class Connection {
    private static memberId: string | undefined;
    private static token: AccessToken | undefined;
    private static azureAccountExtensionApi: AzureAccountExtensionApi;

    constructor() {
        if (Connection.azureAccountExtensionApi === undefined) {
            Connection.azureAccountExtensionApi = <AzureAccountExtensionApi>(<AzureExtensionApiProvider>vscode.extensions.getExtension('ms-vscode.azure-account')!.exports).getApi('1.0.0');
        }
    }

    public getAzureAccountExtensionApi(): AzureAccountExtensionApi {
        return Connection.azureAccountExtensionApi;
    }

    public async getMemberId(): Promise<string | undefined> {
        if (Connection.memberId === undefined) {
            const memberIdData = await this.get('https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=6.0');
            if (!memberIdData) {
                return undefined;
            }
            Connection.memberId = memberIdData.id;
        }
        return Connection.memberId;
    }

    private async getToken(): Promise<AccessToken | undefined> {
        if (Connection.token === undefined || Connection.token.expiresOnTimestamp <= Date.now()) {
            let newToken = await Connection.azureAccountExtensionApi.sessions[0].credentials2.getToken('https://management.core.windows.net//.default');
            if (!newToken) {
                return undefined;
            }
            Connection.token = newToken;
        }

        return Connection.token;
    }

    public async get(url: string): Promise<any | undefined> {
        try {
            let token = await this.getToken();
            const response = axios.get(url, {
                headers: {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    "Authorization": `Bearer ${token?.token}`
                }
            });
            return (await response).data;
        } catch (error) {
            vscode.window.showErrorMessage(`An unexpected error occurred during a get request to the backend: ${error}`);
            console.error(error);
            console.error(`url: ${url}`);
            return undefined;
        }
    }

    public async post(url: string, body: any): Promise<any | undefined> {
        try {
            let token = await this.getToken();
            const response = axios.post(url, JSON.stringify(body), {
                headers: {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    "Authorization": `Bearer ${token?.token}`,
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    "Content-Type": "application/json"
                }
            });
            return (await response).data;
        } catch (error) {
            vscode.window.showErrorMessage(`An unexpected error occurred during a post request to the backend: ${error}`);
            console.error(error);
            console.error(`url: ${url}, body: ${JSON.stringify(body)}`);
            return undefined;
        }
    }
}