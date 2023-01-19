import * as vscode from 'vscode';
import { AzureExtensionApiProvider } from "@microsoft/vscode-azext-utils/api";
import { AzureAccountExtensionApi } from "../types/azure-account.api";

export class AzureAccountExtension {
    private static azureAccountExtensionApi: AzureAccountExtensionApi;

    constructor() {
        if (AzureAccountExtension.azureAccountExtensionApi === undefined) {
            const azureAccountExtension = vscode.extensions.getExtension<AzureExtensionApiProvider>("ms-vscode.azure-account");
            if (azureAccountExtension) {
                AzureAccountExtension.azureAccountExtensionApi = azureAccountExtension.exports.getApi('1.0.0');
            } else {
                vscode.window.showErrorMessage("Azure Account extension not found. This extension is required for the full functionality of Azure DevOps Simplify.");
            }
        }
    }

    public getAzureAccountExtensionApi(): AzureAccountExtensionApi {
        return AzureAccountExtension.azureAccountExtensionApi;
    }
}