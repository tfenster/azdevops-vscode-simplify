import { AccessToken } from "@azure/core-auth";
import axios, { AxiosRequestConfig } from "axios";
import * as vscode from 'vscode';
import { getAzureAccountExtension } from "./helpers";

export class AzDevOpsConnection {
    private static memberId: string | undefined;
    private static token: AccessToken | undefined;

    public async getMemberId(): Promise<string | undefined> {
        try {
            // https://learn.microsoft.com/en-us/rest/api/azure/devops/profile/profiles/get?view=azure-devops-rest-7.1&tabs=HTTP
            const memberIdData = await this.get('https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=6.0');
            if (!memberIdData) {
                return undefined;
            }
            AzDevOpsConnection.memberId = memberIdData.id;
        } catch (error) {
            console.error(error);
            vscode.window.showErrorMessage(`Unexpected error when trying to retrieve your member id: ${error}`);
        }
        return AzDevOpsConnection.memberId;
    }

    private async getToken(): Promise<AccessToken | undefined> {
        if (AzDevOpsConnection.token === undefined || AzDevOpsConnection.token.expiresOnTimestamp <= Date.now()) {
            var azureAccountExtensionApi = getAzureAccountExtension().getAzureAccountExtensionApi();
            if (azureAccountExtensionApi === undefined || !azureAccountExtensionApi.sessions.length
                || !azureAccountExtensionApi.sessions[0].credentials2) {
                vscode.window.showErrorMessage("The Azure login failed. Please try to run 'Azure: Sign Out' and 'Azure: Sign In' manually.");
                return undefined;
            }

            let newToken = await azureAccountExtensionApi.sessions[0].credentials2.getToken('https://management.core.windows.net//.default');
            if (!newToken) {
                vscode.window.showErrorMessage("The retrieval of a new authentication token for Azure failed. Please try to run 'Azure: Sign Out' and 'Azure: Sign In' manually.");
                return undefined;
            }
            AzDevOpsConnection.token = newToken;
        }

        return AzDevOpsConnection.token;
    }

    public async get(url: string): Promise<any | undefined> {
        return await this.call(url, "get");
    }

    public async post(url: string, body: any): Promise<any | undefined> {
        return await this.call(url, "post", body, "application/json");
    }

    public async patch(url: string, body: any, contentType: string = "application/json"): Promise<any | undefined> {
        return await this.call(url, "patch", body, contentType);
    }

    private async call(url: string, method: string, body: any | undefined = undefined, contentType: string | undefined = undefined): Promise<any | undefined> {
        try {
            let token = await this.getToken();
            if (token === undefined) {
                return undefined;
            }
            let axiosRequestConfig: AxiosRequestConfig = {
                headers: {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    "Authorization": `Bearer ${token?.token}`
                },
                url: url,
                method: method
            };

            if (body !== undefined) {
                axiosRequestConfig.data = JSON.stringify(body);
            }

            if (contentType !== undefined) {
                axiosRequestConfig.headers!["Content-Type"] = contentType;
            }

            const response = await axios(axiosRequestConfig);
            return response.data;
        } catch (error) {
            console.error(`method: ${method}, url: ${url}${body !== undefined ? `, body: ${JSON.stringify(body)}` : ""}${contentType !== undefined ? `, contentType: ${contentType}` : ""}`);
            console.error(error);
            throw error;
        }
    }
}